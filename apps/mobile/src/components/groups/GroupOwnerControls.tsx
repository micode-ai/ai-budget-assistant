import React from 'react';
import { View, Text, Switch } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useGroupOwnerActions } from '@/hooks/useGroupOwnerActions';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { GroupDetail } from '@budget/shared-types';
import { GroupButton } from './GroupButton';

/**
 * Owner-only controls: guest access, rotate the link, archive, delete. An archived group is
 * read-only, so only Delete remains.
 */
export function GroupOwnerControls({
  detail,
  writable,
  onGroupGone,
}: {
  detail: GroupDetail;
  writable: boolean;
  /** Desktop dialog hosting (ABA-646): called after the group is deleted, instead of `router.dismissTo`. */
  onGroupGone?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const actions = useGroupOwnerActions(detail, onGroupGone);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('groups.ownerSection')}</Text>

      {writable && (
        <>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>{t('groups.guestAccessLabel')}</Text>
              <Text style={styles.hint}>{t('groups.guestAccessDesc')}</Text>
            </View>
            <Switch
              value={detail.guestAccess}
              onValueChange={(v) => void actions.setGuestAccess(v)}
              disabled={actions.busy}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
            />
          </View>
          <GroupButton
            label={t('groups.rotateLink')}
            onPress={actions.confirmRotate}
            variant="secondary"
            write
            disabled={actions.busy}
            style={styles.gap}
          />
          <GroupButton
            label={t('groups.archiveGroup')}
            onPress={actions.confirmArchive}
            variant="secondary"
            write
            disabled={actions.busy}
            style={styles.gap}
          />
        </>
      )}
      <GroupButton
        label={t('groups.deleteGroup')}
        onPress={actions.confirmDelete}
        variant="danger"
        write
        disabled={actions.busy}
        style={styles.gap}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
  },
  switchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[3],
  },
  switchText: {
    flex: 1,
  },
  switchLabel: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  gap: {
    marginTop: theme.spacing[3],
  },
});
