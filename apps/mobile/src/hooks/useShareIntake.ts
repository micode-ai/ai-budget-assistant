import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import i18n from '@/i18n';
import { showAlert } from '@/utils/alert';
import {
  getInitialShare, subscribeToShares, type SharePayload, purgeStaleSharedFiles, deleteSharedFile,
} from '@/services/shareIntake';
import { useShareIntakeStore } from '@/stores/shareIntakeStore';
import { useFirstRunStore } from '@/stores/firstRunStore';
import { useAccountStore } from '@/stores/accountStore';
import { api } from '@/services/api';
import { useMerchantRulesStore } from '@/stores/merchantRulesStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { sha256SimpleHex } from '@/services/notificationCapture/dedup';
import { classifySharedText, buildSharedTextPrefill, SHARE_TEXT_PACKAGE } from '@/features/share-intake/sharedTextCapture';
import { decideShareNavigation, shouldAnnounceDropped } from '@/features/share-intake/shareIntakeGate';

const STALE_MS = 24 * 60 * 60 * 1000;

/** Pull the share held by the native module (cold start, or one that arrived
 *  while the React instance was inactive) into the queue. */
export async function ingestInitialShare(): Promise<void> {
  const payload = await getInitialShare();
  if (payload) ingestPayload(payload);
}

function ingestPayload(p: SharePayload): void {
  const store = useShareIntakeStore.getState();
  if (p.files.length > 0 || p.droppedCount > 0) store.add(p.files, p.droppedCount);
  if (p.texts?.length) store.addTexts(p.texts);
}

/**
 * A shared text becomes a prefilled create form — never a saved expense. Order:
 * spend gate (promo -> alert), on-device parse, AI parse for long/unparsed text,
 * description-only form when the AI call fails. Merchant rules pick the category.
 */
export async function openSharedText(text: string): Promise<void> {
  const result = classifySharedText(text);
  if (result.kind === 'not_spend') {
    showAlert(i18n.t('shareIntake.textNotSpendTitle'), i18n.t('shareIntake.textNotSpendBody'), [
      { text: i18n.t('common.cancel'), style: 'cancel' },
      {
        text: i18n.t('shareIntake.enterManually'),
        onPress: () => router.push({ pathname: '/expense/new', params: buildSharedTextPrefill({ description: text }) }),
      },
    ]);
    return;
  }
  let amount: number | undefined;
  let currencyCode: string | undefined;
  let merchant: string | null | undefined;
  let date: Date | undefined;
  let categoryId: string | undefined;
  let suggestedCategory: string | undefined;
  if (result.kind === 'parsed') {
    ({ amount, currencyCode, merchant, date, suggestedCategory } = result);
  } else {
    try {
      const ai = await api.parseExpense(text);
      if (ai.amount > 0) {
        amount = ai.amount;
        currencyCode = ai.currencyCode;
        merchant = ai.merchant;
        categoryId = ai.categoryId;
      }
    } catch (e) {
      console.warn('[ShareIntake] AI text parse failed:', e);
    }
  }
  if (merchant && !categoryId) {
    const rule = useMerchantRulesStore.getState().getRuleForMerchant(merchant);
    if (rule) categoryId = rule;
    else if (suggestedCategory) categoryId = useCategoryStore.getState().getCategoryByName(suggestedCategory, 'expense')?.id;
  }
  let externalRef: string | undefined;
  if (amount && date) {
    const iso = date.toISOString().slice(0, 10);
    externalRef = `notif:${await sha256SimpleHex(`${SHARE_TEXT_PACKAGE}|${amount}|${merchant ?? ''}|${iso}`)}`;
  }
  router.push({
    pathname: '/expense/new',
    params: buildSharedTextPrefill({
      amount, currencyCode, merchant, categoryId, date, externalRef,
      description: merchant ? undefined : text,
    }),
  });
}

/**
 * Share-to-capture entry (spec 2026-09-26-share-to-capture-design). One of
 * RootNavigator's cross-cutting hooks (ABA-354). Captures the cold-start share
 * and warm shares, and opens the receipt screen only through
 * `decideShareNavigation` — gated on the same `coldStartGateReady` as the
 * notification and trip-invite flushes, and idle while the receipt screen is
 * already showing a queue (it appends new shares itself, see `screenOpen`).
 */
export function useShareIntake(coldStartGateReady: boolean): void {
  const pendingNavigation = useShareIntakeStore((s) => s.pendingNavigation);
  const screenOpen = useShareIntakeStore((s) => s.screenOpen);
  const lastDropped = useShareIntakeStore((s) => s.lastDropped);
  const hasTexts = useShareIntakeStore((s) => s.texts.length > 0);
  const firstRunSeen = useFirstRunStore((s) => s.seen);
  const canEdit = useAccountStore((s) => s.canEdit());

  useEffect(() => {
    void purgeStaleSharedFiles(STALE_MS);
    void ingestInitialShare();
    const unsubscribe = subscribeToShares((p) => ingestPayload(p));
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') void ingestInitialShare();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    const decision = decideShareNavigation({ pendingNavigation, screenOpen, coldStartGateReady, firstRunSeen, canEdit });
    if (decision === 'navigate') {
      useShareIntakeStore.getState().consumeNavigation();
      router.push({ pathname: '/expense/receipt', params: { source: 'share' } });
    } else if (decision === 'block_viewer') {
      const left = useShareIntakeStore.getState().discardAll();
      useShareIntakeStore.getState().consumeNavigation();
      left.forEach((f) => void deleteSharedFile(f.uri));
      useShareIntakeStore.getState().clearDropped();
      showAlert(i18n.t('shareIntake.viewerBlockedTitle'), i18n.t('shareIntake.viewerBlockedBody'));
    }
  }, [pendingNavigation, screenOpen, coldStartGateReady, firstRunSeen, canEdit]);

  // Shared text: same gate as files (cold start, first run, viewer). It never sets
  // `pendingNavigation`, so it passes `true` for it here and drains `texts` itself.
  useEffect(() => {
    if (!hasTexts) return;
    const decision = decideShareNavigation({ pendingNavigation: true, screenOpen: false, coldStartGateReady, firstRunSeen, canEdit });
    if (decision === 'navigate') {
      const [first] = useShareIntakeStore.getState().takeTexts();
      if (first) void openSharedText(first);
    } else if (decision === 'block_viewer') {
      useShareIntakeStore.getState().takeTexts();
      showAlert(i18n.t('shareIntake.viewerBlockedTitle'), i18n.t('shareIntake.viewerBlockedBody'));
    }
  }, [hasTexts, coldStartGateReady, firstRunSeen, canEdit]);

  // A share where every file was dropped opens no screen — report it here.
  useEffect(() => {
    if (!shouldAnnounceDropped({ lastDropped, pendingNavigation, screenOpen, coldStartGateReady })) return;
    useShareIntakeStore.getState().clearDropped();
    showAlert(i18n.t('shareIntake.droppedTitle'), i18n.t('shareIntake.droppedBody', { count: lastDropped }));
  }, [lastDropped, pendingNavigation, screenOpen, coldStartGateReady]);
}
