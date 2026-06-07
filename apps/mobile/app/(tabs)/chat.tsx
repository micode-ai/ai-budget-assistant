import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { useChatStore, type ChatMessage } from '@/stores/chatStore';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useVoiceInput } from '@/features/voice/useVoiceInput';
import { useTheme, useStyles, type Theme } from '@/theme';
import { ChatMessageItem, ChatHistorySheet } from '@/components/chat';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import { useChatPolling } from '@/hooks/useChatPolling';
import { useMentionBar } from '@/hooks/useMentionBar';

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
    if (voiceError) Alert.alert(t('common.error'), voiceError);
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
  };

  const handleVoicePress = async () => {
    if (isRecording) await stopRecording();
    else await startRecording();
  };

  const handleVoiceLongPress = () => {
    if (isRecording) cancelRecording();
  };

  const handleOpenHistory = useCallback(async () => {
    setHistoryVisible(true);
    await loadConversations();
  }, [loadConversations]);

  const handleSelectConversation = useCallback(
    async (conversation: { id: string }) => {
      setHistoryVisible(false);
      await loadConversation(conversation.id);
    },
    [loadConversation],
  );

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <ChatMessageItem
      item={item}
      userId={userId}
      isConfirming={isConfirming}
      onConfirm={confirmAction}
      onReject={rejectAction}
    />
  );

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
      <Text style={styles.emptySubtitle}>{t('chat.subtitle')}</Text>
      <QuickActions />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Top bar: new conversation + shared toggle + history */}
      <View style={styles.topBar}>
        {currentConversationId ? (
          <TouchableOpacity style={styles.newConvButton} onPress={startNewConversation}>
            <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.newConvText}>{t('chat.newConversation')}</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        <View style={styles.topBarRight}>
          {hasOtherMembers &&
            (canToggleShared ? (
              <TouchableOpacity
                style={styles.sharedToggle}
                onPress={() => setConversationShared(!currentIsShared)}
              >
                <Ionicons
                  name={currentIsShared ? 'people' : 'person'}
                  size={16}
                  color={currentIsShared ? theme.colors.primary : theme.colors.textSecondary}
                />
                <Text style={[styles.sharedToggleText, currentIsShared && { color: theme.colors.primary }]}>
                  {currentIsShared ? t('chat.shared') : t('chat.private')}
                </Text>
              </TouchableOpacity>
            ) : currentIsShared ? (
              <View style={styles.sharedToggle}>
                <Ionicons name="people" size={16} color={theme.colors.primary} />
                <Text style={[styles.sharedToggleText, { color: theme.colors.primary }]}>
                  {t('chat.shared')}
                </Text>
              </View>
            ) : null)}
          <TouchableOpacity style={styles.historyButton} onPress={handleOpenHistory}>
            <Ionicons name="time-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.historyButtonText}>{t('chat.history')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.keyboardView} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.messageList, messages.length === 0 && styles.emptyList]}
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
              <TouchableOpacity
                key={mem.userId}
                style={styles.mentionChip}
                onPress={() => insertMention(mem)}
              >
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
            // Web: multiline maps to a <textarea>, where onSubmitEditing never
            // fires. Send on Enter (Shift+Enter inserts a newline).
            onKeyPress={
              Platform.OS === 'web'
                ? (e: any) => {
                    if (e?.nativeEvent?.key === 'Enter' && !e?.shiftKey && !e?.nativeEvent?.shiftKey) {
                      e.preventDefault?.();
                      handleSend();
                    }
                  }
                : undefined
            }
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

      <ChatHistorySheet
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        conversations={conversations}
        currentConversationId={currentConversationId}
        isLoading={isLoading}
        onSelectConversation={handleSelectConversation}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[2],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.borderLight,
    },
    newConvButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    newConvText: {
      ...theme.textStyles.bodySm,
      color: theme.colors.primary,
    },
    historyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    historyButtonText: {
      ...theme.textStyles.bodySm,
      color: theme.colors.primary,
    },
    topBarRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    sharedToggle: {
      flexDirection: 'row',
      alignItems: 'center',
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
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: theme.spacing[8],
    },
    emptyIconContainer: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: theme.colors.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
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
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: theme.spacing[8],
    },
    quickActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
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
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing[2],
      gap: theme.spacing[2],
    },
    loadingText: {
      ...theme.textStyles.bodySm,
      color: theme.colors.textTertiary,
    },
    usageBadgeRow: {
      alignItems: 'center',
      paddingVertical: theme.spacing[1],
    },
    mentionBar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
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
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
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
      justifyContent: 'center',
      alignItems: 'center',
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
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: theme.colors.textDisabled,
    },
    processingOverlay: {
      position: 'absolute',
      bottom: 80,
      left: 0,
      right: 0,
      backgroundColor: theme.isDark ? 'rgba(15, 17, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      padding: theme.spacing[5],
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    processingText: {
      ...theme.textStyles.bodyLarge,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing[3],
    },
  });
