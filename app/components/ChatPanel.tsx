"use client";

import {
  type ChangeEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  hidden?: boolean;
};

type Props = {
  notes: string;
  onPdfFileSelect: (file: File) => void;
  pdfFileName?: string;
  uploadingPdf: boolean;
  onDismissPdf: () => void;
};

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike =
  ArrayLike<SpeechRecognitionAlternativeLike> & { isFinal: boolean };

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorLike = {
  error: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const SUGGESTIONS = [
  "Start with the most important topic",
  "Explain the hardest part simply",
  "Give me a 5 mark exam answer",
  "Quiz me, one question at a time",
];

function subscribeToSpeechSupport() {
  return () => {};
}

function hasSpeechSupport() {
  if (typeof window === "undefined") return false;
  const speechWindow = window as SpeechRecognitionWindow;
  return Boolean(
    speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
  );
}

function appendTranscript(existing: string, addition: string) {
  const left = existing.trimEnd();
  const right = addition.trim();
  if (left === "") return right;
  if (right === "") return left;
  return `${left} ${right}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getError(data: unknown): { message: string; detail: string } {
  return {
    message:
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : "The teacher could not answer. Try again.",
    detail:
      isRecord(data) && typeof data.detail === "string" ? data.detail : "",
  };
}

export default function ChatPanel({
  notes,
  onPdfFileSelect,
  pdfFileName,
  uploadingPdf,
  onDismissPdf,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeNotes, setActiveNotes] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [readingMaterial, setReadingMaterial] = useState(false);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [listening, setListening] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState("en-IN");
  const [speechPreview, setSpeechPreview] = useState("");
  const [speechError, setSpeechError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const newestMessageRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerOptionsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const speechBaseRef = useRef("");
  const speechFinalRef = useRef("");
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechLanguageRef = useRef(speechLanguage);
  const speechSupported = useSyncExternalStore(
    subscribeToSpeechSupport,
    hasSpeechSupport,
    () => false
  );

  const visibleMessages =
    activeNotes === notes
      ? messages.filter((message) => !message.hidden)
      : [];
  const hasTeacherReply = visibleMessages.some(
    (message) => message.role === "assistant"
  );

  useEffect(() => {
    newestMessageRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, readingMaterial]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [input, listening]);

  useEffect(() => {
    if (!menuOpen) return;

    function handleOutsideClick(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !composerOptionsRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, [menuOpen]);

  useEffect(
    () => () => {
      shouldListenRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try {
          recognition.abort();
        } catch {
          recognition.stop();
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();

    if (notes.trim() === "") {
      return () => controller.abort();
    }

    const timeout = setTimeout(async () => {
      const starterMessage: ChatMessage = {
        role: "user",
        content: "START_LESSON",
        hidden: true,
      };
      setActiveNotes(notes);
      setMessages([starterMessage]);
      setInput("");
      setError("");
      setErrorDetail("");
      setLoading(true);
      setReadingMaterial(true);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes,
            messages: [{ role: "user", content: "START_LESSON" }],
          }),
          signal: controller.signal,
        });
        const data: unknown = await response.json();

        if (!response.ok) {
          const result = getError(data);
          setError(result.message);
          setErrorDetail(result.detail);
          return;
        }
        if (!isRecord(data) || typeof data.reply !== "string") {
          setError("The teacher could not answer. Try again.");
          return;
        }

        setMessages([
          starterMessage,
          { role: "assistant", content: data.reply },
        ]);
      } catch {
        if (!controller.signal.aborted) {
          setError("The teacher could not answer. Try again.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setReadingMaterial(false);
        }
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [notes]);

  function stopSpeechRecognition() {
    shouldListenRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        recognition.stop();
      }
    }
    setListening(false);
    setSpeechPreview("");
    speechFinalRef.current = "";
  }

  function startRecognitionSession() {
    if (!shouldListenRef.current) return;

    const speechWindow = window as SpeechRecognitionWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      shouldListenRef.current = false;
      setListening(false);
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.lang = speechLanguageRef.current;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognitionRef.current = recognition;

      recognition.onresult = (event) => {
        if (recognitionRef.current !== recognition) return;
        let interimText = "";
        let finalText = "";
        for (
          let index = event.resultIndex;
          index < event.results.length;
          index++
        ) {
          const result = event.results[index];
          const transcript = result?.[0]?.transcript ?? "";
          if (result?.isFinal) {
            finalText = appendTranscript(finalText, transcript);
          } else {
            interimText = appendTranscript(interimText, transcript);
          }
        }
        speechFinalRef.current = appendTranscript(
          speechFinalRef.current,
          finalText
        );
        setSpeechPreview(
          appendTranscript(speechFinalRef.current, interimText)
        );
      };
      recognition.onerror = (event) => {
        if (event.error === "no-speech") return;
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        shouldListenRef.current = false;
        setListening(false);
        setSpeechError(
          event.error === "not-allowed" ||
            event.error === "service-not-allowed"
            ? "Microphone is blocked. Allow it in the browser address bar."
            : "Could not use the microphone. Check its permissions and try again."
        );
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        if (!shouldListenRef.current) return;
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          startRecognitionSession();
        }, 250);
      };
      recognition.start();
    } catch {
      recognitionRef.current = null;
      shouldListenRef.current = false;
      setListening(false);
      setSpeechError(
        "Could not use the microphone. Check its permissions and try again."
      );
    }
  }

  function beginSpeechRecognition() {
    if (listening) return;
    speechBaseRef.current = input;
    speechFinalRef.current = "";
    shouldListenRef.current = true;
    setSpeechPreview("");
    setSpeechError("");
    setListening(true);
    startRecognitionSession();
  }

  function acceptSpeech() {
    const spokenText = speechPreview.trim();
    const existingText = speechBaseRef.current;
    stopSpeechRecognition();
    if (spokenText !== "") {
      setInput((currentInput) =>
        appendTranscript(currentInput || existingText, spokenText)
      );
    }
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function cancelSpeech() {
    stopSpeechRecognition();
  }

  function handlePdfChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onPdfFileSelect(file);
    event.target.value = "";
    setMenuOpen(false);
  }

  async function sendMessage(message = input) {
    const content = message.trim();
    if (
      content === "" ||
      loading ||
      notes.trim() === "" ||
      activeNotes !== notes
    ) {
      return;
    }

    stopSpeechRecognition();
    const studentMessage: ChatMessage = { role: "user", content };
    const updatedMessages = [...messages, studentMessage];
    setMessages(updatedMessages);
    setInput("");
    setError("");
    setErrorDetail("");
    setLoading(true);
    setReadingMaterial(false);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes,
          messages: updatedMessages.map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
        }),
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        const result = getError(data);
        setError(result.message);
        setErrorDetail(result.detail);
        return;
      }
      if (!isRecord(data) || typeof data.reply !== "string") {
        setError("The teacher could not answer. Try again.");
        return;
      }

      setMessages([
        ...updatedMessages,
        { role: "assistant", content: data.reply },
      ]);
    } catch {
      setError("The teacher could not answer. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-10 flex h-[500px] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="shrink-0 border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-lg font-bold">Chat with your teacher</h2>
      </header>
      <div
        aria-live="polite"
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
      >
        {visibleMessages.length === 0 ? (
          <div className="flex min-h-full items-center justify-center py-6 text-center">
            <p className="max-w-md text-base leading-7 text-[var(--muted)]">
              {notes.trim() === ""
                ? "Upload a PDF or paste notes, and your teacher will get ready."
                : activeNotes !== notes
                  ? "Your teacher is getting ready..."
                  : readingMaterial
                    ? "Teacher is reading your material..."
                    : "Your teacher is getting ready..."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleMessages.map((message, index) => (
              <div
                key={`${index}-${message.role}`}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" ? (
                  <div className="w-full max-w-[720px] rounded-2xl bg-[var(--surface)] px-5 py-4 text-base text-[var(--text)]">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h2: ({ children }) => (
                          <h2 className="mt-6 text-lg font-bold leading-7 first:mt-0">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="mt-5 text-base font-bold leading-7">
                            {children}
                          </h3>
                        ),
                        p: ({ children }) => (
                          <p className="my-3 leading-7">{children}</p>
                        ),
                        ul: ({ children }) => (
                          <ul className="my-3 list-disc space-y-2 pl-6">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="my-3 list-decimal space-y-2 pl-6">
                            {children}
                          </ol>
                        ),
                        li: ({ children }) => (
                          <li className="pl-1 leading-7">{children}</li>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-bold">{children}</strong>
                        ),
                        table: ({ children }) => (
                          <div className="my-4 max-w-full overflow-x-auto">
                            <table className="w-full border-collapse text-left text-sm">
                              {children}
                            </table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th className="border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2 font-semibold">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="border border-[var(--border)] px-3 py-2">
                            {children}
                          </td>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p
                    style={{ whiteSpace: "pre-wrap" }}
                    className="max-w-[85%] rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm leading-6 text-[var(--on-accent)]"
                  >
                    {message.content}
                  </p>
                )}
              </div>
            ))}
            {loading && (
              <p className="text-sm text-[var(--muted)]">
                {readingMaterial
                  ? "Teacher is reading your material..."
                  : "Teacher is thinking..."}
              </p>
            )}
          </div>
        )}
        <div ref={newestMessageRef} />
      </div>

      {error && (
        <div className="shrink-0 px-5 pt-2">
          <p role="alert" className="text-sm text-[var(--bad)]">
            {error}
          </p>
          {errorDetail && (
            <p className="mt-1 text-xs text-[var(--muted)]">{errorDetail}</p>
          )}
        </div>
      )}

      {hasTeacherReply && (
        <div className="flex shrink-0 flex-nowrap gap-2 overflow-x-auto px-5 pt-3">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void sendMessage(suggestion)}
              disabled={loading}
              className="shrink-0 whitespace-nowrap rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div className="shrink-0 px-4 pb-4 pt-3">
        <div className="relative" ref={composerOptionsRef}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handlePdfChange}
            className="sr-only"
            tabIndex={-1}
          />
          {menuOpen && (
            <div
              role="dialog"
              aria-label="Composer options"
              className="absolute bottom-full left-0 z-10 mb-2 w-72 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPdf}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{uploadingPdf ? "Reading PDF..." : "Attach PDF"}</span>
              </button>
              <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                <span className="text-sm text-[var(--text)]">Voice language</span>
                <select
                  aria-label="Voice language"
                  value={speechLanguage}
                  onChange={(event) => {
                    const language = event.target.value;
                    if (
                      language === "en-IN" ||
                      language === "en-US" ||
                      language === "hi-IN"
                    ) {
                      speechLanguageRef.current = language;
                      setSpeechLanguage(language);
                    }
                  }}
                  className="max-w-36 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  <option value="en-IN">English (India)</option>
                  <option value="en-US">English (US)</option>
                  <option value="hi-IN">Hindi</option>
                </select>
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg)] p-3 shadow-sm focus-within:border-[var(--accent)]">
            {pdfFileName && (
              <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text)]">
                <svg
                  viewBox="0 0 20 20"
                  className="size-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="M5 2.75h6l4 4v10.5H5z" />
                  <path d="M11 2.75v4h4M7.5 10h5M7.5 13h5" />
                </svg>
                <span className="min-w-0 max-w-56 truncate">{pdfFileName}</span>
                <button
                  type="button"
                  onClick={onDismissPdf}
                  aria-label="Remove attached PDF"
                  className="grid size-5 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="m5 5 10 10M15 5 5 15" />
                  </svg>
                </button>
              </div>
            )}

            {listening ? (
              <div className="flex min-h-16 items-center gap-3 px-1 py-2">
                <div
                  className="flex h-8 shrink-0 items-center gap-1"
                  aria-hidden="true"
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((bar, index) => (
                    <span
                      key={bar}
                      className="w-1 rounded-full bg-[var(--accent)] animate-pulse"
                      style={{
                        height: `${12 + (index % 3) * 5}px`,
                        animationDelay: `${index * 100}ms`,
                      }}
                    />
                  ))}
                </div>
                <p className="max-h-20 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">
                  {speechPreview || "Listening..."}
                </p>
                <button
                  type="button"
                  onClick={acceptSpeech}
                  aria-label="Accept dictated text"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="m4 10 4 4 8-8" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={cancelSpeech}
                  aria-label="Cancel dictation"
                  className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="m5 5 10 10M15 5 5 15" />
                  </svg>
                </button>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                aria-label="Message your teacher"
                placeholder="Ask your teacher anything..."
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                className="max-h-40 min-h-10 w-full resize-none overflow-y-auto bg-transparent px-1 py-2 text-sm leading-6 text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-none"
              />
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="Open attachment and voice options"
                aria-expanded={menuOpen}
                className="grid size-9 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <svg
                  viewBox="0 0 20 20"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M10 4v12M4 10h12" />
                </svg>
              </button>

              <div className="flex items-center gap-2">
                {speechSupported && (
                  <button
                    type="button"
                    onClick={beginSpeechRecognition}
                    disabled={listening}
                    aria-label="Start voice input"
                    aria-pressed={listening}
                    className={`grid size-9 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-default ${
                      listening
                        ? "bg-[var(--bad)] text-white"
                        : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                    }`}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="size-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      aria-hidden="true"
                    >
                      <rect x="7" y="2.5" width="6" height="10" rx="3" />
                      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5M7.5 17.5h5" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={
                    loading ||
                    input.trim() === "" ||
                    notes.trim() === "" ||
                    activeNotes !== notes
                  }
                  aria-label="Send message"
                  className="grid size-10 place-items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="size-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        {speechError && (
          <p className="px-2 pt-2 text-xs text-[var(--muted)]">{speechError}</p>
        )}
      </div>
    </section>
  );
}
