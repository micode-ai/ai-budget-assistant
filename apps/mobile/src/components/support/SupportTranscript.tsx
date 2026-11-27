import React, { useCallback, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { SupportMessageView } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { lastUserStatus } from '@/features/support/supportDisplay';
import type { UseSupportThreadReturn } from '@/features/support/useSupportThread';
import { SupportMessageBubble } from './SupportMessageBubble';

interface Props {
  support: UseSupportThreadReturn;
  /** Desktop: the reading column's width; the list itself stays full width so its scrollbar stays put. */
  columnWidth?: number;
}

/**
 * The conversation: loading, load error, empty intro, or an INVERTED list of
 * bubbles (newest at the bottom, older pages loaded on reaching the top).
 * The empty and error states render outside the list — an inverted list
 * draws its empty component upside down on some platforms.
 */
export function SupportTranscript({ support, columnWidth }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { thread, loading, error, refresh, loadOlder, loadingOlder } = support;
  const messages = useMemo(() => thread?.messages ?? [], [thread?.messages]);
  const autoTranslate = thread?.autoTranslate ?? true;

  const inverted = useMemo(() => [...messages].reverse(), [messages]);
  const status = lastUserStatus(messages);
  const lastUserId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].author === 'user') return messages[i].id;
    return null;
  }, [messages]);
  const awaitingReply = messages.length > 0 && messages[messages.length - 1].author === 'user';

  const renderItem = useCallback(
    ({ item }: { item: SupportMessageView }) => (
      <SupportMessageBubble
        message={item}
        autoTranslate={autoTranslate}
        status={item.id === lastUserId ? status : null}
        showReplyHint={item.id === lastUserId && awaitingReply}
      />
    ),
    [autoTranslate, lastUserId, status, awaitingReply],
  );

  const column = columnWidth ? { width: columnWidth, alignSelf: 'center' as const } : null;

  if (loading && messages.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error && messages.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={40} color={theme.colors.textTertiary} />
        <Text style={styles.stateText}>{t('support.loadFailed')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => void refresh()} accessibilityRole="button">
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (messages.length === 0) {
    return (
      <View style={styles.centered}>
        <View style={[styles.introCard, column]}>
          <Ionicons name="mail-outline" size={40} color={theme.colors.primary} />
          <Text style={styles.introTitle}>{t('support.introTitle')}</Text>
          <Text style={styles.stateText}>{t('support.intro')}</Text>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      data={inverted}
      inverted
      renderItem={renderItem}
      keyExtractor={(m) => m.id}
      style={styles.list}
      contentContainerStyle={[styles.listContent, column]}
      onEndReached={() => void loadOlder()}
      onEndReachedThreshold={0.3}
      // Inverted: the footer is drawn at the TOP, where older pages arrive.
      ListFooterComponent={
        loadingOlder ? <ActivityIndicator style={styles.older} color={theme.colors.primary} /> : null
      }
      keyboardShouldPersistTaps="handled"
    />
  );
}

const createStyles = (theme: Theme) => ({
  list: {
    flex: 1,
  },
  listContent: {
    padding: theme.spacing[4],
  },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
  introCard: {
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    maxWidth: 480,
  },
  introTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  stateText: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
  },
  retryText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
  },
  older: {
    marginVertical: theme.spacing[3],
  },
});
