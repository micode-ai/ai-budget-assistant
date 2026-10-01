import { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { useAccountStore } from '@/stores/accountStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { getMoveTargets } from '@/features/expenses/moveTargets';

interface Props {
  expenseId: string;
  onClose: () => void;
}

/**
 * Desktop account picker for "Move to another account" — the counterpart of
 * the phone's picker sheet in `app/expense/[id].tsx`, calling the same
 * `expenseStore.moveExpense`. Same centered-panel chrome (raw `<div>` scrim,
 * RN `Modal` for Esc) as the bulk category picker in
 * `ExpensesDesktopDialogs.tsx`.
 */
export function MoveAccountDialog({ expenseId, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const accounts = useAccountStore((s) => s.accounts);
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const moveExpense = useExpenseStore((s) => s.moveExpense);
  const [isMoving, setIsMoving] = useState(false);

  const targets = getMoveTargets(accounts, currentAccountId);

  const handleMove = async (targetAccountId: string, targetName: string) => {
    if (isMoving) return;
    setIsMoving(true);
    try {
      await moveExpense(expenseId, targetAccountId);
      onClose();
      showAlert(t('expenseDetail.moveSuccessTitle'), t('expenseDetail.moveSuccess', { account: targetName }));
    } catch {
      setIsMoving(false);
      showAlert(t('common.error'), t('expenseDetail.moveError'));
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <div
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isMoving) onClose();
        }}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.overlay,
          padding: 24,
        }}
      >
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('expenseDetail.moveTitle')}</Text>
            <Pressable onPress={onClose} disabled={isMoving} accessibilityRole="button">
              <Text style={styles.cancel}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>{t('expenseDetail.moveSubtitle')}</Text>
          <ScrollView style={styles.list}>
            {targets.map((a) => (
              <Pressable
                key={a.id}
                style={styles.row}
                disabled={isMoving}
                onPress={() => handleMove(a.id, a.name)}
                accessibilityRole="button"
              >
                <Ionicons name="wallet-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.rowText}>{a.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </div>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: '90%' as const,
    maxWidth: 420,
    maxHeight: '80%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  title: { ...theme.textStyles.h3, color: theme.colors.textPrimary },
  cancel: { ...theme.textStyles.button, color: theme.colors.primary },
  subtitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[3],
  },
  list: { maxHeight: 360 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  rowText: { ...theme.textStyles.bodyLarge, color: theme.colors.textPrimary },
});
