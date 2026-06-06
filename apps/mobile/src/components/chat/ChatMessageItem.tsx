import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { ActionConfirmationCard } from './ActionConfirmationCard';
import { ActionResultCard } from './ActionResultCard';
import type { ChatMessage } from '@/stores/chatStore';
import { useTheme, useStyles, type Theme } from '@/theme';

interface ChatMessageItemProps {
  item: ChatMessage;
  userId: string | undefined;
  isConfirming: boolean;
  onConfirm: (actionId: string) => Promise<void>;
  onReject: (actionId: string, reason?: string) => Promise<void>;
}

export function ChatMessageItem({
  item,
  userId,
  isConfirming,
  onConfirm,
  onReject,
}: ChatMessageItemProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const markdownStyles = {
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
    paragraph: { marginVertical: 2 },
    strong: { fontWeight: '600' as const },
    em: { fontStyle: 'italic' as const },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    list_item: { marginVertical: 2 },
    table: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 6,
      marginVertical: 6,
    },
    thead: { backgroundColor: theme.colors.surfaceSecondary },
    th: {
      padding: 6,
      fontWeight: '600' as const,
      borderWidth: 0.5,
      borderColor: theme.colors.border,
    },
    td: { padding: 6, borderWidth: 0.5, borderColor: theme.colors.border },
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
  };

  const isOwnMessage = item.role === 'user' && (!item.senderUserId || item.senderUserId === userId);
  const isOtherMember = item.role === 'user' && !!item.senderUserId && item.senderUserId !== userId;
  const isUser = isOwnMessage;

  const handleLongPress = () => {
    const preview = item.content.length > 80 ? item.content.slice(0, 80) + '…' : item.content;
    Alert.alert('', preview, [
      { text: t('common.copy'), onPress: () => Clipboard.setStringAsync(item.content) },
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
        style={styles.bubbleTouchable}
        onLongPress={handleLongPress}
        activeOpacity={0.85}
        delayLongPress={400}
      >
        <View style={[styles.messageBubble, isUser && styles.userMessageBubble]}>
          {isOtherMember && item.senderName && (
            <Text style={styles.senderLabel}>{item.senderName}</Text>
          )}
          {isUser || isOtherMember ? (
            <Text style={[styles.messageText, isUser && styles.userMessageText]}>
              {item.content}
            </Text>
          ) : (
            <Markdown style={markdownStyles}>{item.content}</Markdown>
          )}
          {!isUser && item.pendingAction && (
            <ActionConfirmationCard
              pendingAction={item.pendingAction}
              onConfirm={onConfirm}
              onReject={onReject}
              isConfirming={isConfirming}
            />
          )}
          {!isUser && item.actionResult && <ActionResultCard actionResult={item.actionResult} />}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    messageContainer: {
      flexDirection: 'row',
      marginBottom: theme.spacing[4],
      alignItems: 'flex-end',
    },
    userMessageContainer: {
      justifyContent: 'flex-end',
    },
    avatarContainer: {
      width: 32,
      height: 32,
      borderRadius: theme.borderRadius.xl,
      backgroundColor: theme.colors.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: theme.spacing[2],
    },
    bubbleTouchable: {
      maxWidth: '80%' as const,
      flexShrink: 1,
    },
    messageBubble: {
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
    senderLabel: {
      ...theme.textStyles.bodySm,
      color: theme.colors.primary,
      fontWeight: '600',
      marginBottom: theme.spacing[1],
    },
  });
