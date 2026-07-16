import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import type { InflationShieldResponse } from '@budget/shared-types';
import { api } from '@/services/api';

const storage = new MMKV({ id: 'inflation-shield' });
const DATA_KEY = 'shield_data';
const UPDATED_AT_KEY = 'shield_updated_at';

function loadCached(): InflationShieldResponse | null {
  try {
    const raw = storage.getString(DATA_KEY);
    return raw ? (JSON.parse(raw) as InflationShieldResponse) : null;
  } catch {
    return null;
  }
}

interface InflationShieldState {
  data: InflationShieldResponse | null;
  loading: boolean;
  error: boolean;
  updatedAt: number | null;
  load: () => Promise<void>;
}

export const useInflationShieldStore = create<InflationShieldState>()((set) => ({
  data: loadCached(),
  loading: false,
  error: false,
  updatedAt: storage.getNumber(UPDATED_AT_KEY) ?? null,

  load: async () => {
    set({ loading: true, error: false });
    try {
      const data = await api.getInflationShield();
      const updatedAt = Date.now();
      storage.set(DATA_KEY, JSON.stringify(data));
      storage.set(UPDATED_AT_KEY, updatedAt);
      set({ data, loading: false, updatedAt });
    } catch (e) {
      // Keep any cached data; only flag the error.
      console.warn('[inflationShieldStore] load failed', e);
      set({ loading: false, error: true });
    }
  },
}));
