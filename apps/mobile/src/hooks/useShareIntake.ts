import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import i18n from '@/i18n';
import { showAlert } from '@/utils/alert';
import {
  getInitialShare, subscribeToShares, purgeStaleSharedFiles, deleteSharedFile,
} from '@/services/shareIntake';
import { useShareIntakeStore } from '@/stores/shareIntakeStore';
import { useFirstRunStore } from '@/stores/firstRunStore';
import { useAccountStore } from '@/stores/accountStore';
import { decideShareNavigation, shouldAnnounceDropped } from '@/features/share-intake/shareIntakeGate';

const STALE_MS = 24 * 60 * 60 * 1000;

/** Pull the share held by the native module (cold start, or one that arrived
 *  while the React instance was inactive) into the queue. */
export async function ingestInitialShare(): Promise<void> {
  const payload = await getInitialShare();
  if (payload) useShareIntakeStore.getState().add(payload.files, payload.droppedCount);
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
  const firstRunSeen = useFirstRunStore((s) => s.seen);
  const canEdit = useAccountStore((s) => s.canEdit());

  useEffect(() => {
    void purgeStaleSharedFiles(STALE_MS);
    void ingestInitialShare();
    const unsubscribe = subscribeToShares((p) => useShareIntakeStore.getState().add(p.files, p.droppedCount));
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

  // A share where every file was dropped opens no screen — report it here.
  useEffect(() => {
    if (!shouldAnnounceDropped({ lastDropped, pendingNavigation, screenOpen, coldStartGateReady })) return;
    useShareIntakeStore.getState().clearDropped();
    showAlert(i18n.t('shareIntake.droppedTitle'), i18n.t('shareIntake.droppedBody', { count: lastDropped }));
  }, [lastDropped, pendingNavigation, screenOpen, coldStartGateReady]);
}
