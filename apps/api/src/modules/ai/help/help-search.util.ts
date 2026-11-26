// Pure keyword retrieval over the generated help index (help-index.json).
// Contract: docs/contracts/ai-chat-help-search.md. No I/O, no account data.

export interface HelpChunk { heading: string; text: string }
export interface HelpIndexSection { id: string; title: string; chunks: HelpChunk[] }
export type HelpIndex = Record<string, HelpIndexSection[]>;

export interface HelpMatch {
  sectionId: string;
  sectionTitle: string;
  heading: string;
  excerpt: string;
  deepLink: string;
}

const PREFIX_LEN = 5;
const MIN_TOKEN_LEN = 3;
const MAX_EXCERPT = 700;

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}

export function tokenize(s: string): string[] {
  return fold(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= MIN_TOKEN_LEN);
}

/** Shared-prefix match of min(len, 5) chars: cheap stemming for ru/pl/de inflections. */
function wordsMatch(queryToken: string, word: string): boolean {
  const n = Math.min(PREFIX_LEN, queryToken.length, word.length);
  if (n < MIN_TOKEN_LEN) return false;
  return queryToken.slice(0, n) === word.slice(0, n);
}

function countHits(queryToken: string, words: string[]): number {
  let hits = 0;
  for (const w of words) if (wordsMatch(queryToken, w)) hits++;
  return hits;
}

function excerptOf(text: string): string {
  if (text.length <= MAX_EXCERPT) return text;
  const cut = text.slice(0, MAX_EXCERPT);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 400 ? lastSpace : MAX_EXCERPT)}…`;
}

function searchOne(sections: HelpIndexSection[], tokens: string[], limit: number): HelpMatch[] {
  const scored: Array<{ score: number; section: HelpIndexSection; chunk: HelpChunk }> = [];
  for (const section of sections) {
    const titleWords = tokenize(section.title);
    let best: { score: number; chunk: HelpChunk } | null = null;
    for (const chunk of section.chunks) {
      const headingWords = tokenize(chunk.heading);
      const bodyWords = tokenize(chunk.text);
      let score = 0;
      for (const t of tokens) {
        if (countHits(t, titleWords) > 0) score += 3;
        if (countHits(t, headingWords) > 0) score += 2;
        score += Math.min(3, countHits(t, bodyWords));
      }
      if (score > 0 && (!best || score > best.score)) best = { score, chunk };
    }
    if (best) scored.push({ score: best.score, section, chunk: best.chunk });
  }
  scored.sort((a, b) => b.score - a.score || a.section.id.localeCompare(b.section.id));
  return scored.slice(0, limit).map(({ section, chunk }) => ({
    sectionId: section.id,
    sectionTitle: section.title,
    heading: chunk.heading,
    excerpt: excerptOf(chunk.text),
    deepLink: `/help/${section.id}`,
  }));
}

export function searchHelp(index: HelpIndex, query: string, lang: string | undefined, limit = 3): HelpMatch[] {
  try {
    const tokens = tokenize(query ?? '');
    if (tokens.length === 0) return [];
    const primary = lang && index[lang] ? lang : 'en';
    const found = searchOne(index[primary] ?? [], tokens, limit);
    if (found.length > 0 || primary === 'en') return found;
    return searchOne(index.en ?? [], tokens, limit);
  } catch {
    return [];
  }
}
