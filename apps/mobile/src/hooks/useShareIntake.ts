import { useEffect, useRef } from 'react';
import { AppState, type AlertButton } from 'react-native';
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
 * Shared files: Receipts (editors only — the existing receipt queue) or Promo leaflet (anyone, the
 * Gazetka match screen). Not cancelable by a tap outside, so every exit is one of the three
 * buttons and each one settles the queued cache copies:
 * - Receipts: the receipt screen consumes the queue, which deletes each copy as it advances.
 * - Promo leaflet: the files move to the store's leaflet hand-off; the leaflet screen takes them
 *   on mount and deletes them once read or when it closes.
 * - Cancel: deleted here.
 * Exported for its button-order test.
 * Every answer consumes `pendingNavigation`, and takes the whole queue — including files a second
 * share appended while the chooser was up. The last choice is deliberately not remembered.
 */
export function showShareChooser(canEdit: boolean, done: () => void): void {
  const store = () => useShareIntakeStore.getState();
  // Cancel first: Android puts the first button in the negative slot and the last in the
  // positive one, so a trailing Cancel would render as the affirmative choice.
  const buttons: AlertButton[] = [];
  buttons.push({
    text: i18n.t('common.cancel'),
    style: 'cancel',
    onPress: () => {
      done();
      const left = store().discardAll();
      store().consumeNavigation();
      store().clearDropped();
      left.forEach((f) => void deleteSharedFile(f.uri));
    },
  });
  if (canEdit) {
    buttons.push({
      text: i18n.t('shareIntake.chooseReceipts'),
      onPress: () => {
        done();
        store().consumeNavigation();
        router.push({ pathname: '/expense/receipt', params: { source: 'share' } });
      },
    });
  }
  buttons.push({
    text: i18n.t('shareIntake.chooseLeaflet'),
    onPress: () => {
      done();
      const handed = store().handOffToLeaflets();
      store().consumeNavigation();
      if (handed > 0) router.push({ pathname: '/leaflets', params: { source: 'share' } });
    },
  });
  showAlert(i18n.t('shareIntake.chooseTitle'), undefined, buttons, { cancelable: false });
}

/**
 * Share-to-capture entry (spec 2026-09-26-share-to-capture-design). One of
 * RootNavigator's cross-cutting hooks (ABA-354). Captures the cold-start share
 * and warm shares, and opens the Receipts / Promo leaflet chooser only
 * through `decideShareNavigation` — gated on the same `coldStartGateReady` as the
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

  // True while the Receipts / Promo leaflet chooser is on screen. `pendingNavigation` stays set
  // until the user answers (so the dropped-files notice cannot pop over the chooser, and a second
  // share merges into the same queue); this ref keeps a dependency change from showing it twice.
  const choosing = useRef(false);

  useEffect(() => {
    const decision = decideShareNavigation({
      kind: 'files', pendingNavigation, screenOpen, coldStartGateReady, firstRunSeen, canEdit,
    });
    if (decision !== 'choose' || choosing.current) return;
    choosing.current = true;
    showShareChooser(canEdit, () => {
      choosing.current = false;
    });
  }, [pendingNavigation, screenOpen, coldStartGateReady, firstRunSeen, canEdit]);

  // Shared text: same gate as files (cold start, first run, viewer). It never sets
  // `pendingNavigation`, so it passes `true` for it here and drains `texts` itself.
  useEffect(() => {
    if (!hasTexts) return;
    const decision = decideShareNavigation({
      kind: 'text', pendingNavigation: true, screenOpen: false, coldStartGateReady, firstRunSeen, canEdit,
    });
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
