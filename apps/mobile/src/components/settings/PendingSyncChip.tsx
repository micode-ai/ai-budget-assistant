import React, { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useStyles, useTheme, type Theme } from '@/theme';
import { usePendingSync } from '@/features/syncStatus/usePendingSync';
import { runManualSync } from '@/features/syncStatus/runManualSync';

/**
 * "Waiting to sync: N". Renders nothing on a synced account, on web (no local
 * queue, so the repository returns no rows) and while pending rows are younger
 * than the threshold. Tap explains and offers "Sync now".
 */
export function PendingSyncChip() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { summary, refresh } = usePendingSync();
  const [busy, setBusy] = useState(false);

  if (!summary.visible) return null;

  const hasFailed = summary.failed > 0;
  const label = t(hasFailed ? 'pendingSync.chipFailed' : 'pendingSync.chipWaiting', {
    count: summary.total,
  });

  const details = Object.entries(summary.byEntity)
    .map(([entity, n]) => `${t(`pendingSync.entity.${entity}`)}: ${n}`)
    .join('\n');

  const syncNow = async () => {
    setBusy(true);
    try {
      await runManualSync();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onPress = () =>
    showAlert(
      t('pendingSync.title'),
      `${t(hasFailed ? 'pendingSync.explainFailed' : 'pendingSync.explainWaiting')}\n\n${details}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('pendingSync.syncNow'), onPress: () => void syncNow() },
      ],
    );

  return (
    <TouchableOpacity
      style={[styles.chip, hasFailed && styles.chipFailed]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons
        name={hasFailed ? 'alert-circle-outline' : 'cloud-upload-outline'}
        size={16}
        color={hasFailed ? theme.colors.danger : theme.colors.textSecondary}
      />
      <Text style={[styles.text, hasFailed && styles.textFailed]}>{label}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  chipFailed: { borderColor: theme.colors.danger },
  text: { ...theme.textStyles.bodySmMedium, color: theme.colors.textSecondary },
  textFailed: { color: theme.colors.danger },
});
