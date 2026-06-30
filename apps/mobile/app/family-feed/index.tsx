import React, { useCallback } from 'react';
import { View, FlatList, Text, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useFamilyFeedStore } from '@/stores/familyFeedStore';
import { FeedGroupCard } from '@/components/feed/FeedGroupCard';
import type { FeedGroup } from '@budget/shared-types';

export default function FamilyFeedScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { groups, isLoading, loadFeed } = useFamilyFeedStore();

  useFocusEffect(
    useCallback(() => {
      void loadFeed();
    }, [loadFeed]),
  );

  const renderItem = useCallback(({ item }: { item: FeedGroup }) => <FeedGroupCard group={item} />, []);
  const keyExtractor = useCallback((item: FeedGroup) => item.id, []);

  if (isLoading && groups.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={groups}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={[styles.list, groups.length === 0 && styles.emptyContainer]}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={loadFeed} tintColor={theme.colors.primary} />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>{t('familyFeed.noActivity')}</Text>
          <Text style={[styles.emptyDesc, { color: theme.colors.textSecondary }]}>{t('familyFeed.noActivityDesc')}</Text>
        </View>
      }
    />
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 16, paddingBottom: 40 },
    emptyContainer: { flex: 1 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 32 },
    emptyTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
    emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  });
