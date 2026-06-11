import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAlertStore } from '@/stores/alertStore';
import { useAccountStore } from '@/stores/accountStore';
import type { AnomalyAlert } from '@budget/shared-types';

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  duplicate_charge: 'copy-outline',
  price_increase: 'trending-up-outline',
  category_spike: 'flame-outline',
  recurring_suggestion: 'repeat-outline',
};

export default function AlertsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { alerts, isLoading, unreadCount, loadAlerts, markRead, markAllRead, dismiss } =
    useAlertStore();
  const canEdit = useAccountStore((s) => s.canEdit());

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const renderBody = useCallback(
    (alert: AnomalyAlert): { title: string; body: string } => {
      const p = alert.params as Record<string, string | number>;
      switch (alert.type) {
        case 'duplicate_charge':
          return {
            title: t('alerts.duplicateTitle'),
            body: t('alerts.duplicateBody', {
              merchant: p.merchant,
              amount: p.amount,
              currency: p.currencyCode,
            }),
          };
        case 'price_increase':
          return {
            title: t('alerts.priceIncreaseTitle', { merchant: p.merchant }),
            body: t('alerts.priceIncreaseBody', {
              merchant: p.merchant,
              oldAmount: p.oldAmount,
              newAmount: p.newAmount,
              currency: p.currencyCode,
              percent: p.percent,
            }),
          };
        case 'category_spike':
          return {
            title: t('alerts.spikeTitle'),
            body: t('alerts.spikeBody', { category: p.categoryName, percent: p.percent }),
          };
        case 'recurring_suggestion':
          return {
            title: t('alerts.recurringTitle', { merchant: p.merchant }),
            body: t('alerts.recurringBody', {
              merchant: p.merchant,
              amount: p.amount,
              currency: p.currencyCode,
              cycle: t(p.cycle === 'weekly' ? 'alerts.cycleWeekly' : 'alerts.cycleMonthly'),
            }),
          };
        default:
          return { title: String(alert.type), body: '' };
      }
    },
    [t],
  );

  const handlePress = useCallback(
    (alert: AnomalyAlert) => {
      if (canEdit) markRead(alert.id); // write endpoints are viewer-blocked server-side
      if (alert.type === 'recurring_suggestion' && canEdit) {
        const p = alert.params as Record<string, string>;
        router.push({
          pathname: '/subscriptions/new' as any,
          params: { name: p.merchant, amount: String(p.amount), detectedFrom: p.merchant },
        });
      } else if (alert.expenseId) {
        router.push(`/expense/${alert.expenseId}` as any);
      }
    },
    [markRead, canEdit],
  );

  const renderAlert = ({ item }: { item: AnomalyAlert }) => {
    const { title, body } = renderBody(item);
    const icon = TYPE_ICON[item.type] || 'alert-circle-outline';
    const isUnread = !item.readAt;

    return (
      <TouchableOpacity
        style={[styles.card, isUnread && styles.cardUnread]}
        activeOpacity={0.7}
        onPress={() => handlePress(item)}
      >
        <View style={styles.cardRow}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: isUnread ? theme.colors.primaryLight : theme.colors.background },
            ]}
          >
            <Ionicons
              name={icon}
              size={22}
              color={isUnread ? theme.colors.primary : theme.colors.textTertiary}
            />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.alertTitle}>{title}</Text>
            {body.length > 0 && <Text style={styles.alertBody}>{body}</Text>}
            <Text style={styles.alertDate}>
              {new Date(item.createdAt).toLocaleDateString(i18n.language, {
                day: 'numeric',
                month: 'short',
              })}
            </Text>
          </View>
          {canEdit && (
            <TouchableOpacity style={styles.dismissBtn} hitSlop={8} onPress={() => dismiss(item.id)}>
              <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const headerRight =
    canEdit && unreadCount > 0
      ? () => (
          <TouchableOpacity onPress={() => markAllRead()} hitSlop={8}>
            <Text style={styles.markAllRead}>{t('alerts.markAllRead')}</Text>
          </TouchableOpacity>
        )
      : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerRight }} />
      {isLoading && alerts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : alerts.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={56} color={theme.colors.textTertiary} />
          <Text style={styles.emptyText}>{t('alerts.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          renderItem={renderAlert}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadAlerts} />}
          showsVerticalScrollIndicator={false}
        />
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
  listContent: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
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
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  cardRow: {
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
  alertTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  alertBody: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  alertDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  dismissBtn: {
    padding: theme.spacing[1],
    alignSelf: 'flex-start' as const,
  },
  markAllRead: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
});
