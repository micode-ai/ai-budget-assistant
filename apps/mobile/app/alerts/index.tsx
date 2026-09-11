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
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAlertStore } from '@/stores/alertStore';
import { useAccountStore } from '@/stores/accountStore';
import { showAlert } from '@/utils/alert';
import { useInvitationStore } from '@/stores/invitationStore';
import { InvitationCard } from '@/components/alerts/InvitationCard';
import { renderAlertBody, TYPE_ICON } from '@/features/alerts/alertPresentation';
import { openAlertTargets as openAlertTargetsImpl } from '@/features/alerts/resolveAlertExpense';
import { buildMarkRecurringUpdate } from '@/features/dashboard/attentionActions';
import { useExpenseStore } from '@/stores/expenseStore';
import type { AnomalyAlert } from '@budget/shared-types';

export default function AlertsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { alerts, isLoading, unreadCount, loadAlerts, markRead, markAllRead, dismiss } =
    useAlertStore();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = React.useState<'alerts' | 'invitations'>(
    params.tab === 'invitations' ? 'invitations' : 'alerts',
  );
  const { invitations, isLoading: invitationsLoading, loadInvitations, respond } = useInvitationStore();
  const canEdit = useAccountStore((s) => s.canEdit());

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const handleAccept = async (id: string) => {
    try {
      await respond(id, 'accept');
      const { loadAccounts } = useAccountStore.getState();
      await loadAccounts();
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleDecline = async (id: string) => {
    try {
      await respond(id, 'decline');
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  // Alert id currently being resolved (waiting on a fresh expense pull) — drives a
  // small inline spinner and blocks double-taps.
  const [resolvingId, setResolvingId] = React.useState<string | null>(null);

  const openAlertTargets = useCallback(
    (alert: AnomalyAlert, ids: (string | undefined)[], navigate: () => void) =>
      openAlertTargetsImpl(alert, ids, navigate, { canEdit, dismiss, t, setResolvingId }),
    [canEdit, dismiss, t],
  );

  const handlePress = useCallback(
    (alert: AnomalyAlert) => {
      if (resolvingId) return; // a resolve pull is already in flight
      if (canEdit) markRead(alert.id); // write endpoints are viewer-blocked server-side
      if (alert.type === 'recurring_suggestion' && canEdit) {
        const p = alert.params as Record<string, string>;
        router.push({
          pathname: '/subscriptions/new' as any,
          params: { name: p.merchant, amount: String(p.amount), detectedFrom: p.merchant },
        });
      } else if (alert.type === 'possible_merge' && canEdit) {
        const p = alert.params as Record<string, string>;
        // Navigate to the merge screen; both ids come from the alert params.
        // aId = the expense that triggered the alert; bId = the other candidate.
        const aId = p.expenseId ?? alert.expenseId ?? '';
        const bId = p.otherExpenseId ?? '';
        void openAlertTargets(alert, [aId, bId], () =>
          router.push({ pathname: '/expense/merge' as any, params: { aId, bId } }),
        );
      } else if (alert.expenseId) {
        const targetId = alert.expenseId;
        void openAlertTargets(alert, [targetId], () =>
          router.push(`/expense/${targetId}` as any),
        );
      }
    },
    [markRead, canEdit, resolvingId, openAlertTargets],
  );

  // `expenseStore.updateExpense` is fire-and-forget (optimistic local write,
  // server call swallowed to a console.warn retry), so there is nothing to
  // await here — see `useAlertTapThrough.onMarkRecurring`'s sibling doc
  // comment, which this mirrors for the screen that does not use that hook.
  const handleMarkRecurring = (alert: AnomalyAlert) => {
    const update = buildMarkRecurringUpdate(alert);
    if (!update) return; // the button only renders when this would be non-null
    const { expenseId, ...patch } = update;
    useExpenseStore.getState().updateExpense(expenseId, patch);
    if (canEdit) markRead(alert.id);
    dismiss(alert.id);
  };

  const renderAlert = ({ item }: { item: AnomalyAlert }) => {
    const { title, body } = renderAlertBody(item, t);
    const icon = TYPE_ICON[item.type] || 'alert-circle-outline';
    const isUnread = !item.readAt;
    // `recurring_suggestion` already navigates to /subscriptions/new on a
    // whole-card tap (see `handlePress`) — Mark as recurring is a second,
    // independent action and gets its own small button rather than
    // repurposing the card tap, so both remain reachable.
    const markRecurringUpdate =
      canEdit && item.type === 'recurring_suggestion' ? buildMarkRecurringUpdate(item) : null;

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
            {markRecurringUpdate && (
              <TouchableOpacity
                style={styles.markRecurringBtn}
                onPress={() => handleMarkRecurring(item)}
                hitSlop={8}
              >
                <Text style={styles.markRecurringText}>{t('alerts.markAsRecurring')}</Text>
              </TouchableOpacity>
            )}
          </View>
          {resolvingId === item.id ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={styles.dismissBtn} />
          ) : (
            canEdit && (
              <TouchableOpacity style={styles.dismissBtn} hitSlop={8} onPress={() => dismiss(item.id)}>
                <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            )
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
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'alerts' && styles.tabButtonActive]}
          onPress={() => setActiveTab('alerts')}
        >
          <Text style={[styles.tabText, activeTab === 'alerts' && styles.tabTextActive]}>
            {t('alerts.tabAlerts')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'invitations' && styles.tabButtonActive]}
          onPress={() => setActiveTab('invitations')}
        >
          <Text style={[styles.tabText, activeTab === 'invitations' && styles.tabTextActive]}>
            {t('alerts.tabInvitations')}
            {invitations.length > 0 ? ` (${invitations.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>
      {activeTab === 'invitations' ? (
        invitationsLoading && invitations.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : invitations.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="mail-open-outline" size={56} color={theme.colors.textTertiary} />
            <Text style={styles.emptyText}>{t('alerts.invitationsEmpty')}</Text>
          </View>
        ) : (
          <FlatList
            data={invitations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <InvitationCard
                invitation={item}
                onAccept={() => handleAccept(item.id)}
                onDecline={() => handleDecline(item.id)}
              />
            )}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={invitationsLoading} onRefresh={loadInvitations} />}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : isLoading && alerts.length === 0 ? (
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
  tabRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
  },
  tabButton: {
    flex: 1,
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  tabText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
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
  markRecurringBtn: {
    marginTop: theme.spacing[1.5],
    alignSelf: 'flex-start' as const,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2.5],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  markRecurringText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  markAllRead: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
});
