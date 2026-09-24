import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAccountStore } from '@/stores/accountStore';

/**
 * Shown above the expense list while the current account has uncategorized
 * expenses. Counts from the loaded list with the same exclusions the server
 * applies (planned, split receivables, debts), so the number matches what the
 * review will offer for everything loaded.
 */
export function UncategorizedBanner({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const count = useExpenseStore(
    (s) => s.expenses.filter((e) => !e.categoryId && !e.isPlanned && !e.isSplitReceivable && !e.isDebt).length,
  );
  if (!canEdit || count === 0) return null;
  return (
    <View style={styles.banner}>
      <Ionicons name="pricetags-outline" size={18} color={theme.colors.primary} />
      <Text style={styles.text}>{t('categorize.bannerText', { count })}</Text>
      <Pressable onPress={onPress} accessibilityRole="button" style={styles.action}>
        <Text style={styles.actionText}>{t('categorize.bannerAction')}</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  // Wraps instead of truncating: on a phone the button drops to its own line
  // (pushed right by marginLeft: 'auto') so the count stays readable; on a wide
  // screen everything fits in one row.
  banner: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[4],
    marginVertical: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.divider,
  },
  text: { ...theme.textStyles.body, color: theme.colors.textPrimary, flexGrow: 1, flexShrink: 1, flexBasis: 160 },
  action: {
    marginLeft: 'auto' as const,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  actionText: { ...theme.textStyles.bodySmMedium, color: theme.colors.textInverse },
});
