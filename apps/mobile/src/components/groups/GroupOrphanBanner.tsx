import React, { useState } from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useGroupStore } from '@/stores/groupStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { canAdoptGroup, ownerErrorReason } from '@/features/groups/groupOwnership';
import type { GroupDetail } from '@budget/shared-types';
import { GroupButton } from './GroupButton';

/**
 * ABA-650: shown on the group screen (phone `GroupDetailView` and desktop `GroupDetailDesktop`) when
 * the group has no owner, because the owner left the platform and nobody could succeed them. The
 * group keeps working for everyone; only the owner settings wait. Only a member the server marks
 * `canAdopt` (live before the group lost its owner) sees the button; the take-over is one confirmed
 * tap, an atomic server-side CAS.
 */
export function GroupOrphanBanner({ detail, style }: { detail: GroupDetail; style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const adoptGroup = useGroupStore((s) => s.adoptGroup);
  const [busy, setBusy] = useState(false);
  if (!detail.isOrphaned) return null;
  const adoptable = canAdoptGroup(detail);

  const adopt = async () => {
    setBusy(true);
    try {
      await adoptGroup(detail.id);
    } catch (e) {
      const reason = ownerErrorReason(e);
      showAlert(
        t('errors.error'),
        reason === 'hasOwner'
          ? t('groups.adoptTaken')
          : reason === 'limit'
            ? t('groups.ownerLimitSelf')
            : e instanceof Error
              ? e.message
              : t('errors.unknown'),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirm = () =>
    showAlert(t('groups.adoptGroup'), t('groups.adoptConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('groups.adoptGroup'), onPress: () => void adopt() },
    ]);

  return (
    <View style={[styles.banner, style]} accessibilityRole="summary">
      <View style={styles.textRow}>
        <Ionicons name="person-remove-outline" size={16} color={theme.colors.textSecondary} />
        <Text style={styles.text}>{t('groups.orphanBanner')}</Text>
      </View>
      {adoptable && (
        <GroupButton
          label={t('groups.adoptGroup')}
          onPress={confirm}
          variant="secondary"
          loading={busy}
          write
          style={styles.button}
        />
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  banner: {
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  textRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[2],
  },
  text: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  button: {
    marginTop: theme.spacing[3],
    alignSelf: 'flex-start' as const,
  },
});
