import { useCallback, useEffect, useState } from 'react';
import type { AccountGroupDto, UpsertAccountGroupDto } from '@budget/shared-types';
import { api } from '@/services/api';
import { useUpgradeStore } from '@/stores/upgradeStore';
import i18n from '@/i18n';

function isTierRequired(err: unknown): boolean {
  const e = err as { status?: number; code?: string } | null;
  return !!e && e.status === 403 && e.code === 'TIER_REQUIRED';
}

/** Pro account groups. A free user's TIER_REQUIRED 403 opens the upgrade sheet. */
export function useAccountGroups(enabled = true) {
  const [groups, setGroups] = useState<AccountGroupDto[]>([]);
  const [failed, setFailed] = useState(false);

  /** Returns true when the error was the paywall (handled), false otherwise. */
  const handle = useCallback((err: unknown): boolean => {
    if (isTierRequired(err)) {
      useUpgradeStore.getState().show(i18n.t('allAccounts.groups.title'), 'pro');
      return true;
    }
    console.warn('Account groups unavailable', err);
    return false;
  }, []);

  const reload = useCallback(async () => {
    setFailed(false);
    try {
      setGroups(await api.listAccountGroups());
    } catch (err) {
      // A free user simply has no groups; that is the paywall, not a failure.
      if (!isTierRequired(err)) {
        console.warn('Account groups unavailable', err);
        setFailed(true);
      }
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [reload, enabled]);

  const create = useCallback(
    async (dto: UpsertAccountGroupDto) => {
      try {
        const g = await api.createAccountGroup(dto);
        setGroups((p) => [...p, g]);
        return g;
      } catch (err) {
        if (!handle(err)) throw err;
        return null;
      }
    },
    [handle]
  );

  const update = useCallback(
    async (id: string, dto: UpsertAccountGroupDto) => {
      try {
        const g = await api.updateAccountGroup(id, dto);
        setGroups((p) => p.map((x) => (x.id === id ? g : x)));
        return g;
      } catch (err) {
        if (!handle(err)) throw err;
        return null;
      }
    },
    [handle]
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await api.deleteAccountGroup(id);
        setGroups((p) => p.filter((x) => x.id !== id));
      } catch (err) {
        if (!handle(err)) throw err;
      }
    },
    [handle]
  );

  return { groups, failed, reload, create, update, remove };
}
