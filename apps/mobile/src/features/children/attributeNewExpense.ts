import { Platform } from 'react-native';
import { useChildStore } from '@/stores/childStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { resolveLineIdBySortOrder } from './useChildAttribution';

/** How long the web waits for a just-saved expense to reach the server. */
const WEB_CREATE_TIMEOUT_MS = 20_000;

/**
 * Resolves once the web's fire-and-forget create of `expenseId` has landed
 * (the row gained a `serverId`), `false` if it failed (back to `pending`) or
 * timed out. `addExpense` does not return that promise, and `PUT
 * /expenses/:id/children` 404s until the row exists.
 */
function waitForServerCreate(expenseId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const state = () => useExpenseStore.getState().expenses.find((e) => e.id === expenseId);
    const settled = (): boolean | null => {
      const e = state();
      if (!e) return false;
      if (e.serverId) return true;
      if (e.syncStatus === 'pending') return false;
      return null;
    };
    const now = settled();
    if (now !== null) {
      resolve(now);
      return;
    }
    let done = false;
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(value);
    };
    const unsubscribe = useExpenseStore.subscribe(() => {
      const v = settled();
      if (v !== null) finish(v);
    });
    const timer = setTimeout(() => finish(false), WEB_CREATE_TIMEOUT_MS);
  });
}

/**
 * Attribute a just-created expense to children (the create form's "For" row).
 *
 * Native writes the links to SQLite and the queue at once; the drain holds them
 * until the expense itself has synced. Web has no queue, so it waits for the
 * create to land first. Throws when the attribution could not be written.
 */
export async function attributeNewExpense(expenseId: string, childIds: string[]): Promise<void> {
  if (childIds.length === 0) return;
  if (Platform.OS === 'web') {
    const created = await waitForServerCreate(expenseId);
    if (!created) throw new Error('Expense was not created on the server');
  }
  await useChildStore.getState().setExpenseChildren(expenseId, childIds);
}

/**
 * Attribute a just-saved receipt's lines picked on the confirm card
 * (`lineChildren`: line index = the line's `sortOrder` -> local child id).
 *
 * Native writes at once against the lines' local ids; the queue follows each
 * line to its server id. Web waits for the create to land (its lines are
 * adopted under their server ids first), then writes over REST. Resolves with
 * how many lines could not be attributed; throws only when the expense never
 * reached the server on web.
 */
export async function attributeNewReceiptLines(
  expenseId: string,
  lineChildren: Record<number, string | null>,
): Promise<number> {
  const entries = Object.entries(lineChildren)
    .filter((e): e is [string, string] => !!e[1])
    .map(([index, childId]) => [Number(index), childId] as const);
  if (entries.length === 0) return 0;
  if (Platform.OS === 'web') {
    const created = await waitForServerCreate(expenseId);
    if (!created) throw new Error('Expense was not created on the server');
  }
  let failed = 0;
  for (const [sortOrder, childId] of entries) {
    const itemId = await resolveLineIdBySortOrder(expenseId, sortOrder);
    if (!itemId) {
      failed++;
      continue;
    }
    try {
      await useChildStore.getState().setItemChild(expenseId, itemId, childId);
    } catch (e) {
      console.warn('[children] receipt line attribution not saved:', e instanceof Error ? e.message : String(e));
      failed++;
    }
  }
  return failed;
}
