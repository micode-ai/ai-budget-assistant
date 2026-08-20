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
