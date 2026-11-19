import type { Pet } from '@budget/shared-types';
import { api } from '@/services/api';
import { useAccountList } from '@/hooks/useAccountList';
import { petsCache } from './petsCache';

/**
 * Write a pet the server just returned into the account's cached list and tell
 * every mounted reader (the transactions tab's bulk bar, the expense screen's
 * Pet section) at once, before any refetch (ABA-833).
 */
export function putPet(accountId: string, pet: Pet): void {
  petsCache.update(accountId, (list) =>
    list.some((p) => p.id === pet.id) ? list.map((p) => (p.id === pet.id ? pet : p)) : [...list, pet],
  );
}

export function dropPet(accountId: string, petId: string): void {
  petsCache.update(accountId, (list) => list.filter((p) => p.id !== petId));
}

/** Refetch an account's list after a write and tell every mounted user. */
export async function reloadPets(accountId: string): Promise<void> {
  petsCache.set(accountId, await api.getPets());
}

/**
 * The current account's pets (ABA-831). `refresh` reloads on mount (the
 * settings screen); otherwise a cached list is reused while fresh and
 * revalidated when stale or on focus. A failed load is `loadFailed`, never an
 * empty list — offline there is no local copy.
 */
export function usePets({ refresh = false }: { refresh?: boolean } = {}) {
  const { list, ...rest } = useAccountList(petsCache, api.getPets, { refresh, label: 'Pets' });
  return { ...rest, pets: list };
}
