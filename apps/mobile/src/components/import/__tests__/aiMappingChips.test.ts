import { describeMapping } from '../AiMappingChips';

// Manual factory (not bare automock): `AiMappingChips` imports `@/theme`, whose
// `ThemeContext` imports `@/stores/authStore` — which transitively pulls in
// `@/stores/exchangeRateStore` (a stray module-scope `setTimeout(() =>
// import('./authStore'))` that crashes the process on exit under this Jest
// config, same root cause documented in `receipt/__tests__/priceFindings.test.ts`
// and `analytics/__tests__/pickFoundTotal.test.ts`). This test only exercises
// the pure `describeMapping` helper and never renders the component, so the
// real theme is never needed. Relative path, matching the convention in those
// two existing tests (not the `@/...` alias, which babel rewrites before Jest
// would see it).
jest.mock('../../../theme', () => ({
  useTheme: jest.fn(),
  useStyles: jest.fn(),
}));

describe('describeMapping', () => {
  it('lists a single-amount mapping in a stable order', () => {
    expect(
      describeMapping({ date: 'Data', amount: 'Kwota', description: 'Opis' }),
    ).toEqual([
      { role: 'date', column: 'Data' },
      { role: 'amount', column: 'Kwota' },
      { role: 'description', column: 'Opis' },
    ]);
  });

  it('splits a debit/credit mapping into two entries', () => {
    const out = describeMapping({
      date: 'Data',
      amount: { debit: 'Winien', credit: 'Ma' },
      description: 'Opis',
    });
    expect(out).toContainEqual({ role: 'debit', column: 'Winien' });
    expect(out).toContainEqual({ role: 'credit', column: 'Ma' });
    expect(out.some((e) => e.role === 'amount')).toBe(false);
  });

  it('includes the optional columns only when present', () => {
    const withOptional = describeMapping({
      date: 'Data', amount: 'Kwota', description: 'Opis',
      currency: 'Waluta', counterparty: 'Kontrahent',
    });
    expect(withOptional).toContainEqual({ role: 'currency', column: 'Waluta' });
    expect(withOptional).toContainEqual({ role: 'counterparty', column: 'Kontrahent' });

    const without = describeMapping({ date: 'Data', amount: 'Kwota', description: 'Opis' });
    expect(without.some((e) => e.role === 'currency')).toBe(false);
    expect(without.some((e) => e.role === 'counterparty')).toBe(false);
  });
});
