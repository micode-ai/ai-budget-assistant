import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency, ReceiptCheckFinding } from '@budget/shared-types';

export function summarizeFindings(
  findings: ReceiptCheckFinding[],
): { count: number; total: number; currencyCode: string } | null {
  if (!findings || findings.length === 0) return null;
  // One currency only: a receipt has a single currency, and this feature never
  // converts between them. If a mixed list ever arrives, keep the first currency
  // rather than inventing a blended number.
  const currencyCode = findings[0].currencyCode;
  const same = findings.filter((f) => f.currencyCode === currencyCode);
  const total = Math.round(same.reduce((sum, f) => sum + f.overpaidAmount, 0) * 100) / 100;
  return { count: same.length, total, currencyCode };
}

/**
 * `×3` (or `×0.437` for a weighed line) next to the product name when
 * `quantity !== 1`, so `overpaidAmount = (paid − baseline) × quantity` is
 * reconcilable at a glance — without it a qty-3 row reads "usually 4.00 ·
 * you paid 5.00 · difference 3.00", which doesn't add up on its own. Returns
 * '' for quantity 1 (nothing to show) so callers can always append the result.
 * Rounds to 3 dp to scrub float noise from grouped/weighted quantities
 * without inventing new i18n — this is a symbol, not a translated string.
 */
export function formatQuantitySuffix(quantity: number): string {
  if (!Number.isFinite(quantity)) return '';
  // Round before comparing to 1: a quantity of 0.9999999999 from grouping/weight
  // float noise must read as "no suffix", not "×1" — comparing the raw value
  // would miss that.
  const rounded = Math.round(quantity * 1000) / 1000;
  if (rounded === 1) return '';
  return ` ×${rounded}`;
}

interface Props {
  findings: ReceiptCheckFinding[];
}

export default function PriceFindingsCard({ findings }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [expanded, setExpanded] = useState(false);

  const summary = summarizeFindings(findings);
  if (!summary) return null;

  const { count, total, currencyCode } = summary;
  const shown = findings.filter((f) => f.currencyCode === currencyCode);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
        accessibilityRole="button"
      >
        <Ionicons name="pricetag-outline" size={20} color={theme.colors.warning} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('receiptCheck.cardTitle', { count })}</Text>
          <Text style={styles.subtitle}>
            {t('receiptCheck.cardSubtitle', {
              amount: formatCurrency(total, currencyCode as Currency),
            })}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded &&
        shown.map((f, i) => (
          <View key={`${f.canonicalName}-${i}`} style={styles.row}>
            <Text style={styles.product}>
              {f.canonicalName}
              <Text style={styles.productQuantity}>{formatQuantitySuffix(f.quantity)}</Text>
            </Text>
            <View style={styles.prices}>
              <Text style={styles.priceLabel}>
                {t('receiptCheck.usually')}{' '}
                {formatCurrency(f.baselineUnitPrice, currencyCode as Currency)}
              </Text>
              <Text style={styles.priceLabel}>
                {t('receiptCheck.youPaid')}{' '}
                {formatCurrency(f.paidUnitPrice, currencyCode as Currency)}
              </Text>
              <Text style={styles.diff}>
                {t('receiptCheck.difference')}{' '}
                {formatCurrency(f.overpaidAmount, currencyCode as Currency)}
              </Text>
            </View>
            {f.confidence === 'low' && (
              <Text style={styles.lowConfidence}>{t('receiptCheck.lowConfidence')}</Text>
            )}
          </View>
        ))}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    width: '100%' as const,
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  subtitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
  },
  row: {
    marginTop: theme.spacing[3],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  product: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[1],
  },
  productQuantity: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    fontWeight: '400' as const,
  },
  prices: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  priceLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  diff: {
    ...theme.textStyles.caption,
    color: theme.colors.warning,
    fontWeight: '600' as const,
  },
  lowConfidence: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
    fontStyle: 'italic' as const,
  },
});
