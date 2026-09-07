import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { showAlert } from '@/utils/alert';
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
  /** Additive, default `false` (design's §5a rule 1) — the phone keeps its
   *  `'80%'` bubble cap BY CONSTRUCTION. See `bubbleTouchableWide` below for
   *  what changes when this is `true`. */
  desktop?: boolean;
}

export function ChatMessageItem({
  item,
  userId,
  isConfirming,
  onConfirm,
  onReject,
  desktop = false,
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
    showAlert('', preview, [
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
        style={[styles.bubbleTouchable, desktop && !isUser && styles.bubbleTouchableWide]}
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
              desktop={desktop}
            />
          )}
          {!isUser && item.actionResult && (
            <ActionResultCard actionResult={item.actionResult} desktop={desktop} />
          )}
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
    // Design's "The measure" — Q1: on desktop the assistant/other-member
    // bubble has NO cap of its own; the column (via the caller's capped
    // `contentContainerStyle`) is the cap. `100%` — not `undefined`/no
    // maxWidth at all — so a long unwrapped run still can't push past the
    // row: `flexShrink` still lets it hug shorter content, this only raises
    // the ceiling from 80% of the row to the row itself (minus the avatar
    // lane, which is a flex sibling, not this style). Never applied to the
    // own-message bubble — its 80% stays, just of a bounded row now.
    bubbleTouchableWide: {
      maxWidth: '100%' as const,
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
