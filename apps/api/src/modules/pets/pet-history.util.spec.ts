import { computePetHistory, PetCostInput } from './pet-history.util';

const c = (date: string, kind: string, amountBase: number | null): PetCostInput => ({
  expenseId: `e-${date}-${kind}`,
  clientId: null,
  date: new Date(`${date}T00:00:00Z`),
  amount: amountBase ?? 1,
  currencyCode: 'PLN',
  amountBase,
  merchant: null,
  description: null,
  kind,
});
const NOW = new Date('2026-11-18T10:00:00Z');

describe('computePetHistory', () => {
  it('lists every calendar month, empty ones included, and splits by kind', () => {
    const h = computePetHistory([c('2026-11-02', 'vet', 300), c('2026-09-10', 'food', 100), c('2026-09-20', 'food', 50)], 3, NOW);
    expect(h.monthly.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(h.total).toBe(450);
    expect(h.perMonth).toBe(150);
    expect(h.byKind.food).toBe(150);
    expect(h.byKind.vet).toBe(300);
    expect(h.monthly[1].total).toBe(0);
  });

  it('drops costs before the window but keeps them for all time', () => {
    const costs = [c('2026-01-05', 'vet', 200), c('2026-11-01', 'food', 40)];
    expect(computePetHistory(costs, 3, NOW).total).toBe(40);
    const all = computePetHistory(costs, 0, NOW);
    expect(all.total).toBe(240);
    expect(all.from).toBe('2026-01-01');
  });

  it('lists but never totals an amount with no known rate', () => {
    const h = computePetHistory([c('2026-11-01', 'vet', null), c('2026-11-02', 'food', 10)], 3, NOW);
    expect(h.total).toBe(10);
    expect(h.items).toHaveLength(2);
  });

  it('handles nothing recorded for all time', () => {
    const h = computePetHistory([], 0, NOW);
    expect(h.from).toBeNull();
    expect(h.monthly).toEqual([]);
    expect(h.perMonth).toBe(0);
  });
});
