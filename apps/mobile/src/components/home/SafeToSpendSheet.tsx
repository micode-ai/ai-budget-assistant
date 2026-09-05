import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { SafeToSpendResponse } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

interface SafeToSpendSheetProps {
  visible: boolean;
  onClose: () => void;
  data: SafeToSpendResponse | null;
  /**
   * Desktop web (`docs/design/2026-09-05-dashboard-web.md`'s "The two sheets
   * that must stop being sheets") — swaps the slide-up sheet chrome and its
   * `TouchableOpacity` backdrop for a centred dialog with a raw `<div>`
   * scrim, following `InflationIndexSection`'s established `desktop?`
   * convention (itself following `ExpenseDialog.tsx`'s verified-against-
   * react-native-web-source reasoning: a `Pressable`/`TouchableOpacity`
   * backdrop always carries a `tabIndex`, making it the focus trap's first,
   * invisible target). Defaults to `false` — mobile's own call site passes
   * nothing and gets today's exact bottom sheet, backdrop included. The row
   * content below (wallet, expected income, subscriptions, etc.) is shared
   * verbatim by both branches; only the outer chrome differs.
   */
  desktop?: boolean;
}

/**
 * Stable accessible-name id for the sheet/dialog title. A fixed id is safe
 * for the same reason `ExpenseDialog.tsx`'s `TITLE_ID` and
 * `ProductDetailSheet.tsx`'s `PRODUCT_DETAIL_TITLE_ID` are: only one
 * instance of this component is ever mounted at a time.
 */
const TITLE_ID = 'safe-to-spend-sheet-title';

export function SafeToSpendSheet({ visible, onClose, data, desktop = false }: SafeToSpendSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

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

  if (desktop) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        aria-labelledby={TITLE_ID}
      >
        {/* Deliberately a raw <div>, not a themed RN View/Pressable — see
            `ExpenseDialog.tsx`'s file-level comment for why it must carry
            no tabindex at all (a `Pressable`/`TouchableOpacity` scrim would
            steal the focus trap's initial focus). */}
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
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
          <View style={styles.dialogPanel}>
            <ScrollView style={styles.dialogBody} contentContainerStyle={styles.dialogBodyContent}>
              {content}
            </ScrollView>
          </View>
        </div>
      </Modal>
    );
  }

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
        {/* The system navigation bar overlays this window, so the bottom padding
            has to clear it — a fixed value left the last row unreachable on a
            three-button-nav device (ABA-483). */}
        <View style={[styles.stsSheet, { paddingBottom: theme.spacing[8] + insets.bottom }]}>
          <View style={styles.stsHandle} />
          {content}
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
  // Desktop-only centred dialog chrome, mirroring `ExpenseDialog.tsx`'s
  // panel shape (`InflationIndexSection.tsx`'s `dialogPanel` precedent) —
  // narrower than that one since this panel is a compact breakdown, not a
  // form. No separate header/close-button row: `stsCloseButton` inside
  // `content` already closes the dialog, and `onRequestClose`/backdrop-click
  // cover `Esc`/click-outside.
  dialogPanel: {
    width: '90%' as const,
    maxWidth: 480,
    maxHeight: '85%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  dialogBody: {
    flexShrink: 1,
  },
  dialogBodyContent: {
    padding: theme.spacing[5],
  },
});
