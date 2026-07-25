import { summarizeFindings, formatQuantitySuffix } from '../PriceFindingsCard';

// Manual factory (not bare automock): `PriceFindingsCard` imports `@/theme`,
// whose `ThemeContext` imports `@/stores/authStore` — which transitively pulls
// in `@/stores/accountStore` -> the db repositories -> `expo-sqlite`'s native
// `openDatabaseSync`, called at module load time and unavailable outside a
// real app runtime (same root cause documented in accountStore.test.ts). This
// test only exercises the pure `summarizeFindings` helper and never renders
// the component, so the real auth store is never needed.
jest.mock('../../../stores/authStore', () => ({
  useAuthStore: Object.assign(jest.fn(), { getState: () => ({ user: null }) }),
}));

const f = (overpaidAmount: number, currencyCode = 'PLN') =>
  ({ overpaidAmount, currencyCode } as any);

describe('summarizeFindings', () => {
  it('returns null for an empty list', () => {
    expect(summarizeFindings([])).toBeNull();
  });

  it('sums the amounts and takes the currency from the findings', () => {
    expect(summarizeFindings([f(4), f(2.5)])).toEqual({ count: 2, total: 6.5, currencyCode: 'PLN' });
  });

  it('rounds the total to two decimals', () => {
    expect(summarizeFindings([f(0.1), f(0.2)])?.total).toBe(0.3);
  });

  it('never blends currencies — keeps only those matching the first finding', () => {
    expect(summarizeFindings([f(4, 'PLN'), f(3, 'EUR')])).toEqual({
      count: 1,
      total: 4,
      currencyCode: 'PLN',
    });
  });
});

describe('formatQuantitySuffix', () => {
  it('renders nothing for quantity 1 — no multiplication to show', () => {
    expect(formatQuantitySuffix(1)).toBe('');
  });

  it('shows a whole-unit quantity as ×N', () => {
    expect(formatQuantitySuffix(3)).toBe(' ×3');
  });

  it('shows a weighed quantity to 3 decimals', () => {
    expect(formatQuantitySuffix(0.437)).toBe(' ×0.437');
  });

  it('scrubs float noise from a grouped quantity instead of leaking it', () => {
    expect(formatQuantitySuffix(2.0000000000000004)).toBe(' ×2');
  });

  it('treats a quantity that rounds to 1 as no suffix, not ×1', () => {
    expect(formatQuantitySuffix(0.9999999999)).toBe('');
  });

  it('renders nothing for a non-finite quantity', () => {
    expect(formatQuantitySuffix(NaN)).toBe('');
  });
});
