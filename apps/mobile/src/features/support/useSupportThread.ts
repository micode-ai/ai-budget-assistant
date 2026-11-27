import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { SupportThreadView } from '@budget/shared-types';
import { supportApi } from '@/services/api';
import { useSupportStore } from '@/stores/supportStore';
import { useConnectivity } from '@/hooks/useConnectivity';
import { collectSupportContext } from './collectSupportContext';
import { isAppVisible, startSupportPoll } from './supportPolling';
import { mergeMessages, supportErrorKey, SUPPORT_MESSAGE_MAX_LENGTH, type SupportErrorKey } from './supportDisplay';

export interface UseSupportThreadReturn {
  thread: SupportThreadView | null;
  loading: boolean;
  /** The first load failed and nothing is shown. */
  error: boolean;
  send: (body: string) => Promise<void>;
  sending: boolean;
  /** Why the last send failed (429 limit / 503 later / generic), cleared by the next send or edit. */
  sendError: SupportErrorKey | null;
  loadOlder: () => Promise<void>;
  loadingOlder: boolean;
  setAutoTranslate: (v: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  /** The composer's text. Lives here so a resize across 1024 (which swaps the child view) keeps it. */
  draft: string;
  setDraft: (text: string) => void;
  isOffline: boolean;
}

/**
 * The "Write to the developer" screen's data. Called ONCE in each platform
 * `SupportView` file and passed down as one prop, never inside
 * `SupportMobile`/`SupportDesktop`: on web a resize across the desktop
 * breakpoint swaps the child, and a hook mounted there would drop the draft
 * (the desktop chat-screen invariant, `docs/wiki/features/desktop-chat-screen.md`).
 *
 * Online-only, like the API it fronts: nothing is cached in SQLite and nothing
 * is queued. Loads on focus, marks the thread read after every successful load
 * that found unread replies, and appends a sent message on success.
 *
 * `fromRoute` is the route PATTERN the screen was opened from, attached to
 * each message's context.
 */
export function useSupportThread(fromRoute?: string): UseSupportThreadReturn {
  const [thread, setThread] = useState<SupportThreadView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<SupportErrorKey | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraftState] = useState('');
  const { isOffline } = useConnectivity();
  const isOfflineRef = useRef(isOffline);
  isOfflineRef.current = isOffline;

  // A ref mirror so the callbacks below stay stable and never read a stale thread.
  const threadRef = useRef<SupportThreadView | null>(null);
  threadRef.current = thread;
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const page = await supportApi.getThread();
      const prev = threadRef.current;
      const next: SupportThreadView = prev
        ? {
            ...page,
            messages: mergeMessages(prev.messages, page.messages),
            // Older pages already loaded keep their own answer to "is there more?".
            hasMore: prev.messages.length > page.messages.length ? prev.hasMore : page.hasMore,
          }
        : page;
      setThread(next);
      setError(false);
      useSupportStore.getState().setUnread(0);
      if (page.userUnreadCount > 0) {
        supportApi.markRead().catch((e: unknown) => console.warn('[support] markRead failed', e));
      }
    } catch (e) {
      console.warn('[support] load failed', e);
      if (!threadRef.current) setError(true);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, []);

  // Load on focus, and poll for a reply only WHILE focused: the interval lives
  // in the focus effect, so a `/support` stacked under another screen stops.
  // Each tick is skipped offline and while the app/tab is not visible — a poll
  // that finds unread replies marks them read, which must mean someone saw them.
  useFocusEffect(
    useCallback(() => {
      void refresh();
      return startSupportPoll(
        () => void refresh(),
        () => !isOfflineRef.current && isAppVisible(),
      );
    }, [refresh]),
  );

  const loadOlder = useCallback(async () => {
    const current = threadRef.current;
    if (!current?.hasMore || loadingOlder || current.messages.length === 0) return;
    setLoadingOlder(true);
    try {
      // The cursor is the ISO `createdAt` of the oldest loaded message, not an id.
      const page = await supportApi.getThread(current.messages[0].createdAt);
      setThread((t) =>
        t ? { ...t, messages: mergeMessages(page.messages, t.messages), hasMore: page.hasMore } : t,
      );
    } catch (e) {
      console.warn('[support] loading older messages failed', e);
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder]);

  const send = useCallback(
    async (body: string) => {
      const text = body.trim();
      if (!text || text.length > SUPPORT_MESSAGE_MAX_LENGTH || sending) return;
      setSending(true);
      setSendError(null);
      try {
        const message = await supportApi.send({ body: text, context: collectSupportContext(fromRoute) });
        setThread((t) =>
          t
            ? { ...t, messages: mergeMessages(t.messages, [message]) }
            : { id: null, autoTranslate: true, userUnreadCount: 0, messages: [message], hasMore: false },
        );
        setDraftState('');
      } catch (e) {
        // Expected offline or at the daily limit: a warning, never a LogBox overlay.
        console.warn('[support] send failed', e);
        setSendError(supportErrorKey(e));
      } finally {
        setSending(false);
      }
    },
    [fromRoute, sending],
  );

  const setAutoTranslate = useCallback(async (value: boolean) => {
    const before = threadRef.current?.autoTranslate;
    setThread((t) => (t ? { ...t, autoTranslate: value } : t));
    try {
      await supportApi.setAutoTranslate(value);
    } catch (e) {
      console.warn('[support] auto-translate update failed', e);
      if (before !== undefined) setThread((t) => (t ? { ...t, autoTranslate: before } : t));
    }
  }, []);

  const setDraft = useCallback((text: string) => {
    setDraftState(text);
    setSendError(null);
  }, []);

  return {
    thread,
    loading,
    error,
    send,
    sending,
    sendError,
    loadOlder,
    loadingOlder,
    setAutoTranslate,
    refresh,
    draft,
    setDraft,
    isOffline,
  };
}
