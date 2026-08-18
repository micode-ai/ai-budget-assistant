import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { AccountRole, AccountMember, AccountInvitation } from '@budget/shared-types';

interface MembersSectionProps {
  accountId: string;
  isOwner: boolean;
  members: AccountMember[];
  isLoadingMembers: boolean;
  invitations: AccountInvitation[];
  loadingInvitations: boolean;
  onChangeRole: (member: AccountMember) => void;
  onRemoveMember: (member: AccountMember) => void;
  onCancelInvitation: (invitation: AccountInvitation) => void;
}

export function MembersSection({
  accountId,
  isOwner,
  members,
  isLoadingMembers,
  invitations,
  loadingInvitations,
  onChangeRole,
  onRemoveMember,
  onCancelInvitation,
}: MembersSectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const ROLE_COLORS: Record<AccountRole, string> = {
    owner: theme.colors.primary,
    editor: theme.colors.secondary,
    viewer: theme.colors.textTertiary,
  };

  return (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('accounts.members')}</Text>
          {isOwner && (
            <TouchableOpacity onPress={() => router.push(`/account/invite?accountId=${accountId}`)}>
              <Ionicons name="person-add-outline" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {members.length === 0 && isLoadingMembers ? (
          <ActivityIndicator style={{ marginVertical: theme.spacing[5] }} color={theme.colors.primary} />
        ) : (
          members.map((member) => (
            <View key={member.id} style={styles.memberCard}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {(member.user?.name || member.user?.email || '?')[0].toUpperCase()}
                </Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.user?.name || member.user?.email}</Text>
                <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[member.role] + '20' }]}>
                  <Text style={[styles.roleText, { color: ROLE_COLORS[member.role] }]}>
                    {t(`accounts.roles.${member.role}`)}
                  </Text>
                </View>
              </View>
              {isOwner && member.role !== 'owner' && (
                <View style={styles.memberActions}>
                  <TouchableOpacity
                    onPress={() => onChangeRole(member)}
                    style={{ marginRight: theme.spacing[3] }}
                  >
                    <Ionicons name="swap-horizontal-outline" size={20} color={theme.colors.secondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onRemoveMember(member)}>
                    <Ionicons name="close-circle-outline" size={20} color={theme.colors.danger} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </View>

      {isOwner && (
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
                  <Ionicons name="mail-outline" size={18} color={theme.colors.onSemantic} />
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
                <TouchableOpacity onPress={() => onCancelInvitation(invitation)}>
                  <Ionicons name="close-circle-outline" size={20} color={theme.colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}
    </>
  );
}

const createStyles = (theme: Theme) => ({
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
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[3],
  },
});
