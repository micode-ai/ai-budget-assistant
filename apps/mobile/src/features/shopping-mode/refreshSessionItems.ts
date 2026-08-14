import type { ShoppingListItem } from '@budget/shared-types';
import { readSession, writeSession } from '@/stores/shoppingModeStore';
import { deriveSnapshotListFields } from './snapshot';

function sameLabels(stored: string[] | undefined, next: string[]): boolean {
  // `parseStoredSession` validates only `startedAt` and `centres`, so a row
  // written by an older build can reach here without this field at all.
  if (!Array.isArray(stored) || stored.length !== next.length) return false;
  return stored.every((label, i) => label === next[i]);
}

/**
 * Bring a live session's list fields up to date with the list as it stands now.
 *
 * The rest of the snapshot is frozen on purpose and stays frozen. The shop
 * centres in particular must NOT be recomputed: the reducer holds
 * `insideMerchant` as a name and looks it up in `centres`, so a centre list
 * that changed under a session already inside a shop would make that lookup
 * miss and end the trip early. Only the two fields that describe the shopping
 * list — which is the one thing the user actively changes while shopping — move.
 *
 * Without this, a user who ticks every item off during the trip still gets
 * "Still on your list: 5" on the way out, because the count was captured when
 * they pressed the button.
 *
 * Switching the ACTIVE LIST mid-session re-points a running session at the
 * other list, and that is deliberate. The caller subscribes to the store's
 * `items`, which is the active list's items — the same field
 * `buildSessionSnapshot` was handed at press time — so a switch is read as "I
 * am shopping from this list now" and the notification follows the list the
 * user is actually looking at. The alternative, pinning the session to a list
 * id, would keep counting a list the user has navigated away from. Nothing
 * else about the session moves with the switch.
 *
 * Cost when no session is running: one MMKV read that finds nothing. The gate
 * is `readSession()` returning null, before any list is walked.
 *
 * Read-modify-write on the same MMKV row the location task writes, and safe
 * because both are synchronous: the task persists its own change before it
 * awaits anything, so this can only ever run before or after that write, never
 * interleaved with it. If the task cleared the session first, this finds no
 * session and does nothing.
 */
export function refreshSessionItems(items: ShoppingListItem[]): void {
  const session = readSession();
  if (!session) return;

  const next = deriveSnapshotListFields(items);
  const { uncheckedCount, uncheckedLabels } = session.snapshot;
  if (uncheckedCount === next.uncheckedCount && sameLabels(uncheckedLabels, next.uncheckedLabels)) {
    return;
  }

  writeSession({ ...session, snapshot: { ...session.snapshot, ...next } });
}
