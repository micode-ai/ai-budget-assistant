import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
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
import { useTheme, useStyles, type Theme } from '@/theme';
import type { AccountRole, AccountMember, AccountInvitation } from '@budget/shared-types';
import { api } from '@/services/api';

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
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
  const ROLE_COLORS: Record<AccountRole, string> = {
    owner: theme.colors.primary,
    editor: theme.colors.secondary,
    viewer: theme.colors.textTertiary,
  };

  const account = accounts.find((a) => a.id === id);
  const accountMembers = id ? members[id] || [] : [];

  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(account?.name || '');
  const [invitations, setInvitations] = useState<AccountInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (id && (account?.type === 'shared' || account?.type === 'business' || account?.type === 'investment')) {
        loadMembers(id);
        loadInvitations();
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    buttons.push({ text: t('common.cancel'), onPress: async () => {} });
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
                  placeholderTextColor={theme.colors.textTertiary}
                  autoFocus
                />
                <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                  <Ionicons name="checkmark" size={20} color={theme.colors.textInverse} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEditMode(false);
                    setName(account.name);
                  }}
                >
                  <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
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
                    <Ionicons name="pencil-outline" size={20} color={theme.colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Members Section (for shared accounts) */}
        {(account.type === 'shared' || account.type === 'business' || account.type === 'investment') && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('accounts.members')}</Text>
              {isOwner && (
                <TouchableOpacity onPress={() => router.push(`/account/invite?accountId=${id}`)}>
                  <Ionicons name="person-add-outline" size={22} color={theme.colors.primary} />
                </TouchableOpacity>
              )}
            </View>

            {accountMembers.length === 0 && isLoading ? (
              <ActivityIndicator style={{ marginVertical: theme.spacing[5] }} color={theme.colors.primary} />
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
                        style={{ marginRight: theme.spacing[3] }}
                      >
                        <Ionicons name="swap-horizontal-outline" size={20} color={theme.colors.secondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleRemoveMember(member)}>
                        <Ionicons name="close-circle-outline" size={20} color={theme.colors.danger} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Pending Invitations (for shared accounts, owners only) */}
        {(account.type === 'shared' || account.type === 'business' || account.type === 'investment') && isOwner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('accounts.pendingInvitations')}</Text>
            {loadingInvitations ? (
              <ActivityIndicator style={{ marginVertical: theme.spacing[3] }} color={theme.colors.primary} />
            ) : invitations.length === 0 ? (
              <Text style={styles.emptyText}>{t('accounts.noPendingInvitations')}</Text>
            ) : (
              invitations.map((invitation) => (
                <View key={invitation.id} style={styles.memberCard}>
                  <View style={[styles.memberAvatar, { backgroundColor: '#F0AD4E' }]}>
                    <Ionicons name="mail-outline" size={18} color={theme.colors.textInverse} />
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
                    <Ionicons name="close-circle-outline" size={20} color={theme.colors.danger} />
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
              <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
              <Text style={styles.dangerButtonText}>{t('accounts.deleteAccount')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.dangerButton} onPress={handleLeave}>
              <Ionicons name="exit-outline" size={20} color={theme.colors.danger} />
              <Text style={styles.dangerButtonText}>{t('accounts.leaveAccount')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
  },
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  infoRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  accountName: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  accountType: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  editRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  editInput: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[2.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  cancelButton: {
    backgroundColor: theme.colors.surfaceSecondary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  memberCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: theme.spacing[3],
  },
  memberAvatarText: {
    color: theme.colors.textInverse,
    ...theme.textStyles.bodyLargeSemiBold,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  roleBadge: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.spacing[2.5],
    marginTop: theme.spacing[1],
  },
  roleText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
  },
  memberActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  dangerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.danger,
    gap: theme.spacing[2],
  },
  dangerButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.danger,
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[3],
  },
});
