import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import type { ChatMessage } from '@/stores/chatStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { ChatMessageItem, ChatHistorySheet } from '@/components/chat';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import type { UseChatScreenDataReturn } from '@/features/chat/useChatScreenData';

interface ChatMobileProps {
  chat: UseChatScreenDataReturn;
}

/**
 * Today's JSX and `createStyles`, moved verbatim out of
 * `app/(tabs)/chat.tsx` — the one definition of the mobile rendering. If it
 * renders differently after this move, that is a bug, not a feature.
 *
 * All state/effects/handlers live in `useChatScreenData` (called by the
 * platform `ChatView` files, not here) and arrive as the single `chat` prop.
 * `historyVisible` is the one piece of state that stays local to this
 * component — it is the history sheet's own open/closed state, and the sheet
 * has no desktop existence under the design this split is for.
 */
export function ChatMobile({ chat }: ChatMobileProps) {
  const { t } = useTranslation();
  const [historyVisible, setHistoryVisible] = useState(false);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const handleOpenHistory = useCallback(async () => {
    setHistoryVisible(true);
    await chat.loadConversations();
  }, [chat.loadConversations]);

  const handleSelectConversation = useCallback(
    async (conversation: { id: string }) => {
      setHistoryVisible(false);
      await chat.loadConversation(conversation.id);
    },
    [chat.loadConversation],
  );

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <ChatMessageItem
      item={item}
      userId={chat.userId}
      isConfirming={chat.isConfirming}
      onConfirm={chat.confirmAction}
      onReject={chat.rejectAction}
    />
  );

  const QuickActions = () => (
    <View style={styles.quickActions}>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => chat.sendMessage(t('chat.topExpensesQ'))}
      >
        <Text style={styles.quickActionText}>{t('chat.topExpenses')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => chat.sendMessage(t('chat.budgetStatusQ'))}
      >
        <Text style={styles.quickActionText}>{t('chat.budgetStatus')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.quickActionButton}
        onPress={() => chat.sendMessage(t('chat.savingTipsQ'))}
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
        {chat.currentConversationId ? (
          <TouchableOpacity style={styles.newConvButton} onPress={chat.startNewConversation}>
            <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.newConvText}>{t('chat.newConversation')}</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        <View style={styles.topBarRight}>
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
                <Text
                  style={[styles.sharedToggleText, chat.currentIsShared && { color: theme.colors.primary }]}
                >
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
          <TouchableOpacity style={styles.historyButton} onPress={handleOpenHistory}>
            <Ionicons name="time-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.historyButtonText}>{t('chat.history')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.keyboardView} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          ref={chat.flatListRef}
          data={chat.messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.messageList, chat.messages.length === 0 && styles.emptyList]}
          ListEmptyComponent={EmptyChat}
          onContentSizeChange={() => chat.flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {chat.isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.loadingText}>{t('chat.thinking')}</Text>
          </View>
        )}

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
        )}

        <View style={styles.inputContainer}>
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
            // Web: multiline maps to a <textarea>, where onSubmitEditing never
            // fires. Send on Enter (Shift+Enter inserts a newline).
            onKeyPress={
              Platform.OS === 'web'
                ? (e: any) => {
                    if (e?.nativeEvent?.key === 'Enter' && !e?.shiftKey && !e?.nativeEvent?.shiftKey) {
                      e.preventDefault?.();
                      chat.handleSend();
                    }
                  }
                : undefined
            }
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
      </KeyboardAvoidingView>

      <ChatHistorySheet
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        conversations={chat.conversations}
        currentConversationId={chat.currentConversationId}
        isLoading={chat.isLoading}
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
