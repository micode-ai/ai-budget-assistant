import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { showAlert } from '@/utils/alert';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAccountStore } from '@/stores/accountStore';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { AccountRole, AccountMember, AccountInvitation } from '@budget/shared-types';
import { api } from '@/services/api';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { FinancialMonthSheet } from '@/components/account/FinancialMonthSheet';
import { MembersSection } from '@/components/account/MembersSection';
import { TripActionsCard, TripArchiveButton } from '@/components/account/TripSection';

const MEMBER_VISIBLE_TYPES: string[] = ['shared', 'business', 'investment', 'trip'];

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

  const account = accounts.find((a) => a.id === id);
  const accountMembers = id ? members[id] || [] : [];

  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(account?.name || '');
  const [invitations, setInvitations] = useState<AccountInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [showAnchorSheet, setShowAnchorSheet] = useState(false);
  const [pendingAnchorDay, setPendingAnchorDay] = useState<number | null>(null);
  const [savingAnchor, setSavingAnchor] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (id && account && MEMBER_VISIBLE_TYPES.includes(account.type)) {
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
  const showMembers = MEMBER_VISIBLE_TYPES.includes(account.type);

  const openAnchorSheet = () => {
    setPendingAnchorDay(account.monthAnchorDay ?? null);
    setShowAnchorSheet(true);
  };

  const handleSaveAnchor = async () => {
    if (!id) return;
    setSavingAnchor(true);
    try {
      await updateAccount(id, { monthAnchorDay: pendingAnchorDay });
      setShowAnchorSheet(false);
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setSavingAnchor(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !id) return;
    try {
      await updateAccount(id, { name: name.trim() });
      setEditMode(false);
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleDelete = () => {
    showAlert(
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
              showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
            }
          },
        },
      ],
    );
  };

  const handleLeave = () => {
    showAlert(
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
              showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
            }
          },
        },
      ],
    );
  };

  const handleRemoveMember = (member: AccountMember) => {
    showAlert(
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
              showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
            }
          },
        },
      ],
    );
  };

  const handleCancelInvitation = (invitation: AccountInvitation) => {
    showAlert(
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
              showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
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
          showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
        }
      },
    }));
    buttons.push({ text: t('common.cancel'), onPress: async () => {} });
    showAlert(t('accounts.changeRole'), t('accounts.selectRole'), buttons as any);
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <KeyboardAwareScreen style={styles.scrollView} contentContainerStyle={styles.content}>
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

        {/* Financial month anchor (owner-only) */}
        {isOwner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('accounts.financialMonth')}</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.tripActionRow}
                onPress={openAnchorSheet}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
                <Text style={styles.tripActionText}>
                  {account.monthAnchorDay
                    ? t('accounts.financialMonthStartsOn', { day: account.monthAnchorDay })
                    : t('accounts.financialMonthCalendar')}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Trip actions (only for trip accounts) */}
        {account.type === 'trip' && <TripActionsCard accountId={id!} />}

        {/* Members + pending invitations (for shared/business/investment/trip accounts) */}
        {showMembers && (
          <MembersSection
            accountId={id!}
            isOwner={isOwner}
            members={accountMembers}
            isLoadingMembers={isLoading}
            invitations={invitations}
            loadingInvitations={loadingInvitations}
            onChangeRole={handleChangeRole}
            onRemoveMember={handleRemoveMember}
            onCancelInvitation={handleCancelInvitation}
          />
        )}

        {/* Danger Zone */}
        <View style={styles.section}>
          {account.type === 'trip' && (
            <TripArchiveButton accountId={id!} isOwner={isOwner} tripStatus={account.tripStatus} />
          )}
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
      </KeyboardAwareScreen>

      <FinancialMonthSheet
        visible={showAnchorSheet}
        onClose={() => setShowAnchorSheet(false)}
        pendingAnchorDay={pendingAnchorDay}
        onSelectDay={setPendingAnchorDay}
        onSave={handleSaveAnchor}
        saving={savingAnchor}
      />
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
  tripActionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[3],
  },
  tripActionText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
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
});
