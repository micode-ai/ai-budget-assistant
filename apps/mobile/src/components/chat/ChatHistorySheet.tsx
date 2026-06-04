import { Modal, View, Text, FlatList, TouchableOpacity, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ChatConversation } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

interface ChatHistorySheetProps {
  visible: boolean;
  onClose: () => void;
  conversations: ChatConversation[];
  currentConversationId: string | null;
  isLoading: boolean;
  onSelectConversation: (conversation: ChatConversation) => void;
}

export function ChatHistorySheet({
  visible,
  onClose,
  conversations,
  currentConversationId,
  isLoading,
  onSelectConversation,
}: ChatHistorySheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const renderConversationItem = ({ item }: { item: ChatConversation }) => {
    const isActive = item.id === currentConversationId;
    const title = item.title || t('chat.conversationUntitled');
    const date = new Date(item.updatedAt);
    const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return (
      <TouchableOpacity
        style={[styles.conversationItem, isActive && styles.conversationItemActive]}
        onPress={() => onSelectConversation(item)}
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('chat.historyTitle')}</Text>
            <TouchableOpacity onPress={onClose}>
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
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
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
      alignSelf: 'center',
      marginTop: theme.spacing[3],
      marginBottom: theme.spacing[2],
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing[5],
      paddingVertical: theme.spacing[3.5],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.borderLight,
    },
    conversationItemActive: {
      backgroundColor: theme.colors.primaryLight,
    },
    conversationItemContent: {
      flexDirection: 'row',
      alignItems: 'center',
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
      fontWeight: '600',
    },
    conversationDate: {
      ...theme.textStyles.bodySm,
      color: theme.colors.textTertiary,
    },
    historyLoadingContainer: {
      alignItems: 'center',
      paddingVertical: theme.spacing[8],
      gap: theme.spacing[3],
    },
    historyLoadingText: {
      ...theme.textStyles.bodySm,
      color: theme.colors.textTertiary,
    },
    historyEmptyContainer: {
      alignItems: 'center',
      paddingVertical: theme.spacing[12],
      gap: theme.spacing[3],
    },
    historyEmptyText: {
      ...theme.textStyles.bodyLarge,
      color: theme.colors.textTertiary,
    },
  });
