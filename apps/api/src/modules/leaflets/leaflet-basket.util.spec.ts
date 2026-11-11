import { buildUsualBasket, usualPrice, resolveBasketIndex } from './leaflet-basket.util';

const NOW = new Date('2026-11-11T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const r = (resolvedName: string, d: number) => ({ resolvedName, date: daysAgo(d) });

describe('buildUsualBasket', () => {
  it('basket = names bought >= 2 times in 90 days plus list names, most frequent first', () => {
    const rows = [r('Masło', 1), r('Masło', 5), r('Masło', 9), r('Chleb', 2), r('Mleko', 3), r('Mleko', 100)];
    expect(buildUsualBasket(rows, ['Kawa'], NOW).map((b) => b.name)).toEqual(['Masło', 'Kawa']);
  });
  it('caps at 150 and dedupes list names already in the basket', () => {
    const rows = Array.from({ length: 200 }, (_, i) => [r(`P${i}`, 1), r(`P${i}`, 2)]).flat();
    expect(buildUsualBasket(rows, [], NOW)).toHaveLength(150);
    const b = buildUsualBasket([r('Masło', 1), r('Masło', 2)], ['Masło', 'Kawa'], NOW);
    expect(b.map((x) => x.name)).toEqual(['Masło', 'Kawa']);
  });
});

describe('usualPrice', () => {
  const p = (unitPrice: number, currency: string, d = 5) => ({ resolvedName: 'Masło', date: daysAgo(d), unitPrice, currency });
  it('is the median in the requested currency only', () => {
    const rows = [p(7.49, 'PLN'), p(7.99, 'PLN'), p(6.99, 'PLN'), p(2, 'EUR')];
    expect(usualPrice(rows, 'Masło', 'PLN', NOW)).toBe(7.49);
    expect(usualPrice(rows, 'Masło', 'EUR', NOW)).toBe(2);
    expect(usualPrice(rows, 'Masło', 'USD', NOW)).toBeNull();
  });
  it('ignores rows older than 90 days', () => {
    expect(usualPrice([p(9, 'PLN', 100)], 'Masło', 'PLN', NOW)).toBeNull();
  });
});

describe('resolveBasketIndex', () => {
  const basket = [{ name: 'Masło', count: 3 }, { name: 'Kawa', count: 1 }];
  it('returns the name once; a second use of the same index returns null', () => {
    const used = new Set<number>();
    expect(resolveBasketIndex(0, basket, used)).toBe('Masło');
    expect(resolveBasketIndex(0, basket, used)).toBeNull();
  });
  it('drops non-integer and out-of-range indexes', () => {
    const used = new Set<number>();
    for (const i of [1.5, -1, 2, '1', null, undefined]) expect(resolveBasketIndex(i, basket, used)).toBeNull();
  });
});
