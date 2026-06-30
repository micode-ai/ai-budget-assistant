import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useFamilyFeedStore } from '@/stores/familyFeedStore';
import { useAccountStore } from '@/stores/accountStore';
import { FeedGroupCard } from '@/components/feed/FeedGroupCard';

export function FamilyFeedWidget() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const { groups, loadFeed } = useFamilyFeedStore();
  const currentAccountId = useAccountStore((s) => s.currentAccount()?.id);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed, currentAccountId]);

  const preview = groups.slice(0, 3);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{t('familyFeed.title')}</Text>
        <TouchableOpacity onPress={() => router.push('/family-feed')}>
          <Text style={[styles.showAll, { color: theme.colors.primary }]}>{t('familyFeed.showAll')}</Text>
        </TouchableOpacity>
      </View>

      {preview.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textSecondary }]}>{t('familyFeed.noActivity')}</Text>
      ) : (
        preview.map((group) => <FeedGroupCard key={group.id} group={group} />)
      )}
    </View>
  );
}

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    container: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { fontSize: 16, fontWeight: '700' },
    showAll: { fontSize: 14 },
    empty: { fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  });
