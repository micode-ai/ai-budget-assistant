import { useEffect, useState } from 'react';
import { router, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { UpsertAccountGroupDto } from '@budget/shared-types';
import { showAlert } from '@/utils/alert';
import { useAllAccounts } from './useAllAccounts';
import { useAccountGroups } from './useAccountGroups';

/**
 * Everything the group comparison screen owns, in one hook so both platform layouts are fed from a single call
 * made in `GroupComparisonView*` (a resize across 1024 must not refetch).
 */
export function useGroupScreen(groupId: string) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const state = useAllAccounts({ groupId });
  const groups = useAccountGroups();
  const [editing, setEditing] = useState(false);
  const group = groups.groups.find((g) => g.id === groupId) ?? null;

  useEffect(() => {
    if (group) navigation.setOptions({ title: group.name });
  }, [group, navigation]);

  // showAlert, not Alert.alert: react-native-web stubs the latter to a no-op, so the dialog never appears.
  const confirmDelete = () =>
    showAlert(t('allAccounts.groups.delete'), t('allAccounts.groups.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void groups
            .remove(groupId)
            .then(() => router.back())
            .catch((err) => console.warn('Deleting the group failed', err));
        },
      },
    ]);

  const saveGroup = async (dto: UpsertAccountGroupDto) => {
    await groups.update(groupId, dto);
    void state.reload();
  };

  return { state, groups, group, editing, setEditing, confirmDelete, saveGroup };
}

export type GroupScreen = ReturnType<typeof useGroupScreen>;
