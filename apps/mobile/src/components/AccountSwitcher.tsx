import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAccountStore } from '@/stores/accountStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTranslation } from 'react-i18next';
import type { AccountType } from '@budget/shared-types';

const ACCOUNT_TYPE_ICONS: Record<AccountType, keyof typeof Ionicons.glyphMap> = {
  personal: 'person-outline',
  business: 'briefcase-outline',
  shared: 'people-outline',
};

export function AccountSwitcher() {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  const { accounts, currentAccountId, switchAccount } = useAccountStore();
  const { loadExpenses } = useExpenseStore();

  const currentAccount = accounts.find((a) => a.id === currentAccountId);

  const handleSwitch = async (accountId: string) => {
    setVisible(false);
    if (accountId === currentAccountId) return;
    await switchAccount(accountId);
    // Reload data for the new account
    await loadExpenses();
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
      <TouchableOpacity style={styles.trigger} onPress={handleTriggerPress}>
        <Ionicons
          name={ACCOUNT_TYPE_ICONS[currentAccount?.type || 'personal']}
          size={18}
          color="#fff"
        />
        <Text style={styles.triggerText} numberOfLines={1}>
          {currentAccount?.name || t('accounts.personal')}
        </Text>
        {accounts.length > 1 && (
          <Ionicons name="chevron-down" size={16} color="#fff" />
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
                      color={item.id === currentAccountId ? '#4ECDC4' : '#666'}
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
                    <Ionicons name="checkmark-circle" size={20} color="#4ECDC4" />
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
              <Ionicons name="settings-outline" size={18} color="#4ECDC4" />
              <Text style={styles.manageButtonText}>{t('accounts.manage')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    maxWidth: 180,
    gap: 4,
  },
  triggerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    paddingTop: 100,
  },
  dropdown: {
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    maxHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  accountItemActive: {
    backgroundColor: '#f0faf9',
  },
  accountIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  accountNameActive: {
    color: '#4ECDC4',
    fontWeight: '600',
  },
  accountType: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 6,
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4ECDC4',
  },
});
