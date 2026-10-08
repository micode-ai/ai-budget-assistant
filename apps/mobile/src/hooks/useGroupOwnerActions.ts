import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useGroupStore } from '@/stores/groupStore';
import { showAlert } from '@/utils/alert';
import type { GroupDetail } from '@budget/shared-types';

function messageOf(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

/**
 * The owner's destructive and sharing controls for one group, each behind its own confirmation:
 * rotate the link, turn guest access on/off, archive (with a second "archive anyway" step when
 * balances are open) and delete.
 */
export function useGroupOwnerActions(detail: GroupDetail) {
  const { t } = useTranslation();
  const rotateLink = useGroupStore((s) => s.rotateLink);
  const updateGroup = useGroupStore((s) => s.updateGroup);
  const archive = useGroupStore((s) => s.archive);
  const removeGroup = useGroupStore((s) => s.removeGroup);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showAlert(t('errors.error'), messageOf(e, t('errors.unknown')));
    } finally {
      setBusy(false);
    }
  };

  const setGuestAccess = (value: boolean) => run(() => updateGroup(detail.id, { guestAccess: value }));

  const confirmRotate = () =>
    showAlert(t('groups.rotateConfirmTitle'), t('groups.rotateConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groups.rotateLink'),
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await rotateLink(detail.id);
            showAlert(t('groups.rotated'));
          }),
      },
    ]);

  const archiveNow = async (force: boolean) => {
    setBusy(true);
    try {
      await archive(detail.id, force);
    } catch (e) {
      // 409: balances are still open and `force` was not passed. Offer the override.
      const status = (e as { status?: number } | undefined)?.status;
      if (!force && status === 409) {
        showAlert(t('groups.archiveGroup'), t('groups.archiveForceBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('groups.archiveForce'), style: 'destructive', onPress: () => void archiveNow(true) },
        ]);
      } else {
        showAlert(t('errors.error'), messageOf(e, t('errors.unknown')));
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmArchive = () =>
    showAlert(t('groups.archiveGroup'), t('groups.archiveConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('groups.archiveGroup'), style: 'destructive', onPress: () => void archiveNow(false) },
    ]);

  const confirmDelete = () =>
    showAlert(t('groups.deleteGroup'), t('groups.deleteGroupConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groups.deleteGroup'),
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await removeGroup(detail.id);
            router.dismissTo('/groups' as never);
          }),
      },
    ]);

  return { busy, setGuestAccess, confirmRotate, confirmArchive, confirmDelete };
}
