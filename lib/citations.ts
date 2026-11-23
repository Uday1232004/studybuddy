export type CitationSource = {
  id: string;
  name: string;
  pages?: number;
};

export type ExtractedCitation = {
  sourceId: string;
  page: number;
};

function normalizeName(name: string) {
  return name
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.(?:pdf|txt|docx?|pptx?|epub)$/i, "")
    .trim();
}

function findSource(label: string, sources: CitationSource[]) {
  const normalizedLabel = normalizeName(label);
  if (normalizedLabel === "") {
    return sources.length === 1 ? sources[0] : undefined;
  }

  const normalizedSources = sources.map((source) => ({
    source,
    name: normalizeName(source.name),
  }));
  const exact = normalizedSources.find(
    ({ name }) => name === normalizedLabel
  );
  if (exact) return exact.source;

  return normalizedSources
    .filter(({ name }) => name.startsWith(normalizedLabel))
    .sort((left, right) => right.name.length - left.name.length)[0]?.source;
}

export function extractCitations(
  text: string,
  sources: CitationSource[]
): ExtractedCitation[] {
  const citations: ExtractedCitation[] = [];
  const seen = new Set<string>();
  const blocks = text.matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g);

  for (const block of blocks) {
    const content = block[1] ?? block[2] ?? "";
    for (const item of content.split(";")) {
      const match = /^(.*?)\s*,?\s*pp?\.\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*$/i.exec(
        item.trim()
      );
      if (!match) continue;

      const label = match[1].trim().replace(/,\s*$/, "");
      const source = findSource(label, sources);
      if (!source || !Number.isFinite(source.pages)) continue;

      const firstPage = Number(match[2]);
      const lastPage = match[3] ? Number(match[3]) : firstPage;
      const pageCount = Math.floor(source.pages ?? 0);
      if (!Number.isInteger(firstPage) || !Number.isInteger(lastPage)) continue;

      for (
        let page = firstPage;
        page <= lastPage && page <= pageCount && citations.length < 8;
        page++
      ) {
        if (page < 1) continue;
        const key = `${source.id}:${page}`;
        if (seen.has(key)) continue;
        seen.add(key);
        citations.push({ sourceId: source.id, page });
      }
      if (citations.length >= 8) return citations;
    }
  }

  return citations;
}
