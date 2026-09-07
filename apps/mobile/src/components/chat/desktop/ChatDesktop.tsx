import { useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useChatStore } from '@/stores/chatStore';
import { useAccountStore } from '@/stores/accountStore';
import { ChatMessageItem } from '@/components/chat';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import type { UseChatScreenDataReturn } from '@/features/chat/useChatScreenData';
import type { ChatMessage } from '@/stores/chatStore';
import {
  resolveRailState,
  railIsVisible,
  chatColumnWidth,
  currentConversationTitle,
} from '@/features/chat/chatLayout';
import { ConversationRail } from './ConversationRail';
import { ChatEmptyState } from './ChatEmptyState';

interface ChatDesktopProps {
  chat: UseChatScreenDataReturn;
}

/**
 * The desktop shell (design spec's "Layout" + "Wireframe at 1440"): a
 * persistent conversation rail beside a bounded-measure transcript, a title
 * bar naming the open conversation, and a full-width composer whose ROW is
 * capped to the same column. Reads `chat` as ONE prop from
 * `useChatScreenData()` — see that hook's own doc comment for why it is
 * never called a second time in here.
 *
 * Renders `ChatMessageItem` (and, through it, `ActionConfirmationCard`/
 * `ActionResultCard`) with `desktop` — the design's Q1/Q5 bubble-measure and
 * card-width treatment — and `ChatEmptyState` as the transcript's
 * `ListEmptyComponent` — the design's Q4 empty state, staying inside the
 * same capped column so sending the first message moves nothing
 * horizontally. Below `DESKTOP_MIN_WIDTH` this component never mounts at
 * all — `ChatView.web.tsx` is the one file that decides.
 */
