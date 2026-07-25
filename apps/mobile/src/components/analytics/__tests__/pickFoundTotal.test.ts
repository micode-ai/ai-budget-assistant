import { pickFoundTotal } from '../InflationIndexSection';

// Manual factories (not bare automocks): `InflationIndexSection` imports `@/theme`
// (whose `ThemeContext` pulls in `@/stores/authStore`) and also imports
// `@/stores/accountStore` and `@/stores/authStore` directly — all of which
// transitively reach the db repositories -> expo-sqlite's native
// `openDatabaseSync`, called at module load time and unavailable outside a
// real app runtime (same root cause documented in accountStore.test.ts and
// receipt/__tests__/priceFindings.test.ts). This test only exercises the pure
// `pickFoundTotal` helper and never renders the component, so none of the
// real stores/theme are needed. Mocks use relative paths, matching the
// convention in those two existing tests (not the `@/...` alias).
jest.mock('../../../theme', () => ({
  useTheme: jest.fn(),
  useStyles: jest.fn(),
}));

jest.mock('../../../stores/accountStore', () => ({
  useAccountStore: Object.assign(jest.fn(), { getState: () => ({ canEdit: () => true }) }),
}));

jest.mock('../../../stores/authStore', () => ({
  useAuthStore: Object.assign(jest.fn(), { getState: () => ({ user: null }) }),
}));

jest.mock('../../../stores/alertStore', () => ({
  useAlertStore: Object.assign(jest.fn(), { getState: () => ({ priceCheckSummary: null }) }),
}));

jest.mock('../../../stores/priceHistoryStore', () => ({
  usePriceHistoryStore: Object.assign(jest.fn(), { getState: () => ({}) }),
}));

jest.mock('../../interactive-charts', () => ({
  InteractiveLineChart: () => null,
}));

jest.mock('../../KeyboardAvoidingScreen', () => ({
  KeyboardAvoidingScreen: ({ children }: any) => children,
}));

describe('pickFoundTotal', () => {
  it('returns null for an empty map', () => {
    expect(pickFoundTotal({}, 'USD')).toBeNull();
  });

  it('returns null when every total is zero', () => {
    expect(pickFoundTotal({ PLN: 0, EUR: 0 }, 'USD')).toBeNull();
  });

  it('prefers the base currency when it found anything', () => {
    expect(pickFoundTotal({ PLN: 5, USD: 2 }, 'USD')).toEqual({ amount: 2, currency: 'USD' });
  });

  it('falls back to the largest total when the base currency has nothing', () => {
    expect(pickFoundTotal({ PLN: 5, EUR: 12, GBP: 3 }, 'USD')).toEqual({ amount: 12, currency: 'EUR' });
  });

  it('never sums across currencies — the result is always a single entry', () => {
    const result = pickFoundTotal({ PLN: 5, EUR: 12 }, 'USD');
    expect(result?.amount).not.toBe(17);
  });

  it('ignores a zero total for the base currency and falls back to the largest', () => {
    expect(pickFoundTotal({ USD: 0, EUR: 9 }, 'USD')).toEqual({ amount: 9, currency: 'EUR' });
  });
});
