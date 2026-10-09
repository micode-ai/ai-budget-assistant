import { useTranslation } from 'react-i18next';
import { useGroupStore } from '@/stores/groupStore';
import { showAlert } from '@/utils/alert';
import type { GroupSettlement } from '@budget/shared-types';

/**
 * The "Void this payment?" confirm and the store call behind it, shared by the phone detail view
 * (tap a payment row) and the desktop one (the explicit Void button), so a payment is voided one
 * way. Pure move out of `GroupDetailView`: every line of the confirm is unchanged.
 */
export function useGroupVoidSettlement(groupId: string) {
  const { t } = useTranslation();
  const voidSettlement = useGroupStore((s) => s.voidSettlement);

  return (settlement: GroupSettlement) => {
    showAlert(t('groups.voidConfirmTitle'), t('groups.voidConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groups.voidPayment'),
        style: 'destructive',
        onPress: async () => {
          try {
            await voidSettlement(groupId, settlement.id);
          } catch (e) {
            showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
          }
        },
      },
    ]);
  };
}
