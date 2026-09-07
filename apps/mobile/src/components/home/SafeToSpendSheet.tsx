import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { SafeToSpendResponse } from '@budget/shared-types';
import { SheetDialog } from '@/components/SheetDialog';
import { useTheme, useStyles, type Theme } from '@/theme';

interface SafeToSpendSheetProps {
  visible: boolean;
  onClose: () => void;
  data: SafeToSpendResponse | null;
}

/**
 * Stable accessible-name id for the sheet/dialog title. A fixed id is safe
 * for the same reason `ExpenseDialog.tsx`'s `TITLE_ID` and
 * `ProductDetailSheet.tsx`'s `PRODUCT_DETAIL_TITLE_ID` are: only one
 * instance of this component is ever mounted at a time.
 */
const TITLE_ID = 'safe-to-spend-sheet-title';

/**
 * The safe-to-spend breakdown, opened from the dashboard hero number.
 *
 * The chrome — bottom sheet on a phone, centred dialog on desktop web — is
 * `SheetDialog`'s, and so is the bottom inset. This file's own `desktop?` prop
 * is gone with it: both dashboards now call this identically, and the two
 * style entries below are the only places its phone appearance differs from
 * the wrapper's canonical sheet.
 */
export function SafeToSpendSheet({ visible, onClose, data }: SafeToSpendSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  if (!data) return null;

  // Shared by both chromes, byte-for-byte — only the wrapper differs.
  const content = (
    <>
      <Text nativeID={TITLE_ID} style={styles.stsSheetTitle}>{t('safeToSpend.breakdownTitle')}</Text>

      <View style={styles.stsRow}>
        <Text style={styles.stsRowLabel}>{t('safeToSpend.wallet')}</Text>
        <Text style={styles.stsRowValue}>
          {formatCurrency(data.breakdown.walletBalance, data.baseCurrency)}
        </Text>
      </View>
      {data.breakdown.expectedIncome > 0 && (
        <View style={styles.stsRow}>
          <Text style={styles.stsRowLabel}>{t('safeToSpend.expectedIncome')}</Text>
          <Text style={[styles.stsRowValue, { color: theme.colors.success }]}>
            +{formatCurrency(data.breakdown.expectedIncome, data.baseCurrency)}
          </Text>
        </View>
      )}
      {data.breakdown.upcomingSubscriptions > 0 && (
        <View style={styles.stsRow}>
          <Text style={styles.stsRowLabel}>{t('safeToSpend.subscriptions')}</Text>
          <Text style={[styles.stsRowValue, { color: theme.colors.danger }]}>
            -{formatCurrency(data.breakdown.upcomingSubscriptions, data.baseCurrency)}
          </Text>
        </View>
      )}
      {data.breakdown.upcomingRecurring > 0 && (
        <View style={styles.stsRow}>
          <Text style={styles.stsRowLabel}>{t('safeToSpend.recurring')}</Text>
          <Text style={[styles.stsRowValue, { color: theme.colors.danger }]}>
            -{formatCurrency(data.breakdown.upcomingRecurring, data.baseCurrency)}
          </Text>
        </View>
      )}
      {data.breakdown.goalContributions > 0 && (
        <View style={styles.stsRow}>
          <Text style={styles.stsRowLabel}>{t('safeToSpend.goals')}</Text>
          <Text style={[styles.stsRowValue, { color: theme.colors.danger }]}>
            -{formatCurrency(data.breakdown.goalContributions, data.baseCurrency)}
          </Text>
        </View>
      )}
      {data.breakdown.buffer > 0 && (
        <View style={styles.stsRow}>
          <Text style={styles.stsRowLabel}>{t('safeToSpend.buffer')}</Text>
          <Text style={[styles.stsRowValue, { color: theme.colors.danger }]}>
            -{formatCurrency(data.breakdown.buffer, data.baseCurrency)}
          </Text>
        </View>
      )}

      <View style={styles.stsDivider} />

      <View style={styles.stsRow}>
        <Text style={styles.stsRowLabel}>{t('safeToSpend.daysLeft')}</Text>
        <Text style={styles.stsRowValue}>{data.daysRemaining}</Text>
      </View>
      <View style={styles.stsTotalRow}>
        <Text style={styles.stsTotalLabel}>{t('safeToSpend.today')}</Text>
        <Text style={styles.stsTotalValue}>
          {formatCurrency(data.safeToSpendToday, data.baseCurrency)}
        </Text>
      </View>

      {!data.incomeInferred && (
        <Text style={styles.stsNote}>{t('safeToSpend.noIncomeAssumed')}</Text>
      )}
      {data.fxApproximate && (
        <Text style={styles.stsNote}>{t('safeToSpend.approxRate')}</Text>
      )}

      <TouchableOpacity
        style={styles.stsCloseButton}
        onPress={onClose}
      >
        <Text style={styles.stsCloseText}>{t('common.done')}</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <SheetDialog
      visible={visible}
      onClose={onClose}
      titleId={TITLE_ID}
      // The shipped phone formula, `theme.spacing[8] + insets.bottom`, stated
      // as the wrapper's `pad above the inset` (ABA-483).
      padBottom={theme.spacing[8]}
      scrimColor="rgba(0,0,0,0.45)"
      sheetStyle={styles.sheetBox}
      handleStyle={styles.handleBox}
    >
      {content}
    </SheetDialog>
  );
}

const createStyles = (theme: Theme) => ({
  // Deviations from `SheetDialog`'s canonical sheet box, kept so the phone's
  // pixels do not move: this panel is a compact breakdown with tighter side
  // padding than a form sheet, and a slightly wider handle.
  sheetBox: {
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[3],
  },
  handleBox: {
    width: 40,
  },
  stsSheetTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
    textAlign: 'center' as const,
  },
  stsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  stsRowLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  stsRowValue: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    flexShrink: 0,
    textAlign: 'right' as const,
  },
  stsDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing[3],
  },
  stsTotalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
  stsTotalLabel: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
    flex: 1,
  },
  stsTotalValue: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.primary,
    fontWeight: '900' as const,
    flexShrink: 0,
    textAlign: 'right' as const,
  },
  stsNote: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
    fontStyle: 'italic' as const,
  },
  stsCloseButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    alignItems: 'center' as const,
    marginTop: theme.spacing[5],
  },
  stsCloseText: {
    ...theme.textStyles.bodyMedium,
    color: '#FFFFFF',
    fontWeight: '600' as const,
  },
});
