import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useUserSubscriptionStore } from '@/stores/userSubscriptionStore';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { formatCurrency } from '@budget/shared-utils';
import type { UserSubscription } from '@budget/shared-types';
import { SubscriptionCalendarView } from '@/components/subscriptions/SubscriptionCalendarView';

const CYCLE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  monthly: 'calendar-outline',
  yearly: 'calendar',
  quarterly: 'calendar-clear-outline',
  weekly: 'today-outline',
};

type ViewMode = 'list' | 'calendar';

export default function SubscriptionsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { subscriptions, isLoading, loadSubscriptions, deleteSubscription, getTotalMonthlyEquivalent } =
    useUserSubscriptionStore();
  const userCurrency = useAuthStore((s) => s.user?.currencyCode || 'USD');
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const canEdit = useAccountStore((s) => s.canEdit());

  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Calendar navigation state
  const now = new Date();
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth() + 1);
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const isCurrentCalendarPeriod =
    calendarMonth === now.getMonth() + 1 && calendarYear === now.getFullYear();

  const goToPrevMonth = useCallback(() => {
    if (calendarMonth === 1) {
      setCalendarMonth(12);
      setCalendarYear((y) => y - 1);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  }, [calendarMonth]);

  const goToNextMonth = useCallback(() => {
    if (isCurrentCalendarPeriod) return;
    if (calendarMonth === 12) {
      setCalendarMonth(1);
      setCalendarYear((y) => y + 1);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  }, [calendarMonth, isCurrentCalendarPeriod]);

  useEffect(() => {
    loadSubscriptions();
  }, [currentAccountId, loadSubscriptions]);

  useFocusEffect(
    useCallback(() => {
      loadSubscriptions();
    }, [loadSubscriptions]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadSubscriptions();
    } finally {
      setRefreshing(false);
    }
  }, [loadSubscriptions]);

  const handleDelete = useCallback(
    (sub: UserSubscription) => {
      showAlert(
        t('subscriptionManager.deleteTitle'),
        t('subscriptionManager.deleteMessage', { name: sub.name }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => deleteSubscription(sub.id).catch(() => showAlert(t('common.error'), t('errors.unknown'))),
          },
        ],
      );
    },
    [deleteSubscription, t],
  );

  const getRenewalLabel = (days: number): string => {
    if (days < 0) return t('subscriptionManager.renewalOverdue');
    if (days === 0) return t('subscriptionManager.renewalToday');
    if (days === 1) return t('subscriptionManager.renewalTomorrow');
    return t('subscriptionManager.renewalInDays', { count: days });
  };

  const getRenewalColor = (days: number) => {
    if (days <= 0) return theme.colors.danger;
    if (days <= 3) return theme.colors.warning;
    return theme.colors.textTertiary;
  };

  const renderSubscriptionCard = (item: UserSubscription) => {
    const cycleIcon = CYCLE_ICONS[item.billingCycle] || 'calendar-outline';
    const cycleLabel = t(`subscriptionManager.cycle.${item.billingCycle}`);
    const renewalDays = item.daysUntilRenewal;
    const renewalColor = getRenewalColor(renewalDays);

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.card, !item.isActive && styles.cardInactive]}
        activeOpacity={0.7}
        onPress={() => router.push(`/subscriptions/${item.id}` as any)}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.iconContainer, { backgroundColor: item.isActive ? theme.colors.primaryLight : theme.colors.background }]}>
            <Ionicons
              name={cycleIcon}
              size={22}
              color={item.isActive ? theme.colors.primary : theme.colors.textTertiary}
            />
          </View>
          <View style={styles.cardInfo}>
            <Text style={[styles.subName, !item.isActive && styles.textInactive]}>{item.name}</Text>
            <Text style={styles.cycleLabel}>{cycleLabel}</Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.amount, !item.isActive && styles.textInactive]}>
              {formatCurrency(item.amount, item.currencyCode as any)}
            </Text>
            {item.isActive && (
              <Text style={[styles.renewalLabel, { color: renewalColor }]}>
                {getRenewalLabel(renewalDays)}
              </Text>
            )}
            {!item.isActive && (
              <Text style={styles.inactiveLabel}>{t('subscriptionManager.inactive')}</Text>
            )}
          </View>
          {canEdit && (
            <TouchableOpacity
              style={styles.deleteBtn}
              hitSlop={8}
              onPress={() => handleDelete(item)}
            >
              <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const activeSubscriptions = subscriptions.filter((s) => s.isActive);
  const inactiveSubscriptions = subscriptions.filter((s) => !s.isActive);
  const monthlyTotal = getTotalMonthlyEquivalent();

  const listData = [...activeSubscriptions, ...inactiveSubscriptions];

  if (isLoading && subscriptions.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.center}>
          <Ionicons name="repeat-outline" size={56} color={theme.colors.textTertiary} />
          <Text style={styles.emptyTitle}>{t('subscriptionManager.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('subscriptionManager.emptyDescription')}</Text>
          {canEdit && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/subscriptions/new' as any)}
            >
              <Ionicons name="add" size={20} color={theme.colors.textInverse} />
              <Text style={styles.addButtonText}>{t('subscriptionManager.addFirst')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Monthly total card */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>{t('subscriptionManager.monthlyTotal')}</Text>
          <Text style={styles.totalAmount}>{formatCurrency(monthlyTotal, userCurrency as any)}</Text>
          <Text style={styles.totalSub}>{t('subscriptionManager.activeCount', { count: activeSubscriptions.length })}</Text>
        </View>

        {/* List / Calendar toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
            onPress={() => setViewMode('list')}
          >
            <Ionicons
              name="list-outline"
              size={16}
              color={viewMode === 'list' ? theme.colors.primary : theme.colors.textTertiary}
            />
            <Text style={[styles.toggleLabel, viewMode === 'list' && styles.toggleLabelActive]}>
              {t('subscriptionManager.listView')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'calendar' && styles.toggleBtnActive]}
            onPress={() => setViewMode('calendar')}
          >
            <Ionicons
              name="calendar-outline"
              size={16}
              color={viewMode === 'calendar' ? theme.colors.primary : theme.colors.textTertiary}
            />
            <Text style={[styles.toggleLabel, viewMode === 'calendar' && styles.toggleLabelActive]}>
              {t('subscriptionManager.calendarView')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Calendar view */}
        {viewMode === 'calendar' && (
          <SubscriptionCalendarView
            subscriptions={subscriptions}
            selectedMonth={calendarMonth}
            selectedYear={calendarYear}
            onPrevMonth={goToPrevMonth}
            onNextMonth={goToNextMonth}
            isCurrentPeriod={isCurrentCalendarPeriod}
            userCurrency={userCurrency}
          />
        )}

        {/* List view */}
        {viewMode === 'list' && (
          <View>
            {activeSubscriptions.length > 0 && (
              <Text style={styles.sectionTitle}>{t('subscriptionManager.activeTitle')}</Text>
            )}
            {listData.map(renderSubscriptionCard)}
          </View>
        )}
      </ScrollView>

      {canEdit && (
        <TouchableOpacity
          style={[styles.fab, { bottom: 24 }]}
          onPress={() => router.push('/subscriptions/new' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color={theme.colors.textInverse} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
  scrollContent: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[20],
  },
  totalCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
    ...theme.shadows.sm,
  },
  totalLabel: {
    ...theme.textStyles.caption,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase' as const,
    marginBottom: theme.spacing[1],
  },
  totalAmount: {
    ...theme.textStyles.h1,
    color: theme.colors.textInverse,
    fontWeight: '700' as const,
  },
  totalSub: {
    ...theme.textStyles.bodySm,
    color: 'rgba(255,255,255,0.7)',
    marginTop: theme.spacing[1],
  },
  toggleRow: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[1],
    marginBottom: theme.spacing[4],
    gap: theme.spacing[1],
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  toggleBtnActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  toggleLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    fontWeight: '500' as const,
  },
  toggleLabelActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[2],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  cardInactive: {
    opacity: 0.65,
  },
  cardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cardInfo: {
    flex: 1,
    gap: theme.spacing[0.5],
  },
  subName: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  cycleLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  cardRight: {
    alignItems: 'flex-end' as const,
    gap: theme.spacing[0.5],
  },
  amount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  renewalLabel: {
    ...theme.textStyles.caption,
  },
  inactiveLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  textInactive: {
    color: theme.colors.textTertiary,
  },
  deleteBtn: {
    padding: theme.spacing[1],
    alignSelf: 'center' as const,
  },
  fab: {
    position: 'absolute' as const,
    right: theme.spacing[5],
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    ...theme.shadows.md,
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  addButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing[2],
  },
  addButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
});
