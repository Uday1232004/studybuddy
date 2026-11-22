"use client";

type Props = {
  notes: string;
  onNotesChange: (notes: string) => void;
  onGenerate: () => void;
  loading: boolean;
  error: string;
  summary: string[] | null;
};

export default function Workspace({
  notes,
  onNotesChange,
  onGenerate,
  loading,
  error,
  summary,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-8 sm:px-10">
      <p className="text-sm text-[var(--muted)]">Workspace</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your notes</h1>
      <textarea
        aria-label="Your notes"
        placeholder="Paste your notes here..."
        value={notes}
        onChange={(event) => onNotesChange(event.target.value)}
        className="mt-6 min-h-48 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      />
      <button
        type="button"
        onClick={onGenerate}
        disabled={loading}
        aria-live="polite"
        className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--bg)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Working..." : "Create study kit"}
      </button>

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-[var(--bad)] bg-[var(--bad-bg)] p-3 text-sm text-[var(--bad)]"
        >
          {error}
        </div>
      )}

      <section aria-live="polite" className="mt-8">
        <h2 className="text-lg font-semibold">Summary</h2>
        {loading ? (
          <div className="mt-4 space-y-3 rounded-lg border border-[var(--border)] p-5 animate-pulse">
            <div className="h-3 w-5/6 rounded bg-[var(--surface-hover)]" />
            <div className="h-3 w-full rounded bg-[var(--surface-hover)]" />
            <div className="h-3 w-2/3 rounded bg-[var(--surface-hover)]" />
          </div>
        ) : summary ? (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <ul className="list-disc space-y-3 pl-5 text-sm leading-6">
              {summary.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Paste notes and create a study kit to see your summary here
          </p>
        )}
      </section>
    </div>
  );
}
