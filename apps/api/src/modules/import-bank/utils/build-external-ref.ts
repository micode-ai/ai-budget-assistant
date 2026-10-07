import { createHash } from 'crypto';

/**
 * Deliberately embeds the parser id, so renaming a parser's id makes
 * previously-imported rows importable again (see the competitor-parser id
 * note in CLAUDE.md) — `parser.id` stays `'universal'` on the AI-inferred CSV
 * path for exactly this reason (an AI-inferred and a hand-mapped import of
 * the same file must produce byte-identical externalRefs).
 */
export function buildExternalRef(
  bankId: string,
  row: { kind: string; date: string; amount: number; description: string },
): string {
  const cents = Math.round((row.kind === 'expense' ? -1 : 1) * row.amount * 100);
  const normalized = (row.description || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  const stripped = normalized.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hash = createHash('sha256').update(stripped).digest('hex').slice(0, 8);
  return `bank:${bankId}:${row.date}:${cents}:${hash}`;
}

/**
 * Makes the Nth identical row of ONE file distinct: the first occurrence keeps
 * the bare key, later ones get `#2`, `#3`, ... in source-row (`idx`) order.
 *
 * The key is date + amount + description, which two genuine purchases share
 * whenever someone buys the same thing twice in a day — Monefy logs one row
 * per item, and a real ten-year export had over a hundred such repeats. Without this the
 * commit's intra-batch filter dropped every repeat as a "duplicate".
 *
 * Numbering by `idx` (not array position — `pairFxRows` reorders) keeps the
 * keys stable across re-imports of the same file, and the bare first key keeps
 * files imported before this change deduping against what they created.
 */
export function disambiguateRepeatedRefs<T extends { idx: number; externalRef: string }>(rows: T[]): T[] {
  const seen = new Map<string, number>();
  for (const row of [...rows].sort((a, b) => a.idx - b.idx)) {
    const n = (seen.get(row.externalRef) ?? 0) + 1;
    seen.set(row.externalRef, n);
    if (n > 1) row.externalRef = `${row.externalRef}#${n}`;
  }
  return rows;
}
