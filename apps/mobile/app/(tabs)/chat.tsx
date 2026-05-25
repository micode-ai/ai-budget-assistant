import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-native-markdown-display';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useChatStore, ChatMessage } from '@/stores/chatStore';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useVoiceInput } from '@/features/voice/useVoiceInput';
import { useTheme, useStyles, type Theme } from '@/theme';
import { ActionConfirmationCard, ActionResultCard } from '@/components/chat';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import * as Clipboard from 'expo-clipboard';
import type { ChatConversation } from '@budget/shared-types';

export default function ChatScreen() {
  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  const [historyVisible, setHistoryVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { currentAccount, isOwner, members, loadMembers } = useAccountStore();
  const account = currentAccount();
  const accountMembers = account ? (members[account.id] ?? []) : [];
  const hasOtherMembers = accountMembers.length > 1;
  const canToggleShared = isOwner() && hasOtherMembers;
  const userId = useAuthStore((s) => s.user?.id);
  const [pendingMentions, setPendingMentions] = useState<{ userId: string }[]>([]);

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
    setConversationShared,
    startPolling,
    stopPolling,
  } = useChatStore();

  const markdownStyles = useMemo(
    () => ({
      body: {
        color: theme.colors.messageBubbleAIText,
        fontSize: 15,
        lineHeight: 22,
      },
      heading2: {
        color: theme.colors.messageBubbleAIText,
        fontWeight: '600' as const,
        fontSize: 17,
        marginTop: 8,
        marginBottom: 4,
      },
      heading3: {
        color: theme.colors.messageBubbleAIText,
        fontWeight: '600' as const,
        fontSize: 15,
        marginTop: 6,
        marginBottom: 3,
      },
      paragraph: {
        marginVertical: 2,
      },
      strong: {
        fontWeight: '600' as const,
      },
      em: {
        fontStyle: 'italic' as const,
      },
      bullet_list: {
        marginVertical: 4,
      },
      ordered_list: {
        marginVertical: 4,
      },
      list_item: {
        marginVertical: 2,
      },
      table: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        marginVertical: 6,
      },
      thead: {
        backgroundColor: theme.colors.surfaceSecondary,
      },
      th: {
        padding: 6,
        fontWeight: '600' as const,
        borderWidth: 0.5,
        borderColor: theme.colors.border,
      },
      td: {
        padding: 6,
        borderWidth: 0.5,
        borderColor: theme.colors.border,
      },
      code_inline: {
        backgroundColor: theme.colors.surfaceSecondary,
        color: theme.colors.primary,
        fontSize: 13,
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 4,
      },
      hr: {
        backgroundColor: theme.colors.divider,
        height: 1,
        marginVertical: 8,
      },
    }),
    [theme],
  );
  const {
    isRecording,
    isProcessing,
    transcription,
    error: voiceError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceInput();

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  useEffect(() => {
    if (voiceError) {
      Alert.alert(t('common.error'), voiceError);
    }
  }, [voiceError, t]);

  useEffect(() => {
    if (transcription) {
      sendMessage(transcription);
    }
  }, [transcription, sendMessage]);

  useEffect(() => {
    if (account?.id) loadMembers(account.id);
  }, [account?.id, loadMembers]);

  useFocusEffect(
    useCallback(() => {
      if (currentIsShared) startPolling();
      return () => stopPolling();
    }, [currentIsShared, startPolling, stopPolling]),
  );

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
    const stillMentioned = pendingMentions.filter((pm) => {
      const name = accountMembers.find((m) => m.userId === pm.userId)?.user?.name;
      return name ? text.includes(`@${name}`) : false;
    });
    setInputText('');
    setPendingMentions([]);
    await sendMessage(text, currentIsShared ? stillMentioned : undefined);
  };

  const handleVoicePress = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const handleVoiceLongPress = () => {
    if (isRecording) {
      cancelRecording();
    }
  };

  const handleOpenHistory = useCallback(async () => {
    setHistoryVisible(true);
    await loadConversations();
  }, [loadConversations]);

  const handleSelectConversation = useCallback(async (conversation: ChatConversation) => {
    setHistoryVisible(false);
    await loadConversation(conversation.id);
  }, [loadConversation]);

  const handleNewConversation = useCallback(() => {
    startNewConversation();
  }, [startNewConversation]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isOwnMessage = item.role === 'user' && (!item.senderUserId || item.senderUserId === userId);
    const isOtherMember = item.role === 'user' && !!item.senderUserId && item.senderUserId !== userId;
    const isUser = isOwnMessage;

    const handleLongPress = () => {
      const preview = item.content.length > 80 ? item.content.slice(0, 80) + '…' : item.content;
      Alert.alert('', preview, [
        {
          text: t('common.copy'),
          onPress: () => Clipboard.setStringAsync(item.content),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    };

    return (
      <View style={[styles.messageContainer, isUser && styles.userMessageContainer]}>
        {!isUser && !isOtherMember && (
          <View style={styles.avatarContainer}>
            <Ionicons name="sparkles" size={20} color={theme.colors.primary} />
          </View>
        )}
        <TouchableOpacity
          onLongPress={handleLongPress}
          activeOpacity={0.85}
          delayLongPress={400}
        >
          <View style={[styles.messageBubble, isUser && styles.userMessageBubble]}>
            {isOtherMember && item.senderName && (
              <Text style={styles.senderLabel}>{item.senderName}</Text>
            )}
            {isUser || isOtherMember ? (
              <Text style={[styles.messageText, isUser && styles.userMessageText]}>{item.content}</Text>
            ) : (
              <Markdown style={markdownStyles}>
                {item.content}
              </Markdown>
            )}
            {!isUser && item.pendingAction && (
              <ActionConfirmationCard
                pendingAction={item.pendingAction}
                onConfirm={confirmAction}
                onReject={rejectAction}
                isConfirming={isConfirming}
              />
            )}
            {!isUser && item.actionResult && (
              <ActionResultCard actionResult={item.actionResult} />
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderConversationItem = ({ item }: { item: ChatConversation }) => {
    const isActive = item.id === currentConversationId;
    const title = item.title || t('chat.conversationUntitled');
    const date = new Date(item.updatedAt);
    const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return (
      <TouchableOpacity
        style={[styles.conversationItem, isActive && styles.conversationItemActive]}
        onPress={() => handleSelectConversation(item)}
        activeOpacity={0.7}
      >
        <View style={styles.conversationItemContent}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={18}
            color={isActive ? theme.colors.primary : theme.colors.textSecondary}
            style={styles.conversationIcon}
          />
          <Text
            style={[styles.conversationTitle, isActive && styles.conversationTitleActive]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {item.isShared && (
            <Ionicons name="people" size={14} color={theme.colors.primary} style={{ marginLeft: 4 }} />
          )}
        </View>
        <Text style={styles.conversationDate}>{dateLabel}</Text>
      </TouchableOpacity>
    );
  };

  const QuickActions = () => (
    <View style={styles.quickActions}>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => sendMessage(t('chat.topExpensesQ'))}
      >
        <Text style={styles.quickActionText}>{t('chat.topExpenses')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => sendMessage(t('chat.budgetStatusQ'))}
      >
        <Text style={styles.quickActionText}>{t('chat.budgetStatus')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => sendMessage(t('chat.savingTipsQ'))}
      >
        <Text style={styles.quickActionText}>{t('chat.savingTips')}</Text>
      </TouchableOpacity>
    </View>
  );

  const EmptyChat = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="chatbubble-ellipses-outline" size={64} color={theme.colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{t('chat.title')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('chat.subtitle')}
      </Text>
      <QuickActions />
    </View>
  );

  const mentionQuery = (() => {
    const m = inputText.match(/(?:^|\s)@([\p{L}\p{N}_]*)$/u);
    return m ? m[1].toLowerCase() : null;
  })();
  const mentionCandidates = currentIsShared && mentionQuery !== null
    ? accountMembers
        .filter((mem) => mem.userId !== userId)
        .filter((mem) => (mem.user?.name ?? '').toLowerCase().includes(mentionQuery))
    : [];

  const insertMention = (mem: { userId: string; user?: { name?: string } }) => {
    const name = mem.user?.name ?? 'member';
    setInputText((prev) => prev.replace(/@[\p{L}\p{N}_]*$/u, `@${name} `));
    setPendingMentions((prev) => (prev.some((p) => p.userId === mem.userId) ? prev : [...prev, { userId: mem.userId }]));
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* History button row */}
      <View style={styles.topBar}>
        {currentConversationId ? (
          <TouchableOpacity style={styles.newConvButton} onPress={handleNewConversation}>
            <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.newConvText}>{t('chat.newConversation')}</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        <View style={styles.topBarRight}>
          {hasOtherMembers && (
            canToggleShared ? (
              <TouchableOpacity style={styles.sharedToggle} onPress={() => setConversationShared(!currentIsShared)}>
                <Ionicons name={currentIsShared ? 'people' : 'person'} size={16} color={currentIsShared ? theme.colors.primary : theme.colors.textSecondary} />
                <Text style={[styles.sharedToggleText, currentIsShared && { color: theme.colors.primary }]}>
                  {currentIsShared ? t('chat.shared') : t('chat.private')}
                </Text>
              </TouchableOpacity>
            ) : currentIsShared ? (
              <View style={styles.sharedToggle}>
                <Ionicons name="people" size={16} color={theme.colors.primary} />
                <Text style={[styles.sharedToggleText, { color: theme.colors.primary }]}>{t('chat.shared')}</Text>
              </View>
            ) : null
          )}
          <TouchableOpacity style={styles.historyButton} onPress={handleOpenHistory}>
            <Ionicons name="time-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.historyButtonText}>{t('chat.history')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.messageList,
            messages.length === 0 && styles.emptyList,
          ]}
          ListEmptyComponent={EmptyChat}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.loadingText}>{t('chat.thinking')}</Text>
          </View>
        )}

        {isProcessing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.processingText}>{t('chat.processingVoice')}</Text>
          </View>
        )}

        <View style={styles.usageBadgeRow}>
          <AiUsageBadge />
        </View>

        {mentionCandidates.length > 0 && (
          <View style={styles.mentionBar}>
            {mentionCandidates.map((mem) => (
              <TouchableOpacity key={mem.userId} style={styles.mentionChip} onPress={() => insertMention(mem)}>
                <Text style={styles.mentionChipText}>@{mem.user?.name ?? 'member'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={[styles.voiceButton, isRecording && styles.voiceButtonActive]}
            onPress={handleVoicePress}
            onLongPress={handleVoiceLongPress}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Ionicons
                name={isRecording ? 'stop' : 'mic'}
                size={24}
                color={isRecording ? theme.colors.danger : theme.colors.primary}
              />
            )}
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            maxLength={4000}
            onSubmitEditing={handleSend}
          />

          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}
          >
            <Ionicons name="send" size={20} color={theme.colors.textInverse} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Conversation history modal */}
      <Modal
        visible={historyVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setHistoryVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setHistoryVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('chat.historyTitle')}</Text>
              <TouchableOpacity onPress={() => setHistoryVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={conversations}
              renderItem={renderConversationItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.conversationList}
              ListEmptyComponent={
                isLoading ? (
                  <View style={styles.historyLoadingContainer}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                    <Text style={styles.historyLoadingText}>{t('chat.loadingHistory')}</Text>
                  </View>
                ) : (
                  <View style={styles.historyEmptyContainer}>
                    <Ionicons name="chatbubbles-outline" size={40} color={theme.colors.textTertiary} />
                    <Text style={styles.historyEmptyText}>{t('chat.historyEmpty')}</Text>
                  </View>
                )
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  topBar: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  newConvButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  newConvText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
  },
  historyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  historyButtonText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
  },
  keyboardView: {
    flex: 1,
  },
  messageList: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[8],
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[6],
  },
  emptyTitle: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  emptySubtitle: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 24,
    marginBottom: theme.spacing[8],
  },
  quickActions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
  },
  quickActionButton: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  quickActionText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  messageContainer: {
    flexDirection: 'row' as const,
    marginBottom: theme.spacing[4],
    alignItems: 'flex-end' as const,
  },
  userMessageContainer: {
    justifyContent: 'flex-end' as const,
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: theme.spacing[2],
  },
  messageBubble: {
    maxWidth: '80%' as const,
    backgroundColor: theme.colors.messageBubbleAI,
    borderRadius: theme.borderRadius.xl,
    borderBottomLeftRadius: theme.spacing[1],
    padding: theme.spacing[3],
    ...theme.shadows.sm,
  },
  userMessageBubble: {
    backgroundColor: theme.colors.messageBubbleUser,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.spacing[1],
  },
  messageText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.messageBubbleAIText,
    lineHeight: 22,
  },
  userMessageText: {
    color: theme.colors.messageBubbleUserText,
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
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1],
  },
  inputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    padding: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
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
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end' as const,
  },
  modalSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    maxHeight: '70%' as const,
    paddingBottom: theme.spacing[8],
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center' as const,
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  modalTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  conversationList: {
    paddingVertical: theme.spacing[2],
  },
  conversationItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[3.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  conversationItemActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  conversationItemContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
    marginRight: theme.spacing[3],
  },
  conversationIcon: {
    marginRight: theme.spacing[2],
  },
  conversationTitle: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  conversationTitleActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  conversationDate: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  historyLoadingContainer: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[8],
    gap: theme.spacing[3],
  },
  historyLoadingText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  historyEmptyContainer: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[12],
    gap: theme.spacing[3],
  },
  historyEmptyText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
  },
  topBarRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
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
  senderLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
    fontWeight: '600' as const,
    marginBottom: theme.spacing[1],
  },
  mentionBar: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
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
});
