export type HistorySource = {
  id: string;
  name: string;
  type: "pdf" | "text";
  enabled: boolean;
  filePath: string | null;
  fileSize: number;
  pages?: number;
};

export type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HistoryPayload = {
  title: string;
  sources: HistorySource[];
  messages: HistoryMessage[];
  notes: string;
};

type ValidationResult =
  | { payload: HistoryPayload; error?: never }
  | { payload?: never; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const FILE_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/;

export function validateHistoryPayload(
  value: unknown,
  userId: string
): ValidationResult {
  if (!isRecord(value) || typeof value.title !== "string") {
    return { error: "Please send a valid chat." };
  }
  if (!Array.isArray(value.sources) || value.sources.length > 20) {
    return { error: "A chat can have at most 20 sources." };
  }
  if (!Array.isArray(value.messages) || value.messages.length > 200) {
    return { error: "A chat can have at most 200 messages." };
  }

  const sources: HistorySource[] = [];
  for (const item of value.sources) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !UUID_PATTERN.test(item.id) ||
      typeof item.name !== "string" ||
      (item.type !== "pdf" && item.type !== "text") ||
      typeof item.enabled !== "boolean" ||
      (item.pages !== undefined &&
        (typeof item.pages !== "number" ||
          !Number.isFinite(item.pages) ||
          item.pages < 0))
    ) {
      return { error: "Each source needs a valid ID, name, type, and enabled setting." };
    }

    sources.push({
      id: item.id,
      name: item.name.trim().slice(0, 120),
      type: item.type,
      enabled: item.enabled,
      filePath:
        typeof item.filePath === "string" &&
        item.filePath.length <= 200 &&
        FILE_PATH_PATTERN.test(item.filePath) &&
        item.filePath.startsWith(`${userId}/`) &&
        item.filePath.endsWith(`/${item.id}.pdf`)
          ? item.filePath
          : null,
      fileSize:
        typeof item.fileSize === "number" &&
        Number.isFinite(item.fileSize) &&
        item.fileSize >= 0
          ? item.fileSize
          : 0,
      ...(typeof item.pages === "number" ? { pages: item.pages } : {}),
    });
  }

  const messages: HistoryMessage[] = [];
  for (const item of value.messages) {
    if (
      !isRecord(item) ||
      (item.role !== "user" && item.role !== "assistant") ||
      typeof item.content !== "string"
    ) {
      return { error: "Each message needs a valid role and text." };
    }
    if (item.content !== "START_LESSON") {
      messages.push({
        role: item.role,
        content: item.content.slice(0, 20000),
      });
    }
  }

  const requestedTitle = value.title.trim().slice(0, 80);
  const fallbackTitle = sources[0]?.name.trim().slice(0, 80) || "Untitled chat";
  const title = requestedTitle || fallbackTitle;

  return { payload: { title, sources, messages, notes: "" } };
}
