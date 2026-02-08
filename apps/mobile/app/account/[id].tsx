import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAccountStore } from '@/stores/accountStore';
import { useTranslation } from 'react-i18next';
import type { AccountRole, AccountMember, AccountInvitation } from '@budget/shared-types';
import { api } from '@/services/api';

type IconName = keyof typeof Ionicons.glyphMap;

const ROLE_COLORS: Record<AccountRole, string> = {
  owner: '#4ECDC4',
  editor: '#45B7D1',
  viewer: '#999',
};

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const {
    accounts,
    members,
    loadMembers,
    updateAccount,
    deleteAccount,
    removeMember,
    updateMemberRole,
    leaveAccount,
    isLoading,
  } = useAccountStore();

  const account = accounts.find((a) => a.id === id);
  const accountMembers = id ? members[id] || [] : [];

  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(account?.name || '');
  const [invitations, setInvitations] = useState<AccountInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (id && account?.type === 'shared') {
        loadMembers(id);
        loadInvitations();
      }
    }, [id, account?.type]),
  );

  const loadInvitations = async () => {
    if (!id) return;
    setLoadingInvitations(true);
    try {
      const data = await api.getInvitations(id);
      setInvitations(data.filter((inv) => inv.status === 'pending'));
    } catch {
      // Silently fail — invitations are supplementary
    } finally {
      setLoadingInvitations(false);
    }
  };

  if (!account) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.center}>
          <Text>{t('accounts.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = account.myRole === 'owner';

  const handleSave = async () => {
    if (!name.trim() || !id) return;
    try {
      await updateAccount(id, { name: name.trim() });
      setEditMode(false);
    } catch (e) {
      Alert.alert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('accounts.deleteConfirm'),
      t('accounts.deleteConfirmMessage', { name: account.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(id!);
              router.back();
            } catch (e) {
              Alert.alert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
            }
          },
        },
      ],
    );
  };

  const handleLeave = () => {
    Alert.alert(
      t('accounts.leaveConfirm'),
      t('accounts.leaveConfirmMessage', { name: account.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('accounts.leave'),
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveAccount(id!);
              router.back();
            } catch (e) {
              Alert.alert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
            }
          },
        },
      ],
    );
  };

  const handleRemoveMember = (member: AccountMember) => {
    Alert.alert(
      t('accounts.removeMemberConfirm'),
      t('accounts.removeMemberMessage', { name: member.user?.name || member.user?.email }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember(id!, member.id);
            } catch (e) {
              Alert.alert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
            }
          },
        },
      ],
    );
  };

  const handleCancelInvitation = (invitation: AccountInvitation) => {
    Alert.alert(
      t('accounts.cancelInvitation'),
      t('accounts.cancelInvitationMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.cancelInvitation(id!, invitation.id);
              setInvitations((prev) => prev.filter((inv) => inv.id !== invitation.id));
            } catch (e) {
              Alert.alert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
            }
          },
        },
      ],
    );
  };

  const handleChangeRole = (member: AccountMember) => {
    const roles: AccountRole[] = ['editor', 'viewer'];
    const buttons = roles.map((role) => ({
      text: t(`accounts.roles.${role}`),
      onPress: async () => {
        try {
          await updateMemberRole(id!, member.id, role);
        } catch (e) {
          Alert.alert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
        }
      },
    }));
    buttons.push({ text: t('common.cancel'), onPress: () => {} });
    Alert.alert(t('accounts.changeRole'), t('accounts.selectRole'), buttons as any);
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Account Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('accounts.details')}</Text>
          <View style={styles.card}>
            {editMode ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  value={name}
                  onChangeText={setName}
                  autoFocus
                />
                <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEditMode(false);
                    setName(account.name);
                  }}
                >
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.infoRow}>
                <View>
                  <Text style={styles.accountName}>{account.name}</Text>
                  <Text style={styles.accountType}>
                    {t(`accounts.types.${account.type}`)} | {account.currencyCode}
                  </Text>
                </View>
                {isOwner && (
                  <TouchableOpacity onPress={() => setEditMode(true)}>
                    <Ionicons name="pencil-outline" size={20} color="#4ECDC4" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Members Section (for shared accounts) */}
        {account.type === 'shared' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('accounts.members')}</Text>
              {isOwner && (
                <TouchableOpacity onPress={() => router.push(`/account/invite?accountId=${id}`)}>
                  <Ionicons name="person-add-outline" size={22} color="#4ECDC4" />
                </TouchableOpacity>
              )}
            </View>

            {accountMembers.length === 0 && isLoading ? (
              <ActivityIndicator style={{ marginVertical: 20 }} color="#4ECDC4" />
            ) : (
              accountMembers.map((member) => (
                <View key={member.id} style={styles.memberCard}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>
                      {(member.user?.name || member.user?.email || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {member.user?.name || member.user?.email}
                    </Text>
                    <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[member.role] + '20' }]}>
                      <Text style={[styles.roleText, { color: ROLE_COLORS[member.role] }]}>
                        {t(`accounts.roles.${member.role}`)}
                      </Text>
                    </View>
                  </View>
                  {isOwner && member.role !== 'owner' && (
                    <View style={styles.memberActions}>
                      <TouchableOpacity
                        onPress={() => handleChangeRole(member)}
                        style={{ marginRight: 12 }}
                      >
                        <Ionicons name="swap-horizontal-outline" size={20} color="#45B7D1" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleRemoveMember(member)}>
                        <Ionicons name="close-circle-outline" size={20} color="#FF6B6B" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Pending Invitations (for shared accounts, owners only) */}
        {account.type === 'shared' && isOwner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('accounts.pendingInvitations')}</Text>
            {loadingInvitations ? (
              <ActivityIndicator style={{ marginVertical: 12 }} color="#4ECDC4" />
            ) : invitations.length === 0 ? (
              <Text style={styles.emptyText}>{t('accounts.noPendingInvitations')}</Text>
            ) : (
              invitations.map((invitation) => (
                <View key={invitation.id} style={styles.memberCard}>
                  <View style={[styles.memberAvatar, { backgroundColor: '#F0AD4E' }]}>
                    <Ionicons name="mail-outline" size={18} color="#fff" />
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {invitation.invitedEmail || invitation.inviteCode}
                    </Text>
                    <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[invitation.role] + '20' }]}>
                      <Text style={[styles.roleText, { color: ROLE_COLORS[invitation.role] }]}>
                        {t(`accounts.roles.${invitation.role}`)}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleCancelInvitation(invitation)}>
                    <Ionicons name="close-circle-outline" size={20} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {/* Danger Zone */}
        <View style={styles.section}>
          {isOwner ? (
            <TouchableOpacity style={styles.dangerButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
              <Text style={styles.dangerButtonText}>{t('accounts.deleteAccount')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.dangerButton} onPress={handleLeave}>
              <Ionicons name="exit-outline" size={20} color="#FF6B6B" />
              <Text style={styles.dangerButtonText}>{t('accounts.leaveAccount')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  accountType: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: '#333',
  },
  saveButton: {
    backgroundColor: '#4ECDC4',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FF6B6B',
    gap: 8,
  },
  dangerButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 12,
  },
});
