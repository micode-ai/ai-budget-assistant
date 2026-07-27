/**
 * Client-side narrowing for the receipt-split "people you've split with
 * before" suggestion chips (`app/expense/split.tsx`). `recentNames` comes
 * from the server (`GET /expenses/receipt-split/recent-participants`,
 * already deduped/capped/ordered by recency — see
 * `apps/api/src/modules/receipt-split/recent-participants.util.ts`); this
 * function only narrows that list for the CURRENT in-progress split:
 *
 *  - drops any name already added as a participant on THIS split — tapping
 *    it again would just create a duplicate person with the same name, and
 *    the server has no notion of "the split currently being drafted" to
 *    exclude this itself.
 *  - while the payer is typing a name, narrows to substring matches only
 *    (mirrors `app/expense/location.tsx`'s recents-while-typing behavior:
 *    recents show when the box is empty, and matches surface while typing).
 *
 * Pure and unit-tested; the screen owns fetching/caching `recentNames` via
 * `receiptSplitStore`.
 */
export function filterAvailableRecentNames(
  recentNames: string[],
  query: string,
  currentParticipantNames: string[],
): string[] {
  const added = new Set(
    currentParticipantNames.map((n) => n.trim().toLowerCase()).filter((n) => n.length > 0),
  );
  const q = query.trim().toLowerCase();
  return recentNames.filter((name) => {
    const key = name.trim().toLowerCase();
    if (!key || added.has(key)) return false;
    return q.length === 0 || key.includes(q);
  });
}
