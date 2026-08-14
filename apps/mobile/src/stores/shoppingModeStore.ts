import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import type { SessionSnapshot } from '@/features/shopping-mode/snapshot';
import { isRealPoint, type StoreCentre } from '@/features/stores/findNearbyStore';

const mmkv = new MMKV({ id: 'shopping-mode' });
const SESSION_KEY = 'session';

export interface StoredSession {
  startedAt: number;
  insideMerchant: string | null;
  snapshot: SessionSnapshot;
}

/**
 * Keep only the centres that can actually be measured against.
 *
 * `nearestWithin` compares `haversineM(...) > radiusM`, and every comparison
 * against `NaN` is false — so a centre with a non-finite coordinate skips the
 * `continue`, becomes `best` on the first pass, and **fires a false arrival**
 * at a shop the user is nowhere near. `isRealPoint` also drops (0, 0), the
 * null-island convention for the zeroed plaintext of an undecryptable tier-2
 * row, which is not a place either.
 *
 * A bad row is dropped, not fatal: one malformed centre must not cost a
 * session its other four shops.
 */
function parseCentres(raw: unknown): StoreCentre[] | null {
  if (!Array.isArray(raw)) return null;
  const centres: StoreCentre[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { merchant, lat, lng } = entry as Partial<StoreCentre>;
    if (typeof merchant !== 'string' || merchant.length === 0) continue;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!isRealPoint({ lat, lng })) continue;
    centres.push({ merchant, lat, lng });
  }
  return centres;
}

/**
 * Pure, and deliberately paranoid.
 *
 * MMKV outlives app upgrades, so a row written by an older build can outlive
 * the shape that wrote it — and this is parsed inside a headless location
 * task, where a throw has no UI to surface in and no user to report it. An
 * unreadable session is treated as no session; the caller then stops the
 * service, which is the safe end state.
 *
 * The guards below are deliberately symmetric with what the location task
 * actually reads: it is not enough to know `centres` IS an array (the
 * coordinates inside it reach a distance comparison) or that `startedAt` is a
 * number. `uncheckedCount` in particular is read twice — once as the exit
 * notification's `{{count}}`, once as `> 0` to decide whether to notify at
 * all — so an absent one silently suppresses the exit AND renders an empty
 * count. Same posture as `arrivalText`'s `Number.isFinite` check on
 * `safeToSpendToday`: degrade to something true rather than trust the row.
 *
 * `uncheckedLabels` needs no guard here — `refreshSessionItems`'s `sameLabels`
 * is its only reader and already checks `Array.isArray`.
 */
export function parseStoredSession(raw: string | undefined): StoredSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed?.startedAt !== 'number' || !Number.isFinite(parsed.startedAt)) return null;
    if (!parsed.snapshot) return null;
    const centres = parseCentres(parsed.snapshot.centres);
    if (centres === null) return null;

    // 0 is the honest fallback for an unreadable count: it says nothing is
    // left, which suppresses the exit notification rather than posting one
    // with a blank number in it.
    const storedCount = parsed.snapshot.uncheckedCount;
    const uncheckedCount =
      typeof storedCount === 'number' && Number.isFinite(storedCount) && storedCount >= 0
        ? Math.floor(storedCount)
        : 0;

    return {
      startedAt: parsed.startedAt,
      insideMerchant: typeof parsed.insideMerchant === 'string' ? parsed.insideMerchant : null,
      snapshot: { ...(parsed.snapshot as SessionSnapshot), centres, uncheckedCount },
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

function deriveState(session: StoredSession | null): Pick<ShoppingModeState, 'active' | 'merchant'> {
  return { active: session !== null, merchant: session?.insideMerchant ?? null };
}

export const useShoppingModeStore = create<ShoppingModeState>((set) => ({
  ...deriveState(readSession()),
  refreshFromDisk: () => {
    set(deriveState(readSession()));
  },
}));
