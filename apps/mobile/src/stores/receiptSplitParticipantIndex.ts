import { MMKV } from 'react-native-mmkv';

/**
 * Local `participantId -> expenseId` index for the receipt-split feature.
 *
 * The `split_payment_claimed` push (fired when a guest taps "I paid") carries
 * only `{ participantId }` in its data payload — see
 * `apps/api/src/modules/receipt-split/guest.controller.ts`'s `sendToUser`
 * call, which never includes the expense id. There is no server endpoint to
 * reverse-look-up an expense from a bare participant id (adding one is an API
 * change, out of scope for a mobile-only fix), so the deep-link target has to
 * be resolved from something the client already knows.
 *
 * The payer's OWN device always learns every participant id the moment it
 * creates or loads a split (`SplitStateResponse.participants[].id`) — well
 * before any guest could possibly claim their share. Recording that mapping
 * locally, keyed by participant id, is enough to resolve the push without any
 * server change. `receiptSplitStore.ts`'s `create`/`load` call `recordParticipants`
 * whenever they obtain a `SplitStateResponse`.
 *
 * MMKV-backed, same pattern as `merchantSuggestionStore.ts`'s `resolveDismissed`:
 * a plain JSON-serialized object, with the parsing/merging logic exported as
 * pure functions so it's unit-testable without mocking MMKV.
 */
const mmkv = new MMKV({ id: 'receipt-split-participant-index' });
const KEY = 'index';

/** Caps the index so a payer who creates many splits over time doesn't grow
 * this file unboundedly — oldest-inserted entries are dropped first. */
export const MAX_PARTICIPANT_INDEX_ENTRIES = 200;

/**
 * Pure: parse the stored JSON object of participantId -> expenseId. Tolerant
 * of missing/corrupt data (returns an empty object).
 */
export function parseParticipantIndex(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Pure: merge `additions` into `existing`, capping total size at `maxEntries`
 * by dropping the oldest-inserted keys first (object key insertion order).
 */
export function mergeParticipantIndex(
  existing: Record<string, string>,
  additions: Record<string, string>,
  maxEntries: number = MAX_PARTICIPANT_INDEX_ENTRIES,
): Record<string, string> {
  const merged = { ...existing, ...additions };
  const keys = Object.keys(merged);
  if (keys.length <= maxEntries) return merged;
  const kept = keys.slice(keys.length - maxEntries);
  const trimmed: Record<string, string> = {};
  for (const k of kept) trimmed[k] = merged[k];
  return trimmed;
}

/** Record that `participantIds` all belong to `expenseId`. No-ops for an empty list. */
export function recordParticipants(expenseId: string, participantIds: string[]): void {
  if (participantIds.length === 0) return;
  const additions: Record<string, string> = {};
  for (const id of participantIds) additions[id] = expenseId;
  const existing = parseParticipantIndex(mmkv.getString(KEY));
  const next = mergeParticipantIndex(existing, additions);
  mmkv.set(KEY, JSON.stringify(next));
}

/** Resolve the expense id a participant belongs to, or `undefined` if unknown
 * (e.g. a different device, or a reinstalled app that never re-learned it). */
export function resolveExpenseIdForParticipant(participantId: string): string | undefined {
  return parseParticipantIndex(mmkv.getString(KEY))[participantId];
}
