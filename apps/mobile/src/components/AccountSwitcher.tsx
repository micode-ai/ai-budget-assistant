import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAccountStore } from '@/stores/accountStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useWalletStore } from '@/stores/walletStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { AccountType } from '@budget/shared-types';

const ACCOUNT_TYPE_ICONS: Record<AccountType, keyof typeof Ionicons.glyphMap> = {
  personal: 'person-outline',
  business: 'briefcase-outline',
  shared: 'people-outline',
  investment: 'trending-up-outline',
};

export function AccountSwitcher({ compact = false }: { compact?: boolean }) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  const { accounts, currentAccountId, switchAccount } = useAccountStore();
  const { loadExpenses } = useExpenseStore();
  const { loadIncomes } = useIncomeStore();
  const { loadCategories } = useCategoryStore();
  const { loadWallet } = useWalletStore();
  const { loadBudgets } = useBudgetStore();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const currentAccount = accounts.find((a) => a.id === currentAccountId);

  const handleSwitch = async (accountId: string) => {
    setVisible(false);
    if (accountId === currentAccountId) return;
    await switchAccount(accountId);
    // Reload all data for the new account
    await Promise.all([loadExpenses(), loadIncomes(), loadCategories(), loadWallet(), loadBudgets()]);
  };

  const handleTriggerPress = () => {
    if (accounts.length <= 1) {
      // Single account — go directly to account management
      router.push('/account/list');
    } else {
      setVisible(true);
    }
  };

  return (
    <>
      <TouchableOpacity style={[styles.trigger, compact && styles.triggerCompact]} onPress={handleTriggerPress}>
        <Ionicons
          name={ACCOUNT_TYPE_ICONS[currentAccount?.type || 'personal']}
          size={compact ? 14 : 18}
          color={theme.colors.textInverse}
        />
        <Text style={[styles.triggerText, compact && styles.triggerTextCompact]} numberOfLines={1}>
          {currentAccount?.name || t('accounts.personal')}
        </Text>
        {accounts.length > 1 && (
          <Ionicons name="chevron-down" size={compact ? 12 : 16} color={theme.colors.textInverse} />
        )}
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <View style={styles.dropdown}>
            <Text style={styles.dropdownTitle}>{t('accounts.switchAccount')}</Text>

            <FlatList
              data={accounts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.accountItem,
                    item.id === currentAccountId && styles.accountItemActive,
                  ]}
                  onPress={() => handleSwitch(item.id)}
                >
                  <View style={styles.accountIcon}>
                    <Ionicons
                      name={ACCOUNT_TYPE_ICONS[item.type]}
                      size={20}
                      color={item.id === currentAccountId ? theme.colors.primary : theme.colors.textSecondary}
                    />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text
                      style={[
                        styles.accountName,
                        item.id === currentAccountId && styles.accountNameActive,
                      ]}
                    >
                      {item.name}
                    </Text>
                    <Text style={styles.accountType}>
                      {t(`accounts.types.${item.type}`)}
                    </Text>
                  </View>
                  {item.id === currentAccountId && (
                    <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity
              style={styles.manageButton}
              onPress={() => {
                setVisible(false);
                router.push('/account/list');
              }}
            >
              <Ionicons name="settings-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.manageButtonText}>{t('accounts.manage')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  trigger: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginLeft: theme.spacing[4],
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1.5],
    backgroundColor: 'rgba(255,255,255,0.2)' as const,
    borderRadius: theme.borderRadius.xl,
    maxWidth: 140,
    gap: theme.spacing[1],
  },
  triggerCompact: {
    marginLeft: 0,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    maxWidth: 110,
  },
  triggerText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textInverse,
    flexShrink: 1,
  },
  triggerTextCompact: {
    fontSize: 12,
  },
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-start' as const,
    paddingTop: 100,
  },
  dropdown: {
    marginHorizontal: theme.spacing[5],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[4],
    maxHeight: 400,
    ...theme.shadows.lg,
  },
  dropdownTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing[5],
    marginBottom: theme.spacing[3],
  },
  accountItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
  },
  accountItemActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  accountIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceSecondary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: theme.spacing[3],
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  accountNameActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  accountType: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  manageButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    marginTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    gap: theme.spacing[1.5],
  },
  manageButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
});