export function ChatDesktop({ chat }: ChatDesktopProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  // `conversationsStatus` is read ONLY here (and by `ConversationRail`) — see
  // that field's own doc comment in `chatStore.ts`. Mobile's `ChatHistorySheet`
  // keeps reading `isLoading` (its own, separately wrong, pre-existing flag).
  const conversationsStatus = useChatStore((s) => s.conversationsStatus);
  const railState = resolveRailState(conversationsStatus, chat.conversations.length);
  const railVisible = railIsVisible(railState);
  const columnWidth = chatColumnWidth(width, theme.spacing[5], railVisible);
  const title = currentConversationTitle(chat.conversations, chat.currentConversationId) ?? t('chat.conversationUntitled');

  // The rail's data has to be (re)fetched on every ACCOUNT change, not merely
  // on this component's own mount. `accountStore.ts`'s
  // `clearAccountScopedCaches()` already does the teardown half for
  // `chatStore` (`reset()`, called from its `[currentAccountId]`
  // subscription) — this is the matching REFILL half, the exact idiom that
  // comment documents for `tagStore`/`projectStore`: "Screens keep only the
  // refill half — a load effect keyed on `[currentAccountId]`".
  //
  // A mount-only fetch (what `ConversationRail` used to own) is not enough:
  // `reset()` sets `conversationsStatus` back to `'idle'`, which
  // `resolveRailState` maps to the rail's own *visible* `'loading'` state —
  // so if the rail was already visible before the switch (the common case,
  // an open conversation list), it goes `'list'` -> `'loading'` without ever
  // unmounting, and a mount-only effect never fires again. Reproduced on the
  // deployed build: switch accounts while the rail shows a populated list,
  // and it sticks on "Loading…" forever with nothing left to trigger a
  // refetch — the API is fine, nothing ever asks it again. This effect is
  // the one place guaranteed to run on every account change regardless of
  // the rail's own mount/unmount cycle, because `ChatDesktop` itself never
  // unmounts merely because the account (or the rail's visibility) changed.
  //
  // Also owns the bounded 5s wait (design's "States" section, moved here
  // from `ConversationRail`'s former mount effect for the same reason): a
  // request that never settles must not leave the rail stuck in `'loading'`
  // forever with no route back to the user's conversations. Re-armed on
  // every account change; a stale timer from the PREVIOUS account's attempt
  // is cleared via the effect's own cleanup before this one starts.
  useEffect(() => {
    chat.loadConversations();
    const timer = setTimeout(() => {
      if (useChatStore.getState().conversationsStatus === 'loading') {
        useChatStore.setState({ conversationsStatus: 'error' });
      }
    }, 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccountId]);

  // The one visible seam the design names: a brand-new account has no
  // conversations, so the rail starts `hidden` (ready+0) and stays hidden
  // through `startNewConversation` + the first `sendMessage` — neither
  // touches `conversations`, only `currentConversationId`. Without this, the
  // rail would never learn conversation #1 exists once it's created. Fires
  // only when the id in hand isn't (yet) in the loaded list — a no-op for
  // ordinary rail-driven selection, where it always already is, and a no-op
  // on the account-switch path above (there, `currentConversationId` is
  // cleared to `null`, which fails this effect's own truthiness check).
  useEffect(() => {
    if (chat.currentConversationId && !chat.conversations.some((c) => c.id === chat.currentConversationId)) {
      chat.loadConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.currentConversationId]);

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <ChatMessageItem
      item={item}
      userId={chat.userId}
      isConfirming={chat.isConfirming}
      onConfirm={chat.confirmAction}
      onReject={chat.rejectAction}
      desktop
    />
  );

  return (
    <View style={styles.root}>
      {/* `railState !== 'hidden'` (rather than the `railVisible` boolean)
          narrows `railState`'s type here, matching the prop's own
          `Exclude<RailState, 'hidden'>` — the two are equivalent booleans. */}
      {railState !== 'hidden' && (
        <ConversationRail
          state={railState}
          conversations={chat.conversations}
          currentConversationId={chat.currentConversationId}
          onSelectConversation={chat.loadConversation}
          onNewConversation={chat.startNewConversation}
          loadConversations={chat.loadConversations}
        />
      )}

      <View style={styles.mainPane}>
        {/* Full-width bar; its ROW is the column (design's placement rule 1 —
            capping the bar itself as a surface would leave the transcript's
            ground showing beside a floating island). */}
        <View style={styles.titleBar}>
          <View style={[styles.titleBarRow, { width: columnWidth }]}>
            <Text style={styles.titleText} numberOfLines={1}>
              {title}
            </Text>
            {chat.hasOtherMembers &&
              (chat.canToggleShared ? (
                <TouchableOpacity
                  style={styles.sharedToggle}
                  onPress={() => chat.setConversationShared(!chat.currentIsShared)}
                >
                  <Ionicons
                    name={chat.currentIsShared ? 'people' : 'person'}
                    size={16}
                    color={chat.currentIsShared ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <Text style={[styles.sharedToggleText, chat.currentIsShared && { color: theme.colors.primary }]}>
                    {chat.currentIsShared ? t('chat.shared') : t('chat.private')}
                  </Text>
                </TouchableOpacity>
              ) : chat.currentIsShared ? (
                <View style={styles.sharedToggle}>
                  <Ionicons name="people" size={16} color={theme.colors.primary} />
                  <Text style={[styles.sharedToggleText, { color: theme.colors.primary }]}>
                    {t('chat.shared')}
                  </Text>
                </View>
              ) : null)}
          </View>
        </View>

        {/* The transcript spans the full main pane so its scrollbar stays put;
            only its CONTENT is capped, via `contentContainerStyle` — never by
            wrapping the FlatList (design's placement rule 2).
            `ListEmptyComponent` stays inside that same capped
            `contentContainerStyle`, so it renders at `columnWidth` too — the
            design's Q4 requirement that the empty state and the transcript
            share one width. */}
        <FlatList
          ref={chat.flatListRef}
          data={chat.messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          style={styles.transcript}
          contentContainerStyle={[
            styles.messageList,
            { width: columnWidth },
            chat.messages.length === 0 && styles.emptyList,
          ]}
          ListEmptyComponent={<ChatEmptyState onSendMessage={chat.sendMessage} />}
          onContentSizeChange={() => chat.flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {chat.isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.loadingText}>{t('chat.thinking')}</Text>
          </View>
        )}

        {/* Unchanged from mobile — already an overlay, not a sheet. */}
        {chat.isProcessing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.processingText}>{t('chat.processingVoice')}</Text>
          </View>
        )}

        <View style={styles.usageBadgeRow}>
          <AiUsageBadge />
        </View>

        {chat.mentionCandidates.length > 0 && (
          <View style={styles.mentionBar}>
            <View style={[styles.mentionBarRow, { width: columnWidth }]}>
              {chat.mentionCandidates.map((mem) => (
                <TouchableOpacity
                  key={mem.userId}
                  style={styles.mentionChip}
                  onPress={() => chat.insertMention(mem)}
                >
                  <Text style={styles.mentionChipText}>@{mem.user?.name ?? 'member'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Full-width bar; its ROW is the column, at the same 16px inset as
            the transcript rows — not the composer's mobile 12px — so mic and
            send line up with the bubbles' outer edges above them. */}
        <View style={styles.composerBar}>
          <View style={[styles.composerRow, { width: columnWidth }]}>
            <TouchableOpacity
              style={[styles.voiceButton, chat.isRecording && styles.voiceButtonActive]}
              onPress={chat.handleVoicePress}
              onLongPress={chat.handleVoiceLongPress}
              disabled={chat.isProcessing}
            >
              {chat.isProcessing ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons
                  name={chat.isRecording ? 'stop' : 'mic'}
                  size={24}
                  color={chat.isRecording ? theme.colors.danger : theme.colors.primary}
                />
              )}
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              value={chat.inputText}
              onChangeText={chat.setInputText}
              placeholder={t('chat.placeholder')}
              placeholderTextColor={theme.colors.textTertiary}
              multiline
              maxLength={4000}
              onSubmitEditing={chat.handleSend}
              // multiline maps to a <textarea> on web, where onSubmitEditing
              // never fires. Send on Enter (Shift+Enter inserts a newline).
              // No key is ever bound to confirming a pending action.
              onKeyPress={(e: any) => {
                if (e?.nativeEvent?.key === 'Enter' && !e?.shiftKey && !e?.nativeEvent?.shiftKey) {
                  e.preventDefault?.();
                  chat.handleSend();
                }
              }}
            />

            <TouchableOpacity
              style={[
                styles.sendButton,
                (!chat.inputText.trim() || chat.isLoading) && styles.sendButtonDisabled,
              ]}
              onPress={chat.handleSend}
              disabled={!chat.inputText.trim() || chat.isLoading}
            >
              <Ionicons name="send" size={20} color={theme.colors.textInverse} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  root: {
    flex: 1,
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.background,
  },
  mainPane: {
    flex: 1,
    minWidth: 0,
  },
  titleBar: {
    width: '100%' as const,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  titleBarRow: {
    alignSelf: 'center' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  titleText: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flexShrink: 1,
    marginRight: theme.spacing[2],
  },
  sharedToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  sharedToggleText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  transcript: {
    flex: 1,
  },
  messageList: {
    alignSelf: 'center' as const,
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  emptyList: {
    flexGrow: 1,
  },
  loadingContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[2],
  },
  loadingText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  usageBadgeRow: {
    width: '100%' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1],
  },
  mentionBar: {
    width: '100%' as const,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  mentionBarRow: {
    alignSelf: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  mentionChip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius['2xl'],
    backgroundColor: theme.colors.primaryLight,
  },
  mentionChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  composerBar: {
    width: '100%' as const,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  composerRow: {
    alignSelf: 'center' as const,
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[2],
  },
  voiceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  voiceButtonActive: {
    backgroundColor: theme.colors.dangerLight,
  },
  textInput: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius['2xl'],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.textDisabled,
  },
  processingOverlay: {
    position: 'absolute' as const,
    bottom: 80,
    left: 0,
    right: 0,
    backgroundColor: theme.isDark ? 'rgba(15, 17, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    padding: theme.spacing[5],
    alignItems: 'center' as const,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  processingText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[3],
  },
});
