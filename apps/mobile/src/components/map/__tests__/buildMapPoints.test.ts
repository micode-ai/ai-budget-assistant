import { buildExpenseMapPoints } from '../buildMapPoints';

const base = {
  localId: 'x', userId: 'u', accountId: 'a', currencyCode: 'PLN' as const,
  date: new Date('2026-07-01'), source: 'manual' as const,
  isRecurring: false, isDebt: false, isDebtRepayment: false, isDeleted: false,
  syncStatus: 'synced' as const, syncVersion: 1,
  createdAt: new Date(), updatedAt: new Date(),
};

describe('buildExpenseMapPoints', () => {
  it('maps located expenses to points and counts the rest as missing', () => {
    const { points, missingCount } = buildExpenseMapPoints([
      { ...base, id: '1', amount: 45.8, merchant: 'Biedronka', location: { lat: 52.2, lng: 21.0 } } as any,
      { ...base, id: '2', amount: 12, description: 'Kawa' } as any,
    ]);
    expect(missingCount).toBe(1);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ id: '1', lat: 52.2, lng: 21.0, title: 'Biedronka' });
    expect(points[0].amountLabel).toContain('45');
  });

  it('falls back to description for title when merchant is empty', () => {
    const { points } = buildExpenseMapPoints([
      { ...base, id: '1', amount: 5, description: 'Parking', location: { lat: 50, lng: 19 } } as any,
    ]);
    expect(points[0].title).toBe('Parking');
  });

  it('treats (0,0) as missing — zeroed plaintext of an undecryptable E2EE row, not a real store', () => {
    const { points, missingCount } = buildExpenseMapPoints([
      { ...base, id: '1', amount: 5, location: { lat: 0, lng: 0 } } as any,
    ]);
    expect(points).toHaveLength(0);
    expect(missingCount).toBe(1);
  });
});
