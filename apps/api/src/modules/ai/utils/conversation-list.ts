/**
 * Merging a pinned-conversations query with the existing recent-conversations
 * query into one ordered, deduplicated list.
 *
 * Why two queries: `getConversations` orders by `updatedAt desc` and caps at
 * `take: 20`, so a conversation pinned three months ago is not in that payload
 * at all — sorting what already arrived can never surface it. The pinned
 * query is therefore separate and deliberately UNBOUNDED, and this function is
 * the pure merge of the two result sets (see
 * docs/design/2026-09-07-chat-conversation-management.md, "The pin has to be
 * in the query").
 *
 * Both inputs are expected already ordered `updatedAt desc` — this function
 * does no sorting of its own, only concatenation + dedup. That keeps it
 * generic over whatever row shape the two `chatConversation.findMany` calls
 * return (both queries select the SAME columns, from the SAME model, so one
 * mapper in the caller can turn the merged, deduped rows into
 * `ChatConversationSummary[]` — two different mappers over the two blocks is
 * how they'd end up disagreeing on shape).
 *
 * Pinned rows win the dedup: a row that is both pinned and in the 20 most
 * recently updated appears exactly once, in the pinned block, never twice.
 */

export interface ConversationRow {
  id: string;
}

export function mergeConversationLists<T extends ConversationRow>(
  pinned: readonly T[],
  recent: readonly T[],
): T[] {
  const pinnedIds = new Set(pinned.map((row) => row.id));
  const recentOnly = recent.filter((row) => !pinnedIds.has(row.id));
  return [...pinned, ...recentOnly];
}
