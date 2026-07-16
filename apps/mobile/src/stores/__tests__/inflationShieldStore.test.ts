// MMKV has no jest-native binding — mock it with an in-memory map.
jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string | number>();
  return {
    MMKV: jest.fn().mockImplementation(() => ({
      getString: (k: string) => (store.has(k) ? String(store.get(k)) : undefined),
      getNumber: (k: string) => (typeof store.get(k) === 'number' ? (store.get(k) as number) : undefined),
      set: (k: string, v: string | number) => store.set(k, v),
      delete: (k: string) => store.delete(k),
    })),
  };
});

jest.mock('@/services/api', () => ({
  api: {
    getInflationShield: jest.fn(),
  },
}));

import { useInflationShieldStore } from '../inflationShieldStore';
import { api } from '@/services/api';

const getInflationShield = jest.mocked(api.getInflationShield);

const SHIELD = {
  baseCurrency: 'PLN',
  items: [
    {
      canonicalName: 'Masło',
      monthlyChangePct: 2.5,
      currentPrice: 8.99,
      projectedPrice: 9.21,
      quantity: 2,
      projectedSaving: 0.44,
      store: 'Biedronka',
      currencyOriginal: 'PLN',
      affordableToday: true,
    },
  ],
  savedSoFar: 12,
  hasEnoughData: true,
  fxApproximate: false,
  computedAt: '2026-07-16T00:00:00Z',
  totalProjectedSaving: 5,
  basketMonthlyForecastPct: 3,
};

describe('inflationShieldStore', () => {
  beforeEach(() => {
    getInflationShield.mockReset();
    useInflationShieldStore.setState({ data: null, loading: false, error: false, updatedAt: null });
  });

  it('load() populates data and clears loading on success', async () => {
    getInflationShield.mockResolvedValue(SHIELD);
    await useInflationShieldStore.getState().load();
    const s = useInflationShieldStore.getState();
    expect(s.data?.savedSoFar).toBe(12);
    expect(s.loading).toBe(false);
    expect(s.error).toBe(false);
    expect(typeof s.updatedAt).toBe('number');
  });

  it('load() keeps existing data and sets error on failure (no wipe)', async () => {
    useInflationShieldStore.setState({ data: SHIELD as any, updatedAt: 1 });
    getInflationShield.mockRejectedValue(new Error('offline'));
    await useInflationShieldStore.getState().load();
    const s = useInflationShieldStore.getState();
    expect(s.data?.savedSoFar).toBe(12); // stale data preserved
    expect(s.error).toBe(true);
    expect(s.loading).toBe(false);
  });
});
