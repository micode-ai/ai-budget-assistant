/**
 * incomeSync.ts — the income delete retry (ABA-754), the income mirror of
 * `syncPendingExpenseDeletes` (ABA-749).
 *
 * `deleteIncome` used to send one fire-and-forget request, so a delete made
 * offline was lost and the next pull brought the income back. The soft-deleted
 * row now stays `pending` in SQLite until the server confirms; a 404 means the
 * server no longer has it, which is the same outcome.
 */
import { Platform } from 'react-native';
import { loadPendingIncomeDeleteIds, markIncomeDeleteSynced } from '@/db/incomeRepository';
import { api } from '@/services/api';
import { useAccountStore } from './accountStore';

/** Bounded per pass, newest first, as for expenses. */
const PENDING_DELETES_PER_SYNC = 20;

export async function syncPendingIncomeDeletes(): Promise<void> {
  if (Platform.OS === 'web') return; // no local store to remember a delete in
  const accountId = useAccountStore.getState().currentAccountId;
  if (!accountId) return;
  const ids = await loadPendingIncomeDeleteIds(accountId, PENDING_DELETES_PER_SYNC);
  for (const id of ids) {
    try {
      await api.deleteIncome(id);
    } catch (e) {
      if ((e as { status?: unknown } | null)?.status !== 404) {
        console.warn('[incomeSync] income delete still pending:', e instanceof Error ? e.message : String(e));
        continue;
      }
    }
    await markIncomeDeleteSynced(id).catch(() => undefined);
  }
}
