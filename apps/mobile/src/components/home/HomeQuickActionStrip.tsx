import { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Modal, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { QuickActionIcon } from '@/components/QuickActionIcon';
import type { QuickActionKey } from '@/stores/quickActionStore';

// Static maps — no render-time dependency, hoisted to module scope.
// `shopping_hub` has no direct route: it opens a bottom-sheet menu instead.
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
  shopping_hub: '',
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
  shopping_hub: 'dashboard.shoppingList',
};

// The two actions merged behind the `shopping_hub` button.
const shoppingHubItems: { labelKey: string; route: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { labelKey: 'dashboard.shoppingListFull', route: '/shopping-list', icon: 'list-outline' },
  { labelKey: 'dashboard.purchaseRequest', route: '/purchase-requests', icon: 'cart-outline' },
];

interface HomeQuickActionStripProps {
  visibleQuickActions: QuickActionKey[];
  isDesktopWeb: boolean;
}

export function HomeQuickActionStrip({ visibleQuickActions, isDesktopWeb }: HomeQuickActionStripProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [hubOpen, setHubOpen] = useState(false);

  const renderQuickActionIcon = (key: QuickActionKey) => {
    // Income variants reuse the expense SVGs recolored green.
    if (key === 'voice_income') return <QuickActionIcon name="voice_income" color={theme.colors.success} />;
    if (key === 'scan_invoice') return <QuickActionIcon name="scan_invoice" color={theme.colors.success} />;
    return <QuickActionIcon name={key} />;
  };

  const onPressAction = (key: QuickActionKey) => {
    if (key === 'shopping_hub') {
      setHubOpen(true);
      return;
    }
    router.push(quickActionRoutes[key] as any);
  };

  return (
    <>
      <View style={[styles.quickActionsGrid, Platform.OS === 'web' && styles.webCenterRow, isDesktopWeb && styles.quickActionsGridDesktop]}>
        {visibleQuickActions.map((key) => (
          <TouchableOpacity
            key={key}
            style={styles.quickActionButton}
            onPress={() => onPressAction(key)}
          >
            {renderQuickActionIcon(key)}
            <Text style={styles.quickActionText} numberOfLines={2}>
              {t(quickActionLabelKey[key])}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Modal
        visible={hubOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHubOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setHubOpen(false)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.spacing[4]) }]}
            onPress={() => {}}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('dashboard.shoppingList')}</Text>
            {shoppingHubItems.map((item) => (
              <TouchableOpacity
                key={item.route}
                style={styles.sheetRow}
                onPress={() => {
                  setHubOpen(false);
                  router.push(item.route as any);
                }}
              >
                <View style={styles.sheetIconWrap}>
                  <Ionicons name={item.icon} size={22} color={theme.colors.primary} />
                </View>
                <Text style={styles.sheetRowText}>{t(item.labelKey)}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
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

  // Shopping hub bottom-sheet
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end' as const,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
  },
  sheetHandle: {
    alignSelf: 'center' as const,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing[3],
  },
  sheetTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  sheetRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3.5],
  },
  sheetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sheetRowText: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
    flex: 1,
  },
});
