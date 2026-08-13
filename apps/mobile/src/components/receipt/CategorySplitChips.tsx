import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { ReceiptCategorySplit } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { isProposedKey } from '@/features/receipt/proposedCategory';

interface Props {
  splits: ReceiptCategorySplit[];
  currencyCode: string;
  /**
   * Whether the receipt has line items to assign. The reassignment sheet is
   * offered whenever it does, even with no split — see the note below.
   */
  hasItems: boolean;
  onPress: () => void;
}

/**
 * Chip row summarizing a scanned receipt's category split
 * ("Groceries 180 · Household 35 · Alcohol 25"), and the ONLY entry point to
 * the line-reassignment sheet.
 *
 * The affordance is therefore rendered independently of whether a split
 * currently exists: gating it on `splits.length > 0` meant a receipt the
 * classifier did not split could never be split by hand, the "categories could
 * not be matched" note told the user the split failed while offering no way to
 * fix it, and — the one-way trap — reassigning every line into a single
 * category made `buildCategorySplits` return `[]`, which hid the chips and made
 * the sheet unreachable, so the edit could not be undone short of re-scanning.
 *
 * A receipt with NO line items has nothing to assign, so it still renders
 * `null` and looks exactly as it did before this feature existed — no empty
 * container, no placeholder.
 */
export default function CategorySplitChips({ splits, currencyCode, hasItems, onPress }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const hasSplits = !!splits && splits.length > 0;
  if (!hasSplits && !hasItems) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('receiptCategorySplit.title')}</Text>
        <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.editButton}>
          <Ionicons name="pencil" size={13} color={theme.colors.primary} />
          <Text style={styles.editText}>{t('receiptCategorySplit.edit')}</Text>
        </TouchableOpacity>
      </View>
      {hasSplits && (
        <View style={styles.chipRow}>
          {splits.map((split) => {
            const proposed = isProposedKey(split.categoryId);
            return (
              <View key={split.categoryId} style={[styles.chip, proposed && styles.chipProposed]}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {proposed ? '+ ' : ''}{split.categoryName} {formatCurrency(split.amount, currencyCode as Currency)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    width: '100%' as const,
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  headerRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  title: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    fontWeight: '600' as const,
  },
  editButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  editText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  chipRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  chip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  chipText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  chipProposed: {
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.primary,
    backgroundColor: 'transparent' as const,
  },
});
