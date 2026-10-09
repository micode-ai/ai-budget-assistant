import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useGroupStore } from '@/stores/groupStore';
import { useGroupDetail } from '@/hooks/useGroupDetail';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { balanceOf, findMember, isGroupWritable, liveMembers } from '@/features/groups/groupDisplay';
import { MAX_MEMBER_NAME_LENGTH } from '@/features/groups/groupSplit';
import type { GroupMember } from '@budget/shared-types';
import { GroupButton } from './GroupButton';
import { GroupOfflineBanner } from './GroupOfflineBanner';
import { GroupErrorState } from './GroupErrorState';
import { GroupMemberSheet } from './GroupMemberSheet';
import { GroupOwnerControls } from './GroupOwnerControls';
import { GroupPaymentInfoCard } from './GroupPaymentInfoCard';

/** Members: add a placeholder name, rename, my payment details, remove, and the owner controls. */
export function GroupMembersView({
  groupId,
  onLeftGroup,
}: {
  groupId: string;
  /**
   * Desktop dialog hosting (ABA-646): called when the group is gone for me (I left it, or the
   * owner deleted it), instead of `router.dismissTo('/groups')`. The phone passes nothing.
   */
  onLeftGroup?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { detail, loadFailed, reload } = useGroupDetail(groupId);
  const addMember = useGroupStore((s) => s.addMember);
  const updateMember = useGroupStore((s) => s.updateMember);
  const removeMember = useGroupStore((s) => s.removeMember);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<GroupMember | null>(null);

  if (!detail) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        {loadFailed ? (
          <GroupErrorState onRetry={reload} />
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  const writable = isGroupWritable(detail);
  const members = liveMembers(detail);
  const me = findMember(detail, detail.myMemberId);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await addMember(groupId, name);
      setNewName('');
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setAdding(false);
    }
  };

  const rename = async (memberId: string, name: string) => {
    try {
      await updateMember(groupId, memberId, { displayName: name });
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
      throw e;
    }
  };

  const leave = () => (onLeftGroup ? onLeftGroup() : router.dismissTo('/groups' as never));

  const doRemove = async (member: GroupMember) => {
    const isSelf = member.id === detail.myMemberId;
    try {
      await removeMember(groupId, member.id);
    } catch (e) {
      const status = (e as { status?: number } | undefined)?.status;
      // Leaving removes my own access, so the follow-up reload of the group is a 404: that is success.
      if (isSelf && status === 404) {
        leave();
        return;
      }
      showAlert(
        t('errors.error'),
        status === 409 ? t('groups.removeNeedsZero') : e instanceof Error ? e.message : t('errors.unknown'),
      );
      return;
    }
    setSelected(null);
    if (isSelf) leave();
  };

  const confirmRemove = (member: GroupMember) => {
    const isSelf = member.id === detail.myMemberId;
    showAlert(
      isSelf ? t('groups.leaveGroup') : t('common.remove'),
      isSelf ? t('groups.leaveConfirm') : t('groups.removeMemberConfirm', { name: member.displayName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: isSelf ? t('groups.leaveGroup') : t('common.remove'),
          style: 'destructive',
          onPress: () => void doRemove(member),
        },
      ],
    );
  };

  const canRename = (m: GroupMember) => writable && (detail.isOwner || m.id === detail.myMemberId);
  const removeLabelFor = (m: GroupMember): string | null => {
    if (!writable) return null;
    if (m.id === detail.myMemberId) return detail.isOwner ? null : t('groups.leaveGroup');
    return detail.isOwner ? t('common.remove') : null;
  };

  const memberTag = (m: GroupMember): string | null => {
    if (m.id === detail.myMemberId) return t('groups.youTag');
    if (m.id === detail.ownerMemberId) return t('groups.ownerTag');
    if (!m.isAppUser && !m.isClaimed) return t('groups.unclaimedTag');
    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <GroupOfflineBanner />
        <View style={styles.card}>
          <Text style={styles.title}>{t('groups.membersTitle')}</Text>
          {members.map((m) => {
            const balance = balanceOf(detail, m.id);
            const tag = memberTag(m);
            const tappable = canRename(m) || removeLabelFor(m) !== null;
            return (
              <TouchableOpacity
                key={m.id}
                style={styles.row}
                disabled={!tappable}
                onPress={() => setSelected(m)}
                activeOpacity={0.7}
              >
                <View style={styles.rowInfo}>
                  <Text style={styles.name} numberOfLines={1}>
                    {m.displayName}
                  </Text>
                  {tag && <Text style={styles.tag}>{tag}</Text>}
                </View>
                <Text
                  style={[
                    styles.balance,
                    {
                      color:
                        balance >= 0.01
                          ? theme.colors.success
                          : balance <= -0.01
                            ? theme.colors.danger
                            : theme.colors.textTertiary,
                    },
                  ]}
                >
                  {formatCurrency(balance, detail.currencyCode)}
                </Text>
                {tappable && <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />}
              </TouchableOpacity>
            );
          })}

          {writable && (
            <View style={styles.addRow}>
              <TextInput
                style={styles.addInput}
                value={newName}
                onChangeText={setNewName}
                placeholder={t('groups.addPlaceholderPlaceholder')}
                placeholderTextColor={theme.colors.textTertiary}
                maxLength={MAX_MEMBER_NAME_LENGTH}
                onSubmitEditing={add}
                returnKeyType="done"
              />
              <GroupButton
                label={t('groups.add')}
                onPress={add}
                loading={adding}
                write
                disabled={newName.trim().length === 0}
              />
            </View>
          )}
          {writable && <Text style={styles.hint}>{t('groups.addPlaceholderHint')}</Text>}
        </View>

        {me && (
          <View style={styles.gap}>
            <GroupPaymentInfoCard groupId={groupId} member={me} editable={writable} />
          </View>
        )}

        {detail.isOwner && (
          <View style={styles.gap}>
            <GroupOwnerControls detail={detail} writable={writable} onGroupGone={onLeftGroup} />
          </View>
        )}
      </ScrollView>

      <GroupMemberSheet
        member={selected}
        canRename={selected ? canRename(selected) : false}
        removeLabel={selected ? removeLabelFor(selected) : null}
        onClose={() => setSelected(null)}
        onRename={rename}
        onRemove={confirmRemove}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  rowInfo: {
    flex: 1,
  },
  name: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  tag: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  balance: {
    ...theme.textStyles.bodySmMedium,
  },
  addRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[4],
  },
  addInput: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },
  gap: {
    marginTop: theme.spacing[3],
  },
});
