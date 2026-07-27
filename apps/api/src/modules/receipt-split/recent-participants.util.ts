/**
 * Pure dedupe/cap/limit-parsing logic backing
 * `GET /expenses/receipt-split/recent-participants` — the "people you've
 * split with before" suggestion list on the mobile assignment screen. Kept
 * separate from receipt-split.service.ts so it can be unit-tested without
 * touching Prisma, mirroring split-calculator.ts alongside it.
 */

export interface RecentParticipantRow {
  name: string;
  createdAt: Date;
}

export const RECENT_PARTICIPANTS_DEFAULT_LIMIT = 8;
export const RECENT_PARTICIPANTS_MAX_LIMIT = 20;
/** How many raw (pre-dedupe) rows to fetch per requested distinct name. A
 * name reused across many splits (the same friend, over time) collapses to
 * one distinct entry, so the raw fetch must overshoot the requested cap for
 * `dedupeRecentParticipantNames` to still likely return `limit` distinct
 * names rather than starving on repeats. */
export const RECENT_PARTICIPANTS_OVERFETCH_MULTIPLIER = 10;

/**
 * `rows` are expected pre-sorted DESC by createdAt (the DB query does this —
 * see ReceiptSplitService.getRecentParticipantNames); this function never
 * re-sorts, it only dedupes (case-insensitive/trim) and caps, keeping the
 * FIRST occurrence of each name it sees — i.e. the most recent one, since
 * rows arrive newest first.
 */
export function dedupeRecentParticipantNames(
  rows: RecentParticipantRow[],
  limit: number,
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of rows) {
    const trimmed = row.name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(trimmed);
    if (names.length >= limit) break;
  }
  return names;
}

/**
 * Parses+clamps the `?limit=` query param — NaN-safe, mirrors the
 * clamp-with-fallback convention used elsewhere in this codebase (e.g.
 * wrapped.service.ts's year clamp, family-feed's limit clamp). Anything
 * missing, non-numeric, zero, or negative falls back to the default rather
 * than throwing — a suggestion list is not worth a 400 over a bad query
 * param.
 */
export function resolveRecentParticipantsLimit(raw: unknown): number {
  const parsed = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return RECENT_PARTICIPANTS_DEFAULT_LIMIT;
  return Math.min(Math.trunc(parsed), RECENT_PARTICIPANTS_MAX_LIMIT);
}
