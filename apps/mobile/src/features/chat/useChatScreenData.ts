import { useState, useRef, useEffect } from 'react';
import type { FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { useChatStore } from '@/stores/chatStore';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useVoiceInput } from '@/features/voice/useVoiceInput';
import { useChatPolling } from '@/hooks/useChatPolling';
import { useMentionBar } from '@/hooks/useMentionBar';
import { trackAction } from '@/services/telemetry';

/**
 * Owns all Zustand store subscriptions, derived data, effects and handlers
 * for the AI chat screen (formerly `app/(tabs)/chat.tsx`'s inline body).
 * Pure data/logic layer — no theme/JSX-producing render helpers (those stay
 * in `ChatMobile`, mirroring `useExpensesScreenData.ts`'s split of
 * theme/UI-local concerns from a screen's data hook).
 *
 * Called in BOTH platform `ChatView` files, and its whole return value is
 * passed down as ONE `chat` prop — never called separately inside
 * `ChatMobile`/`ChatDesktop` themselves. Two reasons: this hook fires
 * `trackAction('chat_message', 'started')` once per mount and owns the
 * `completedRef` dedup below, whose per-visit contract must not exist twice;
 * and a browser resize across the desktop breakpoint swaps the child
 * component, so a hook mounted inside the child would reset a half-typed
 * draft and emit a second `started` for the same visit.
 *
 * `historyVisible` (the history sheet's own open/closed state) is
 * deliberately NOT here — it is `ChatMobile`'s own state, since the sheet has
 * no desktop existence under the design this hook was extracted for.
 */
export function useChatScreenData() {
  useEffect(() => {
    trackAction('chat_message', 'started');
  }, []);
  /**
   * `started` is emitted once per MOUNT, and this screen lets a user send any
   * number of messages without unmounting — ten messages in one visit reported
   * 1 started against 10 completed, which put per-flow completion over 100% and
   * pinned `abandoned` (derived as started - completed - failed) at 0, killing
   * the one signal this feature exists to produce. So `completed` is once per
   * mount too, giving a coherent per-visit funnel. `failed` is deliberately NOT
   * deduplicated — repeated validation failures in one visit are a genuine
   * error-rate signal — though this flow has no `failed` call site anyway (see
   * the note in `handleSend`).
   */
  const completedRef = useRef(false);

  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const { currentAccount, members, loadMembers } = useAccountStore();
  const account = currentAccount();
  const accountMembers = account ? (members[account.id] ?? []) : [];
  const hasOtherMembers = accountMembers.length > 1;
  const userId = useAuthStore((s) => s.user?.id);

  const {
    messages,
    conversations,
    currentConversationId,
    isLoading,
    isConfirming,
    sendMessage,
    confirmAction,
    rejectAction,
    startNewConversation,
    loadConversations,
    loadConversation,
    currentIsShared,
    currentIsOwner,
    setConversationShared,
    startPolling,
    stopPolling,
  } = useChatStore();

  // Only the conversation's creator can toggle sharing, and only on a
  // multi-member account. Any member (not just the account owner) may share a
  // conversation they started.
  const canToggleShared = hasOtherMembers && currentIsOwner;

  const { mentionCandidates, getActiveMentions, insertMention, resetMentions } = useMentionBar({
    inputText,
    setInputText,
    accountMembers,
    userId,
    currentIsShared,
  });

  const {
    isRecording,
    isProcessing,
    transcription,
    error: voiceError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceInput();

  useChatPolling(currentIsShared, startPolling, stopPolling);

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  useEffect(() => {
    if (voiceError) showAlert(t('common.error'), voiceError);
  }, [voiceError, t]);

  useEffect(() => {
    if (transcription) sendMessage(transcription);
  }, [transcription, sendMessage]);

  useEffect(() => {
    if (account?.id) loadMembers(account.id);
  }, [account?.id, loadMembers]);

  // Deep link from a chat-mention push: open the originating conversation.
  const { conversationId: deepLinkConversationId } = useLocalSearchParams<{ conversationId?: string }>();
  useEffect(() => {
    if (deepLinkConversationId && deepLinkConversationId !== currentConversationId) {
      loadConversation(deepLinkConversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkConversationId]);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;
    const text = inputText.trim();
    const stillMentioned = getActiveMentions(text);
    setInputText('');
    resetMentions();
    await sendMessage(text, currentIsShared ? stillMentioned : undefined);
    // `sendMessage` catches its own errors internally and never rejects (an AI
    // usage-limit 403, a network failure, etc. all surface as an in-chat error
    // message instead of a thrown rejection), so this only marks that a message
    // was submitted, not that the assistant answered successfully. There is
    // deliberately no `chat_message` 'failed' call site for that reason.
    if (!completedRef.current) {
      completedRef.current = true;
      trackAction('chat_message', 'completed');
    }
  };

  const handleVoicePress = async () => {
    if (isRecording) await stopRecording();
    else await startRecording();
  };

  const handleVoiceLongPress = () => {
    if (isRecording) cancelRecording();
  };

  return {
    inputText,
    setInputText,
    flatListRef,
    handleSend,
    isRecording,
    isProcessing,
    handleVoicePress,
    handleVoiceLongPress,
    mentionCandidates,
    insertMention,
    messages,
    conversations,
    currentConversationId,
    isLoading,
    isConfirming,
    confirmAction,
    rejectAction,
    sendMessage,
    startNewConversation,
    loadConversations,
    loadConversation,
    currentIsShared,
    setConversationShared,
    hasOtherMembers,
    canToggleShared,
    userId,
  };
}

export type UseChatScreenDataReturn = ReturnType<typeof useChatScreenData>;
