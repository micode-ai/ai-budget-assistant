import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

/**
 * Shared factory behind quickActionStore and widgetVisibilityStore — both are
 * an MMKV-backed Zustand store holding a `Record<K, boolean>` visibility map
 * and a `K[]` order array, with toggle/setVisible/reorder/resetOrder actions.
 *
 * `insertMissingByPosition` is the one confirmed behavioral difference between
 * the two: widgetVisibilityStore inserts a newly-added key at its intended
 * position (so a new high-priority widget appears at the top for existing
 * users) while quickActionStore appends missing keys to the end. Both stores
 * pass this explicitly so the choice is visible at the call site.
 */
export interface OrderedVisibilityOptions<K extends string> {
  mmkvId: string;
  orderStorageKey: string;
  /** Prefix applied to each key's MMKV visibility entry. Default: ''. */
  visibilityKeyPrefix?: string;
  /** Per-key default when nothing is stored yet. Default: all `true`. */
  defaultVisibility?: Record<K, boolean>;
  /** Where to place a key missing from a persisted order. Default: append. */
  insertMissingByPosition?: boolean;
}

export interface OrderedVisibilityState<K extends string> {
  visibility: Record<K, boolean>;
  order: K[];
  toggle: (key: K) => void;
  setVisible: (key: K, visible: boolean) => void;
  reorder: (newOrder: K[]) => void;
  resetOrder: () => void;
}

export function createOrderedVisibilityStore<K extends string>(
  keys: readonly K[],
  options: OrderedVisibilityOptions<K>,
) {
  const mmkv = new MMKV({ id: options.mmkvId });
  const prefix = options.visibilityKeyPrefix ?? '';
  const defaultVisibility =
    options.defaultVisibility ?? (Object.fromEntries(keys.map((k) => [k, true])) as Record<K, boolean>);
  const insertMissingByPosition = options.insertMissingByPosition ?? false;

  // Pure: resolve visibility from a raw string getter (MMKV or a test fake).
  const resolveVisibility = (read: (key: string) => string | undefined): Record<K, boolean> => {
    const result = {} as Record<K, boolean>;
    for (const key of keys) {
      const val = read(key);
      result[key] = val === undefined ? defaultVisibility[key] : val === 'true';
    }
    return result;
  };

  // Pure: resolve order from the raw stored JSON string (or undefined).
  const resolveOrder = (raw: string | undefined): K[] => {
    if (!raw) return [...keys];
    try {
      const parsed = JSON.parse(raw) as string[];
      // De-dupe: a duplicate key here renders the same item twice (two React
      // elements with the same key -> doubled card + broken modal state).
      // Set preserves first-occurrence order.
      const valid = [...new Set(parsed.filter((k): k is K => (keys as readonly string[]).includes(k)))];
      const missing = keys.filter((k) => !valid.includes(k));
      if (missing.length === 0) return valid;
      if (!insertMissingByPosition) return [...valid, ...missing];
      // Insert each missing key at its intended position (by `keys` order)
      // so a new high-priority item appears at the top for existing users,
      // not appended to the end.
      const result = [...valid];
      for (const key of missing) {
        const targetIdx = keys.indexOf(key);
        const insertAt = result.findIndex((k) => keys.indexOf(k) > targetIdx);
        if (insertAt === -1) result.push(key);
        else result.splice(insertAt, 0, key);
      }
      return result;
    } catch {
      return [...keys];
    }
  };

  const useStore = create<OrderedVisibilityState<K>>((set) => ({
    visibility: resolveVisibility((k) => mmkv.getString(`${prefix}${k}`)),
    order: resolveOrder(mmkv.getString(options.orderStorageKey)),

    toggle: (key) =>
      set((s) => {
        const next = !s.visibility[key];
        mmkv.set(`${prefix}${key}`, String(next));
        return { visibility: { ...s.visibility, [key]: next } };
      }),

    setVisible: (key, visible) =>
      set((s) => {
        mmkv.set(`${prefix}${key}`, String(visible));
        return { visibility: { ...s.visibility, [key]: visible } };
      }),

    reorder: (newOrder) =>
      set(() => {
        // De-dupe so a duplicate can never be persisted (see resolveOrder).
        const valid = [...new Set(newOrder.filter((k): k is K => (keys as readonly string[]).includes(k)))];
        const missing = keys.filter((k) => !valid.includes(k));
        const finalOrder = [...valid, ...missing];
        mmkv.set(options.orderStorageKey, JSON.stringify(finalOrder));
        return { order: finalOrder };
      }),

    resetOrder: () =>
      set(() => {
        const defaultOrder = [...keys];
        mmkv.set(options.orderStorageKey, JSON.stringify(defaultOrder));
        return { order: defaultOrder };
      }),
  }));

  return { useStore, resolveVisibility, resolveOrder };
}
