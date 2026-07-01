import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { QuickActionIcon } from '@/components/QuickActionIcon';
import type { QuickActionKey } from '@/stores/quickActionStore';

// Static maps — no render-time dependency, hoisted to module scope.
const quickActionRoutes: Record<QuickActionKey, string> = {
  add_expense: '/expense/new',
  scan_receipt: '/expense/receipt',
  voice_expense: '/expense/voice',
  voice_income: '/income/voice',
  scan_invoice: '/income/receipt',
  exchange: '/wallet/exchange',
  converter: '/converter',
  transfers: '/wallet/transfer',
  subscriptions: '/subscriptions',
  purchase_request: '/purchase-requests',
};

const quickActionLabelKey: Record<QuickActionKey, string> = {
  add_expense: 'dashboard.addExpense',
  scan_receipt: 'dashboard.scanReceipt',
  voice_expense: 'dashboard.voiceInput',
  voice_income: 'dashboard.voiceIncome',
  scan_invoice: 'dashboard.scanInvoice',
  exchange: 'dashboard.exchangeCurrency',
  converter: 'dashboard.currencyConverter',
  transfers: 'dashboard.transfers',
  subscriptions: 'subscriptionManager.title',
  purchase_request: 'dashboard.purchaseRequest',
};

interface HomeQuickActionStripProps {
  visibleQuickActions: QuickActionKey[];
  isDesktopWeb: boolean;
}

export function HomeQuickActionStrip({ visibleQuickActions, isDesktopWeb }: HomeQuickActionStripProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const renderQuickActionIcon = (key: QuickActionKey) => {
    // Income variants reuse the expense SVGs recolored green.
    if (key === 'voice_income') return <QuickActionIcon name="voice_income" color={theme.colors.success} />;
    if (key === 'scan_invoice') return <QuickActionIcon name="scan_invoice" color={theme.colors.success} />;
    return <QuickActionIcon name={key} />;
  };

  return (
    <View style={[styles.quickActionsGrid, Platform.OS === 'web' && styles.webCenterRow, isDesktopWeb && styles.quickActionsGridDesktop]}>
      {visibleQuickActions.map((key) => (
        <TouchableOpacity
          key={key}
          style={styles.quickActionButton}
          onPress={() => router.push(quickActionRoutes[key] as any)}
        >
          {renderQuickActionIcon(key)}
          <Text style={styles.quickActionText} numberOfLines={2}>
            {t(quickActionLabelKey[key])}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  // Quick actions — wrapping, centered grid. The first row overlaps up into the
  // orange hero (marginTop) like before; extra rows grow the block downward and
  // push the page content below it down (no horizontal scroll).
  quickActionsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    columnGap: theme.spacing[2],
    rowGap: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
    paddingBottom: theme.spacing[1],
    marginTop: -22, // pull the first row up into the orange header (backed icons stay visible)
    zIndex: 1,
  },
  // Web no-op kept so the JSX style array stays valid (grid already centers).
  webCenterRow: {
    justifyContent: 'center' as const,
  },
  // Desktop web hides the hero, so the negative overlap margin would clip the
  // first row under the top bar — give it normal top spacing instead.
  quickActionsGridDesktop: {
    marginTop: theme.spacing[4],
  },
  quickActionButton: {
    width: 76,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
  },
  quickActionText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
});
