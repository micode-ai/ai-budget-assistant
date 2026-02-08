import { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useChatStore, ChatMessage } from '@/stores/chatStore';
import { useVoiceInput } from '@/features/voice/useVoiceInput';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function ChatScreen() {
  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { messages, isLoading, sendMessage } = useChatStore();
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
    // Scroll to bottom when new messages arrive
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  useEffect(() => {
    // Show voice error if any
    if (voiceError) {
      Alert.alert(t('common.error'), voiceError);
    }
  }, [voiceError]);

  useEffect(() => {
    // Send transcription as message when available
    if (transcription) {
      sendMessage(transcription);
    }
  }, [transcription, sendMessage]);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const text = inputText.trim();
    setInputText('');
    await sendMessage(text);
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

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';

    return (
      <View style={[styles.messageContainer, isUser && styles.userMessageContainer]}>
        {!isUser && (
          <View style={styles.avatarContainer}>
            <Ionicons name="sparkles" size={20} color={theme.colors.primary} />
          </View>
        )}
        <View style={[styles.messageBubble, isUser && styles.userMessageBubble]}>
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {item.content}
          </Text>
        </View>
      </View>
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

  return (
    <SafeAreaView style={styles.container} edges={[]}>
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
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
});
