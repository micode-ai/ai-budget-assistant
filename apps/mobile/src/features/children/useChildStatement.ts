import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import i18n from '@/i18n';
import { api } from '@/services/api';
import { saveFile } from '@/services/fileExport';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { serverChildRef } from '@/stores/childStore';
import { countStatementQueue, drainChildQueue, readEncryptionTier } from '@/stores/childSync';
import { useExpenseStore } from '@/stores/expenseStore';
import { loadPendingExpenseDeleteIds } from '@/db/expenseRepository';
import { useIncomeStore } from '@/stores/incomeStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useUpgradeStore } from '@/stores/upgradeStore';
import { useConnectivityStore } from '@/services/connectivity';
import {
  canRequestStatement,
  countPendingForAccount,
  statementPreflight,
  statementErrorCode,
  statementFileName,
  statementPeriod,
  type StatementFailure,
  type StatementGate,
  type StatementPeriodKind,
} from './statementGate';

export type StatementStatus =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'saved'; location: string }
  | { kind: 'refused'; reason: Exclude<StatementFailure, 'pro'> };

const STATEMENT_LOCALES = new Set(['en', 'pl', 'de', 'es', 'fr', 'ru', 'ua', 'be', 'nl']);

function warn(message: string, e?: unknown): void {
  // Expected failures (offline, a refusal): console.warn, never console.error (ABA-157).
  // Never the child's name — only ids and messages.
  console.warn(`[childStatement] ${message}`, e instanceof Error ? e.message : (e ?? ''));
}

/**
 * The Statement PDF action, called once in `ChildCostsView` (above the 1024
 * split) and handed to the dialog, so a resize never drops a request in flight.
 *
 * `request` flushes everything this account still owes the server — the
 * child-cost queue and the expense and income pending pushes — re-counts, and
 * refuses (`pending`) while anything is left: the server is the PDF's source
 * of truth (spec decision 1). The file goes out through the report export path
 * (`fileExport.saveFile`: Android folder picker / iOS share sheet / browser
 * download) — never `expo-file-system` from here or a store.
 */
export function useChildStatement(childId: string | null) {
  const [status, setStatus] = useState<StatementStatus>({ kind: 'idle' });
  /**
   * Line attributions found undeliverable at the last request (expense on the
   * server, line not — see childSync.ts): they do not block the statement, so
   * the dialog says they are missing from it.
   */
  const [undeliverableLines, setUndeliverableLines] = useState(0);
  const busy = useRef(false);
  const tier = useSubscriptionStore((s) => s.tier);
  const canEdit = useAccountStore((s) => s.canEdit());

  /** The synchronous part of the gate, for the button: viewer, or not on Pro. */
  const quickGate = useCallback(
    (): StatementGate => canRequestStatement({ tier, encryptionTier: 0, pendingChanges: 0, canEdit }),
    [tier, canEdit],
  );

  const showUpgrade = useCallback(() => {
    useUpgradeStore.getState().show(i18n.t('childCosts.statement.proRequired'), 'pro');
  }, []);

  const reset = useCallback(() => {
    if (!busy.current) {
      setStatus({ kind: 'idle' });
      setUndeliverableLines(0);
    }
  }, []);

  const request = useCallback(
    async (kind: StatementPeriodKind): Promise<void> => {
      const accountId = useAccountStore.getState().currentAccountId;
      if (!childId || !accountId || busy.current) return;
      busy.current = true;
      setStatus({ kind: 'working' });
      setUndeliverableLines(0);
      const refuse = (reason: StatementFailure) => {
        if (reason === 'pro') {
          setStatus({ kind: 'idle' });
          showUpgrade();
        } else {
          setStatus({ kind: 'refused', reason });
        }
      };
      try {
        const pendingIn = (rows: Parameters<typeof countPendingForAccount>[1]['expenses']) =>
          countPendingForAccount(accountId, { queuedChildChanges: 0, expenses: rows, incomes: [] });
        const gate = await statementPreflight({
          tier: () => useSubscriptionStore.getState().tier,
          canEdit: () => useAccountStore.getState().canEdit(),
          snapshotPending: () =>
            pendingIn(useExpenseStore.getState().expenses) + pendingIn(useIncomeStore.getState().incomes),
          isOffline: () => useConnectivityStore.getState().status === 'offline',
          flushChildQueue: () => (Platform.OS !== 'web' ? drainChildQueue(accountId) : Promise.resolve()),
          flushExpenses: () => useExpenseStore.getState().syncPendingExpenses(),
          flushIncomes: () => useIncomeStore.getState().syncPendingIncomes(),
          // Undeliverable line changes are not "pending": they would block the statement forever.
          countQueuedChildChanges: async () => {
            if (Platform.OS === 'web') return 0;
            const queue = await countStatementQueue(accountId);
            setUndeliverableLines(queue.undeliverableLines);
            return queue.pending;
          },
          countPendingDeletes: async () =>
            Platform.OS === 'web' ? 0 : (await loadPendingExpenseDeleteIds(accountId)).length,
          readEncryptionTier: () => readEncryptionTier(accountId),
        });
        if (gate !== 'ok') {
          if (gate === 'pending') warn('changes still pending; statement not requested');
          return refuse(gate);
        }

        const period = statementPeriod(kind);
        const ref = (await serverChildRef(accountId, childId)) ?? childId;
        const lang = (i18n.language || 'en').split('-')[0];
        let blob: Blob;
        try {
          // The account the gate checked, pinned explicitly — not whatever is current by the time this runs.
          blob = await api.downloadChildStatement(accountId, ref, {
            childId: ref,
            from: period.from,
            to: period.to,
            locale: STATEMENT_LOCALES.has(lang) ? lang : 'en',
            currencyCode: useAuthStore.getState().user?.currencyCode || 'USD',
          });
        } catch (e) {
          warn('statement request failed', e);
          return refuse(statementErrorCode(e));
        }

        const result = await saveFile(blob, statementFileName(period));
        if (result.status === 'saved') setStatus({ kind: 'saved', location: result.location });
        else if (result.status === 'error') {
          warn('statement could not be saved', result.error);
          setStatus({ kind: 'refused', reason: 'failed' });
        } else setStatus({ kind: 'idle' }); // shared, or the user backed out of the picker
      } catch (e) {
        warn('statement failed', e);
        setStatus({ kind: 'refused', reason: 'failed' });
      } finally {
        busy.current = false;
      }
    },
    [childId, showUpgrade],
  );

  return {
    status,
    undeliverableLines,
    request,
    reset,
    quickGate,
    showUpgrade,
    isPro: tier === 'pro' || tier === 'business',
  };
}

export type ChildStatementController = ReturnType<typeof useChildStatement>;
