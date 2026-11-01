import { create } from 'zustand';
import { api } from '@/services/api';
import type { DeveloperApp, DeveloperAppInput, DeveloperAppUpdate } from '@/services/developerApps.api';
import { isPublicApiUnavailable } from '@/features/developers/developerApps';

/**
 * Settings → Developers (Public API phase 1): the OAuth apps this user registered.
 *
 * Server-only, like `inboundReceiptStore`/`groupStore`: an app registration is useless offline (its
 * client id and secret only mean anything to the server), so there is no SQLite mirror and no sync
 * queue — a write that fails is reported to the user, never queued.
 *
 * `availability` is the feature gate for BOTH the Developers and the Connected apps rows: with
 * `PUBLIC_API_ENABLED` off every route of both answers 404 (the `inboundMail` pattern —
 * `settingsRegistry`'s `requiresFeature` reads a runtime answer, not a config field). A network
 * failure leaves it `unknown`; it must never hide the feature.
 *
 * `revealedSecret` is the one-time client secret from a create or a rotate. It lives ONLY here, in
 * memory: this store has no `persist`, nothing writes it to MMKV/SQLite/secure storage, and nothing
 * logs it. It is cleared by `acknowledgeSecret()` (the "I've saved it" button), by deleting the app
 * it belongs to, and by `reset()` (sign-out, via `authSessionActions.logout`).
 */
export type PublicApiAvailability = 'unknown' | 'available' | 'unavailable';

export interface RevealedSecret {
  appId: string;
  appName: string;
  clientId: string;
  clientSecret: string;
}

interface DeveloperAppsState {
  availability: PublicApiAvailability;
  apps: DeveloperApp[];
  /** `true` once the list route answered for this session. */
  loaded: boolean;
  isLoading: boolean;
  error: string | null;
  revealedSecret: RevealedSecret | null;

  /** Learns whether the feature is on, once per session (settings hub / left pane). */
  probe: () => Promise<void>;
  loadApps: () => Promise<void>;
  createApp: (input: DeveloperAppInput) => Promise<DeveloperApp>;
  updateApp: (id: string, input: DeveloperAppUpdate) => Promise<DeveloperApp>;
  rotateSecret: (id: string) => Promise<void>;
  deleteApp: (id: string) => Promise<void>;
  acknowledgeSecret: () => void;
  /** Called by `connectedAppsStore` when its routes answer: one gate for both rows. */
  setAvailability: (availability: PublicApiAvailability) => void;
  reset: () => void;
}

const initial = {
  availability: 'unknown' as PublicApiAvailability,
  apps: [] as DeveloperApp[],
  loaded: false,
  isLoading: false,
  error: null as string | null,
  revealedSecret: null as RevealedSecret | null,
};

/** Status and message only — never the error object, which could one day carry a response body. */
function failureLabel(e: unknown): string {
  const status = (e as { status?: number } | null)?.status;
  return status ? `HTTP ${status}` : 'request failed';
}

export const useDeveloperAppsStore = create<DeveloperAppsState>()((set, get) => {
  function warn(label: string, e: unknown) {
    console.warn(`[developerAppsStore] ${label} failed: ${failureLabel(e)}`);
  }

  /**
   * A 404 on `/developer/apps/:id` means THIS app is gone (deleted from another device or tab —
   * `getOwned` answers "App not found"), never that the feature is off: only the list route may
   * decide that. Drop the stale app and let the caller show `errors.notFound`.
   */
  function dropIfGone(id: string, e: unknown) {
    if ((e as { status?: number } | null)?.status !== 404) return;
    set((s) => ({
      apps: s.apps.filter((a) => a.id !== id),
      revealedSecret: s.revealedSecret?.appId === id ? null : s.revealedSecret,
    }));
  }

  return {
    ...initial,

    probe: async () => {
      if (get().availability === 'unavailable' || get().loaded) return;
      await get().loadApps();
    },

    loadApps: async () => {
      set({ isLoading: true, error: null });
      try {
        const { apps } = await api.listDeveloperApps();
        set({ apps, loaded: true, availability: 'available' });
      } catch (e) {
        // The list route is the only one whose 404 means PUBLIC_API_ENABLED is off.
        if (isPublicApiUnavailable(e)) {
          set({ availability: 'unavailable', apps: [], revealedSecret: null });
        } else {
          warn('loadApps', e);
          set({ error: failureLabel(e) });
        }
      } finally {
        set({ isLoading: false });
      }
    },

    createApp: async (input) => {
      try {
        const { app, clientSecret } = await api.createDeveloperApp(input);
        set((s) => ({
          apps: [{ ...app, connectedUsers: 0, lastUsedAt: null }, ...s.apps.filter((a) => a.id !== app.id)],
          revealedSecret: clientSecret
            ? { appId: app.id, appName: app.name, clientId: app.clientId, clientSecret }
            : null,
        }));
        return app;
      } catch (e) {
        warn('createApp', e);
        throw e;
      }
    },

    updateApp: async (id, input) => {
      try {
        const { app } = await api.updateDeveloperApp(id, input);
        // The update route returns the bare app; keep the counters the list route added.
        set((s) => ({ apps: s.apps.map((a) => (a.id === id ? { ...a, ...app } : a)) }));
        return app;
      } catch (e) {
        warn('updateApp', e);
        dropIfGone(id, e);
        throw e;
      }
    },

    rotateSecret: async (id) => {
      try {
        const { clientSecret } = await api.rotateDeveloperAppSecret(id);
        const app = get().apps.find((a) => a.id === id);
        set({
          revealedSecret: {
            appId: id,
            appName: app?.name ?? '',
            clientId: app?.clientId ?? '',
            clientSecret,
          },
        });
      } catch (e) {
        warn('rotateSecret', e);
        dropIfGone(id, e);
        throw e;
      }
    },

    deleteApp: async (id) => {
      try {
        await api.deleteDeveloperApp(id);
      } catch (e) {
        // 404: already gone, which is what the user asked for. Never a feature-off signal here.
        const status = (e as { status?: number } | null)?.status;
        if (status !== 404) {
          warn('deleteApp', e);
          throw e;
        }
      }
      set((s) => ({
        apps: s.apps.filter((a) => a.id !== id),
        revealedSecret: s.revealedSecret?.appId === id ? null : s.revealedSecret,
      }));
    },

    acknowledgeSecret: () => set({ revealedSecret: null }),

    setAvailability: (availability) =>
      set(availability === 'unavailable' ? { availability, apps: [], revealedSecret: null } : { availability }),

    reset: () => set({ ...initial }),
  };
});
