import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { SafeToSpendResponse } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

interface SafeToSpendSheetProps {
  visible: boolean;
  onClose: () => void;
  data: SafeToSpendResponse | null;
}

export function SafeToSpendSheet({ visible, onClose, data }: SafeToSpendSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  if (!data) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.stsBackdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.stsSheet}>
          <View style={styles.stsHandle} />
          <Text style={styles.stsSheetTitle}>{t('safeToSpend.breakdownTitle')}</Text>

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
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  // Safe-to-spend bottom-sheet
  stsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end' as const,
  },
  stsSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[5],
    paddingBottom: theme.spacing[8],
    paddingTop: theme.spacing[3],
  },
  stsHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
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
