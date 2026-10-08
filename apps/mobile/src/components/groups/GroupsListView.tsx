import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useGroupStore } from '@/stores/groupStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { GroupButton } from './GroupButton';
import { GroupErrorState } from './GroupErrorState';
import { GroupListRow } from './GroupListRow';

/** "My groups" with my balance in each, plus New group / Join with link. */
export function GroupsListView() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const groups = useGroupStore((s) => s.groups);
  const isLoading = useGroupStore((s) => s.isLoading);
  const loadGroups = useGroupStore((s) => s.loadGroups);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async () => {
    try {
      await loadGroups();
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoadedOnce(true);
    }
  }, [loadGroups]);

  // Balances change from other screens (settle, add expense) and from guests, so refresh on focus.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const actions = (
    <View style={styles.actions}>
      <GroupButton
        label={t('groups.newGroup')}
        onPress={() => router.push('/groups/new' as never)}
        style={styles.actionButton}
      />
      <GroupButton
        label={t('groups.joinWithLink')}
        onPress={() => router.push('/groups/join' as never)}
        variant="secondary"
        style={styles.actionButton}
      />
    </View>
  );

  if (!loadedOnce && isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadFailed && groups.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <GroupErrorState onRetry={load} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        renderItem={({ item }) => (
          <GroupListRow group={item} onPress={() => router.push(`/groups/${item.id}` as never)} />
        )}
        ListHeaderComponent={actions}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={56} color={theme.colors.textTertiary} />
            <Text style={styles.emptyTitle}>{t('groups.listEmpty')}</Text>
            <Text style={styles.emptyHint}>{t('groups.listEmptyHint')}</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  listContent: {
    padding: theme.spacing[4],
    flexGrow: 1,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  actionButton: {
    flex: 1,
  },
  separator: {
    height: theme.spacing[3],
  },
  empty: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[3],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  emptyHint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
});
