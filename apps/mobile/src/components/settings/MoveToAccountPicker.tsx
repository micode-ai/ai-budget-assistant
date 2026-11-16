import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAccountStore } from '@/stores/accountStore';
import { showAlert } from '@/utils/alert';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  /** What is being moved, for the confirmation ("Ala", "Family car"). */
  itemName: string;
  /** Performs the move; a rejection is the caller's to explain, so it is passed through. */
  onMove: (targetAccountId: string, targetName: string) => Promise<void>;
}

/**
 * "Move to another account" for an account-scoped item created in the wrong
 * account (ABA-801): the accounts the user can edit, other than the current
 * one and archived trips, then a confirmation. Used by the Children and the
 * Vehicles sheets.
 */
export function MoveToAccountPicker({ itemName, onMove }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const accounts = useAccountStore((s) => s.accounts);
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const targets = accounts.filter(
    (a) => a.id !== currentAccountId && a.myRole !== 'viewer' && a.tripStatus !== 'archived',
  );
  if (targets.length === 0) return null;

  const pick = (id: string, name: string) => {
    showAlert(t('moveToAccount.confirmTitle', { name: itemName, account: name }), t('moveToAccount.confirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('moveToAccount.move'),
        onPress: async () => {
          setBusy(true);
          try {
            await onMove(id, name);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.block}>
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Ionicons name="swap-horizontal-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.toggleText}>{t('moveToAccount.title')}</Text>
        {busy && <ActivityIndicator size="small" color={theme.colors.primary} />}
      </TouchableOpacity>
      {open && (
        <View style={styles.chips}>
          {targets.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={styles.chip}
              disabled={busy}
              onPress={() => pick(a.id, a.name)}
              accessibilityRole="button"
            >
              <Text style={styles.chipText}>{a.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  block: { marginTop: theme.spacing[4] },
  toggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  toggleText: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  chips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    justifyContent: 'center' as const,
    marginTop: theme.spacing[2],
  },
  chip: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipText: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary },
});
