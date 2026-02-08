import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAccountStore } from '@/stores/accountStore';
import { useTranslation } from 'react-i18next';
import type { AccountType, AccountRole } from '@budget/shared-types';

type IconName = keyof typeof Ionicons.glyphMap;

const ACCOUNT_TYPE_ICONS: Record<AccountType, IconName> = {
  personal: 'person-outline',
  business: 'briefcase-outline',
  shared: 'people-outline',
};

const ROLE_COLORS: Record<AccountRole, string> = {
  owner: '#4ECDC4',
  editor: '#45B7D1',
  viewer: '#999',
};

export default function AccountListScreen() {
  const { t } = useTranslation();
  const { accounts, currentAccountId, deleteAccount } = useAccountStore();

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      t('accounts.deleteConfirm'),
      t('accounts.deleteConfirmMessage', { name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(id);
            } catch (e) {
              Alert.alert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.accountCard,
              item.id === currentAccountId && styles.accountCardActive,
            ]}
            onPress={() => router.push(`/account/${item.id}`)}
          >
            <View style={styles.accountIcon}>
              <Ionicons
                name={ACCOUNT_TYPE_ICONS[item.type]}
                size={24}
                color={item.id === currentAccountId ? '#4ECDC4' : '#666'}
              />
            </View>
            <View style={styles.accountInfo}>
              <Text style={styles.accountName}>{item.name}</Text>
              <View style={styles.accountMeta}>
                <Text style={styles.accountType}>
                  {t(`accounts.types.${item.type}`)}
                </Text>
                <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[item.myRole] + '20' }]}>
                  <Text style={[styles.roleText, { color: ROLE_COLORS[item.myRole] }]}>
                    {t(`accounts.roles.${item.myRole}`)}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.actions}>
              {item.id === currentAccountId && (
                <Ionicons name="checkmark-circle" size={20} color="#4ECDC4" style={{ marginRight: 8 }} />
              )}
              {item.myRole === 'owner' && (
                <TouchableOpacity onPress={() => handleDelete(item.id, item.name)}>
                  <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListFooterComponent={() => (
          <View style={styles.footerButtons}>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => router.push('/account/create')}
            >
              <Ionicons name="add-circle-outline" size={24} color="#4ECDC4" />
              <Text style={styles.createButtonText}>{t('accounts.create')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.joinButton}
              onPress={() => router.push('/account/join')}
            >
              <Ionicons name="enter-outline" size={24} color="#45B7D1" />
              <Text style={styles.joinButtonText}>{t('accounts.joinAccount')}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  list: {
    padding: 16,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  accountCardActive: {
    borderColor: '#4ECDC4',
    borderWidth: 2,
  },
  accountIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  accountMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  accountType: {
    fontSize: 13,
    color: '#999',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerButtons: {
    gap: 12,
    marginTop: 4,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#4ECDC4',
    borderStyle: 'dashed',
    gap: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ECDC4',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#45B7D1',
    borderStyle: 'dashed',
    gap: 8,
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#45B7D1',
  },
});
