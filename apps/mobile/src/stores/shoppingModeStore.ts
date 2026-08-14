import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import type { SessionSnapshot } from '@/features/shopping-mode/snapshot';

const mmkv = new MMKV({ id: 'shopping-mode' });
const SESSION_KEY = 'session';

export interface StoredSession {
  startedAt: number;
  insideMerchant: string | null;
  snapshot: SessionSnapshot;
}

/**
 * Pure, and deliberately paranoid.
 *
 * MMKV outlives app upgrades, so a row written by an older build can outlive
 * the shape that wrote it — and this is parsed inside a headless location
 * task, where a throw has no UI to surface in and no user to report it. An
 * unreadable session is treated as no session; the caller then stops the
 * service, which is the safe end state.
 */
export function parseStoredSession(raw: string | undefined): StoredSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed?.startedAt !== 'number') return null;
    if (!parsed.snapshot || !Array.isArray(parsed.snapshot.centres)) return null;
    return {
      startedAt: parsed.startedAt,
      insideMerchant: typeof parsed.insideMerchant === 'string' ? parsed.insideMerchant : null,
      snapshot: parsed.snapshot as SessionSnapshot,
    };
  } catch {
    return null;
  }
}

export function readSession(): StoredSession | null {
  return parseStoredSession(mmkv.getString(SESSION_KEY));
}

export function writeSession(session: StoredSession): void {
  mmkv.set(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  mmkv.delete(SESSION_KEY);
}

interface ShoppingModeState {
  active: boolean;
  merchant: string | null;
  /**
   * The location task writes MMKV directly — it cannot touch this store, and
   * on a headless wake this module may not even be the same JS context. So the
   * UI re-reads from disk rather than expecting to be told.
   */
  refreshFromDisk: () => void;
}

export const useShoppingModeStore = create<ShoppingModeState>((set) => ({
  active: readSession() !== null,
  merchant: readSession()?.insideMerchant ?? null,
  refreshFromDisk: () => {
    const session = readSession();
    set({ active: session !== null, merchant: session?.insideMerchant ?? null });
  },
}));
