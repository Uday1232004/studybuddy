export type CitationSource = {
  id: string;
  name: string;
  pages?: number;
};

export type ExtractedCitation = {
  sourceId: string;
  page: number;
};

type CitationBlock = {
  start: number;
  content: string;
};

function normalize(value: string) {
  return value
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u00ad/g, "")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(name: string) {
  return normalize(name)
    .toLowerCase()
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

function findCitationBlocks(text: string): CitationBlock[] {
  const stack: { bracket: "(" | "["; start: number }[] = [];
  const blocks: CitationBlock[] = [];

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === "(" || character === "[") {
      stack.push({ bracket: character, start: index });
      continue;
    }

    const expectedOpening = character === ")" ? "(" : character === "]" ? "[" : null;
    const opening = stack[stack.length - 1];
    if (expectedOpening && opening?.bracket === expectedOpening) {
      stack.pop();
      blocks.push({
        start: opening.start,
        content: text.slice(opening.start + 1, index),
      });
    }
  }

  return blocks.sort((left, right) => left.start - right.start);
}

function parsePageList(value: string) {
  if (!/^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/.test(value)) {
    return [];
  }

  return value.match(/\d+(?:\s*-\s*\d+)?/g) ?? [];
}

export function extractCitations(
  text: string,
  sources: CitationSource[]
): ExtractedCitation[] {
  const normalizedText = normalize(text);
  const normalizedSources = sources.map((source) => ({
    ...source,
    name: normalize(source.name),
  }));
  const citations: ExtractedCitation[] = [];
  const seen = new Set<string>();

  for (const block of findCitationBlocks(normalizedText)) {
    for (const item of block.content.split(";")) {
      const match =
        /^(.*?)(?:,\s*|\s+)?(?:pp?\s*\.\s*|pages?\.?\s+)([\d\s,-]+)$/i.exec(
          item.trim()
        );
      if (!match) continue;

      const source = findSource(match[1].trim(), normalizedSources);
      if (!source || !Number.isFinite(source.pages)) continue;

      const pageCount = Math.floor(source.pages ?? 0);
      for (const pageToken of parsePageList(match[2].trim())) {
        const [startText, endText] = pageToken.split(/\s*-\s*/);
        const firstPage = Number(startText);
        const lastPage = endText === undefined ? firstPage : Number(endText);
        if (
          !Number.isInteger(firstPage) ||
          !Number.isInteger(lastPage) ||
          lastPage < firstPage
        ) {
          continue;
        }

        const rangeEnd = Math.min(lastPage, firstPage + 5, pageCount);
        for (
          let page = firstPage;
          page <= rangeEnd && citations.length < 8;
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
  }

  return citations;
}
