import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ReceiptDuplicateMatch } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import { describeDuplicateMatch } from '@/features/receipt/receiptDuplicate';

interface Props {
  match: ReceiptDuplicateMatch | null | undefined;
  onOpen: (expenseId: string) => void;
}

/**
 * Stage 2 of the duplicate warning (ABA-603): after OCR, on the confirm card.
 * A warning only — saving stays possible, since a matching expense can be a
 * genuine second purchase or the bank-notification copy of this very receipt.
 */
export default function DuplicateReceiptBanner({ match, onOpen }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  if (!match) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="copy-outline" size={20} color={theme.colors.warning} />
      <View style={styles.body}>
        <Text style={styles.title}>
          {match.kind === 'exact' ? t('receipt.duplicateExactTitle') : t('receipt.duplicateLikelyTitle')}
        </Text>
        <Text style={styles.detail}>{describeDuplicateMatch(match, getIntlLocale())}</Text>
      </View>
      <TouchableOpacity
        onPress={() => onOpen(match.expenseId)}
        accessibilityRole="button"
        style={styles.action}
        activeOpacity={0.7}
      >
        <Text style={styles.actionText}>{t('receipt.duplicateOpen')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  banner: {
    width: '100%' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  body: { flex: 1 },
  title: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  detail: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  action: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
});
