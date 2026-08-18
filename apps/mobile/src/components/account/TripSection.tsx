import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useAccountStore } from '@/stores/accountStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { TripStatus } from '@budget/shared-types';

interface TripActionsCardProps {
  accountId: string;
}

/** Settle-up / payment-settings / trip-map navigation rows for a trip account. */
export function TripActionsCard({ accountId }: TripActionsCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('trip.tripName')}</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.tripActionRow}
          onPress={() => router.push(`/trip/${accountId}/settle-up`)}
        >
          <Ionicons name="swap-horizontal-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.tripActionText}>{t('trip.settleUp')}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.tripActionRow}
          onPress={() => router.push(`/trip/payment-settings?id=${accountId}`)}
        >
          <Ionicons name="card-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.tripActionText}>{t('trip.paymentSettingsTitle')}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.tripActionRow}
          onPress={async () => {
            const { currentAccountId, switchAccount } = useAccountStore.getState();
            if (accountId !== currentAccountId) await switchAccount(accountId);
            router.push({ pathname: '/(tabs)/expenses', params: { view: 'map', mapKey: Date.now().toString() } });
          }}
        >
          <Ionicons name="map-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.tripActionText}>{t('trip.tripMap')}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface TripArchiveButtonProps {
  accountId: string;
  isOwner: boolean;
  tripStatus: TripStatus | null | undefined;
}

/** Danger-zone "Archive trip" button — owner-only, hidden once already archived. */
export function TripArchiveButton({ accountId, isOwner, tripStatus }: TripArchiveButtonProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const archiveTrip = useAccountStore((s) => s.archiveTrip);

  if (!isOwner || tripStatus === 'archived') return null;

  const doArchiveTrip = async (force: boolean) => {
    try {
      await archiveTrip(accountId, force);
    } catch (e) {
      // The API returns a 400 (no `code` field) specifically when there are
      // still unconfirmed settle-up transactions and `force` wasn't passed —
      // see accounts.service.ts archiveTrip(). Offer the force override.
      const status = (e as { status?: number } | undefined)?.status;
      if (!force && status === 400) {
        showAlert(t('trip.archiveTrip'), t('trip.archiveTripUnconfirmedWarning'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('trip.archiveTripForce'),
            style: 'destructive',
            onPress: () => doArchiveTrip(true),
          },
        ]);
        return;
      }
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleArchiveTrip = () => {
    showAlert(t('trip.archiveTrip'), t('trip.archiveTripConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('trip.archiveTrip'),
        style: 'destructive',
        onPress: () => doArchiveTrip(false),
      },
    ]);
  };

  return (
    <TouchableOpacity
      style={[styles.dangerButton, styles.tripArchiveButton]}
      onPress={handleArchiveTrip}
    >
      <Ionicons name="archive-outline" size={20} color={theme.colors.danger} />
      <Text style={styles.dangerButtonText}>{t('trip.archiveTrip')}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  tripActionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[3],
  },
  tripActionText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
  },
  tripArchiveButton: {
    marginBottom: theme.spacing[3],
  },
  dangerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.danger,
    gap: theme.spacing[2],
  },
  dangerButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.danger,
  },
});
