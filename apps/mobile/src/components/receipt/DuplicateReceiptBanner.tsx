import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ReceiptDuplicateMatch } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import { bankCopySource, describeDuplicateMatch } from '@/features/receipt/receiptDuplicate';

interface Props {
  match: ReceiptDuplicateMatch | null | undefined;
  onOpen: (expenseId: string) => void;
  /** Ticked: saving folds the bank's copy into this receipt. */
  mergeWithBank: boolean;
  onToggleMergeWithBank: () => void;
}

/**
 * Stage 2 of the duplicate warning (ABA-603): after OCR, on the confirm card.
 * A warning only — saving stays possible, since a matching expense can be a
 * genuine second purchase or the bank-notification copy of this very receipt.
 *
 * When the match is the bank's own copy (a captured push or an imported
 * statement row) the banner names that origin and offers a "merge into one
 * expense" box: the receipt survives, the bank row is folded in on save.
 */
export default function DuplicateReceiptBanner({
  match,
  onOpen,
  mergeWithBank,
  onToggleMergeWithBank,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  if (!match) return null;
  const bankSource = bankCopySource(match);
  const title =
    match.kind === 'exact'
      ? t('receipt.duplicateExactTitle')
      : bankSource === 'notification'
        ? t('receipt.duplicateBankPushTitle')
        : bankSource === 'import'
          ? t('receipt.duplicateBankImportTitle')
          : t('receipt.duplicateLikelyTitle');

  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.banner}>
        <Ionicons name="copy-outline" size={20} color={theme.colors.warning} />
        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>
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
      {bankSource && (
        <TouchableOpacity
          style={styles.mergeRow}
          onPress={onToggleMergeWithBank}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: mergeWithBank }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={mergeWithBank ? 'checkbox' : 'square-outline'}
            size={22}
            color={mergeWithBank ? theme.colors.primary : theme.colors.textSecondary}
          />
          <View style={styles.body}>
            <Text style={styles.mergeLabel}>{t('receipt.duplicateMergeLabel')}</Text>
            <Text style={styles.detail}>{t('receipt.duplicateMergeHint')}</Text>
            {match.amountOnly && (
              <Text style={styles.caution}>{t('receipt.duplicateAmountOnly')}</Text>
            )}
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    width: '100%' as const,
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[4],
    gap: theme.spacing[3],
  },
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  mergeRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[3],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  mergeLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  caution: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: theme.colors.textPrimary,
    marginTop: 4,
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
