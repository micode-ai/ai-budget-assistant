import type { HelpSection } from './content';

export type HelpMatchTier = 'title' | 'description' | 'body' | 'none';

export interface HelpSearchResult {
  section: HelpSection;
  tier: HelpMatchTier;
  snippet: string | null;
}

const SNIPPET_CONTEXT_CHARS = 40;

function buildSnippet(body: string, query: string): string | null {
  const lowerBody = body.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerBody.indexOf(lowerQuery);
  if (matchIndex === -1) return null;

  const start = Math.max(0, matchIndex - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(body.length, matchIndex + query.length + SNIPPET_CONTEXT_CHARS);

  const raw = body.slice(start, end).replace(/\s+/g, ' ').trim();
  const prefix = start > 0 ? '…' : '';
  const suffix = end < body.length ? '…' : '';
  return `${prefix}${raw}${suffix}`;
}

export function searchHelpSections(
  sections: HelpSection[],
  query: string
): HelpSearchResult[] {
  const trimmed = query.trim();
  if (trimmed === '') {
    return sections.map((section) => ({ section, tier: 'none', snippet: null }));
  }

  const lowerQuery = trimmed.toLowerCase();
  const byTier: Record<Exclude<HelpMatchTier, 'none'>, HelpSearchResult[]> = {
    title: [],
    description: [],
    body: [],
  };

  for (const section of sections) {
    if (section.title.toLowerCase().includes(lowerQuery)) {
      byTier.title.push({ section, tier: 'title', snippet: null });
    } else if (section.description.toLowerCase().includes(lowerQuery)) {
      byTier.description.push({ section, tier: 'description', snippet: null });
    } else if (section.body.toLowerCase().includes(lowerQuery)) {
      byTier.body.push({
        section,
        tier: 'body',
        snippet: buildSnippet(section.body, trimmed),
      });
    }
  }

  return [...byTier.title, ...byTier.description, ...byTier.body];
}
