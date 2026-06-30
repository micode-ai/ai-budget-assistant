import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePurchaseRequestStore } from '@/stores/purchaseRequestStore';
import { useTheme } from '@/theme';
import type { PurchaseRequest } from '@budget/shared-types';

type Tab = 'PENDING' | 'APPROVED' | 'all';

export default function PurchaseRequestsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { requests, isLoading, loadRequests } = usePurchaseRequestStore();
  const [activeTab, setActiveTab] = useState<Tab>('PENDING');

  useEffect(() => { loadRequests(); }, []);

  const filtered = requests.filter(r => {
    if (activeTab === 'PENDING') return r.status === 'PENDING';
    if (activeTab === 'APPROVED') return r.status === 'APPROVED';
    return ['REJECTED', 'PURCHASED', 'EXPIRED'].includes(r.status);
  });

  const statusColor = (status: string): string => {
    if (status === 'APPROVED') return '#10B981';
    if (status === 'REJECTED') return '#EF4444';
    if (status === 'PENDING') return '#F59E0B';
    return theme.colors.textSecondary;
  };

  const renderItem = ({ item }: { item: PurchaseRequest }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      onPress={() => router.push(`/purchase-requests/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.statusBadge, { color: statusColor(item.status) }]}>
          {t(`purchaseRequests.${item.status.toLowerCase()}`)}
        </Text>
      </View>
      <Text style={[styles.amount, { color: theme.colors.primary }]}>
        {item.amount.toFixed(2)} {item.currency}
      </Text>
      {item.merchant ? (
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>{item.merchant}</Text>
      ) : null}
      <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
        {item.createdByUserName} · {item.votes?.length ?? 0} {t('purchaseRequests.votes')}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.tabs, { borderBottomColor: theme.colors.border }]}>
        {(['PENDING', 'APPROVED', 'all'] as Tab[]).map(tab => (
          <TouchableOpacity key={tab} style={styles.tab} onPress={() => setActiveTab(tab)}>
            <Text style={[
              styles.tabText,
              { color: activeTab === tab ? theme.colors.primary : theme.colors.textSecondary },
            ]}>
              {tab === 'PENDING' ? t('purchaseRequests.active')
                : tab === 'APPROVED' ? t('purchaseRequests.approved')
                : t('purchaseRequests.history')}
            </Text>
            {activeTab === tab ? (
              <View style={[styles.tabIndicator, { backgroundColor: theme.colors.primary }]} />
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={theme.colors.primary} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={48} color={theme.colors.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
            {t('purchaseRequests.noRequests')}
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>
            {t('purchaseRequests.createFirst')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12 }}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.colors.primary, bottom: 24 + insets.bottom }]}
        onPress={() => router.push('/purchase-requests/new')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 14, fontWeight: '500' },
  tabIndicator: { position: 'absolute', bottom: 0, height: 2, width: '60%' },
  card: { borderRadius: 12, padding: 16, borderWidth: 1, gap: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  statusBadge: { fontSize: 12, fontWeight: '600' },
  amount: { fontSize: 20, fontWeight: '700' },
  meta: { fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySubtext: { fontSize: 14, textAlign: 'center' },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56,
    borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
});
