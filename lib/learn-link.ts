export type LearnParams = {
  chatId: string;
  moduleName: string;
  pageStart: number | null;
  pageEnd: number | null;
  topic: string | null;
  taskId: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function buildLearnUrl(params: {
  chatId: string;
  moduleName: string;
  pageStart: number | null;
  pageEnd: number | null;
  topic: string | null;
  taskId: string | null;
}): string {
  const search = [
    `learn=${encodeURIComponent(params.chatId)}`,
    `module=${encodeURIComponent(params.moduleName)}`,
    `from=${encodeURIComponent(params.pageStart === null ? "" : String(params.pageStart))}`,
    `to=${encodeURIComponent(params.pageEnd === null ? "" : String(params.pageEnd))}`,
    `topic=${encodeURIComponent(params.topic ?? "")}`,
    `task=${encodeURIComponent(params.taskId ?? "")}`,
  ];
  return `/?${search.join("&")}`;
}

export function parseLearnParams(search: URLSearchParams): LearnParams | null {
  const chatId = search.get("learn");
  const moduleName = search.get("module");
  if (!chatId || !UUID_PATTERN.test(chatId) || !moduleName) {
    return null;
  }
  if (chatId.length > 200 || moduleName.length > 200) return null;

  const fromText = search.get("from");
  const toText = search.get("to");
  let pageStart: number | null = null;
  let pageEnd: number | null = null;

  if (fromText !== null && fromText !== "") {
    if (!/^\d+$/.test(fromText)) return null;
    pageStart = Number(fromText);
  }
  if (toText !== null && toText !== "") {
    if (!/^\d+$/.test(toText)) return null;
    pageEnd = Number(toText);
  }
  if (
    (pageStart !== null && (!Number.isInteger(pageStart) || pageStart < 1)) ||
    (pageEnd !== null && (!Number.isInteger(pageEnd) || pageEnd < 1))
  ) {
    return null;
  }
  if (
    (pageStart !== null && pageEnd === null) ||
    (pageStart === null && pageEnd !== null) ||
    (pageStart !== null && pageEnd !== null && pageStart > pageEnd)
  ) {
    return null;
  }

  const topicText = search.get("topic");
  const taskText = search.get("task");
  const topic =
    topicText !== null && topicText.trim() !== ""
      ? topicText.slice(0, 200)
      : null;
  const taskId =
    taskText !== null && taskText.trim() !== ""
      ? taskText.slice(0, 200)
      : null;
  if ((topicText !== null && topicText.length > 200) || (taskText !== null && taskText.length > 200)) {
    return null;
  }

  return {
    chatId,
    moduleName: moduleName.slice(0, 200),
    pageStart,
    pageEnd,
    topic,
    taskId,
  };
}
