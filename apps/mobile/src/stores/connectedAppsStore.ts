import { create } from 'zustand';
import { api } from '@/services/api';
import type { ConnectedApp } from '@/services/developerApps.api';
import { isPublicApiUnavailable } from '@/features/developers/developerApps';
import { useDeveloperAppsStore } from './developerAppsStore';

/**
 * Settings → Connected apps (Public API phase 1): every third-party app connected to an account
 * where the user is owner or editor. The server does that filtering, so a viewer simply sees the
 * accounts they can act on and nothing else.
 *
 * Server-only (no SQLite mirror, no sync queue): a grant is a server-side credential, and a
 * disconnect that only happened on the device would leave the app able to read the account.
 *
 * Spans every account, so it is not reloaded on an account switch; it IS cleared on sign-out
 * (`authSessionActions.logout`). The feature gate lives in `developerAppsStore.availability`.
 */
interface ConnectedAppsState {
  items: ConnectedApp[];
  loaded: boolean;
  isLoading: boolean;
  error: string | null;

  load: () => Promise<void>;
  disconnect: (grantId: string) => Promise<void>;
  removeAccount: (grantId: string, accountId: string) => Promise<void>;
  reset: () => void;
}

const initial = {
  items: [] as ConnectedApp[],
  loaded: false,
  isLoading: false,
  error: null as string | null,
};

function failureLabel(e: unknown): string {
  const status = (e as { status?: number } | null)?.status;
  return status ? `HTTP ${status}` : 'request failed';
}

export const useConnectedAppsStore = create<ConnectedAppsState>()((set) => ({
  ...initial,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const items = await api.listConnectedApps();
      set({ items, loaded: true });
      useDeveloperAppsStore.getState().setAvailability('available');
    } catch (e) {
      if (isPublicApiUnavailable(e)) {
        set({ items: [] });
        useDeveloperAppsStore.getState().setAvailability('unavailable');
      } else {
        console.warn(`[connectedAppsStore] load failed: ${failureLabel(e)}`);
        set({ error: failureLabel(e) });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  disconnect: async (grantId) => {
    try {
      await api.disconnectConnectedApp(grantId);
    } catch (e) {
      // 404: this grant is gone (revoked elsewhere, or no longer ours to revoke) — drop it from the
      // list. Never a feature-off signal: only `load()` (the list route) may decide that.
      if ((e as { status?: number } | null)?.status !== 404) {
        console.warn(`[connectedAppsStore] disconnect failed: ${failureLabel(e)}`);
        throw e;
      }
    }
    set((s) => ({ items: s.items.filter((g) => g.grantId !== grantId) }));
  },

  removeAccount: async (grantId, accountId) => {
    try {
      await api.removeConnectedAppAccount(grantId, accountId);
    } catch (e) {
      // 404: already gone (or not ours to remove) — same rule as `disconnect`.
      if ((e as { status?: number } | null)?.status !== 404) {
        console.warn(`[connectedAppsStore] removeAccount failed: ${failureLabel(e)}`);
        throw e;
      }
    }
    set((s) => ({
      items: s.items.flatMap((g) => {
        if (g.grantId !== grantId) return [g];
        const accounts = g.accounts.filter((a) => a.id !== accountId);
        return accounts.length > 0 ? [{ ...g, accounts }] : [];
      }),
    }));
  },

  reset: () => set({ ...initial }),
}));
