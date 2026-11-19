import { api } from '@/services/api';
import { useAccountList } from '@/hooks/useAccountList';
import { vehiclesCache } from './vehiclesCache';

/**
 * Drop another account's cached list (a vehicle moved into it, ABA-801). It is
 * refetched when that account is current — a fetch now would carry the
 * CURRENT account's header and cache the wrong list under its key.
 */
export function forgetVehicles(accountId: string): void {
  vehiclesCache.delete(accountId);
}

/** Refetch an account's list after a write and tell every mounted user. */
export async function reloadVehicles(accountId: string): Promise<void> {
  vehiclesCache.set(accountId, await api.getVehicles());
}

/**
 * The current account's vehicles (ABA-796). `refresh` reloads on mount (the
 * settings screen); otherwise a cached list is reused while fresh and
 * revalidated when stale or on focus (ABA-833). A failed load is `loadFailed`,
 * never an empty list — offline there is no local copy.
 */
export function useVehicles({ refresh = false }: { refresh?: boolean } = {}) {
  const { list, ...rest } = useAccountList(vehiclesCache, api.getVehicles, { refresh, label: 'Vehicles' });
  return { ...rest, vehicles: list };
}
