import { normalizeLeafletPage, LEAFLET_PAGE_FORMAT } from './leaflet-page.util';

const NOW = new Date('2026-11-11T12:00:00Z');
const item = (o: Record<string, unknown> = {}) => ({
  name: 'Masło Łaciate 200g', canonicalName: 'Masło Łaciate 200g', promoPrice: 4.99, regularPrice: 7.49,
  currencyCode: 'PLN', condition: null, validFrom: null, validTo: null, basketIndex: null, ...o,
});
const page = (items: unknown[], extra: Record<string, unknown> = {}) =>
  normalizeLeafletPage({ chain: 'Biedronka', validFrom: null, validTo: null, items, ...extra }, 5, NOW);

describe('normalizeLeafletPage', () => {
  it('drops items with missing/absurd promo price and a regular price not above promo', () => {
    const r = page([item({ promoPrice: 0 }), item({ promoPrice: null }), item({ promoPrice: 2_000_000 }),
      item({ promoPrice: 4.99, regularPrice: 4.99 })]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].regularPrice).toBeNull();
    expect(r.readable).toBe(true);
  });
  it('marks a page with zero valid items as unreadable', () => {
    expect(normalizeLeafletPage({ items: [] }, 5, NOW).readable).toBe(false);
    expect(normalizeLeafletPage(null, 5, NOW).readable).toBe(false);
  });
  it('nulls basketIndex that is non-integer, negative or >= basketSize', () => {
    const r = page([item({ basketIndex: 2.5 }), item({ basketIndex: -1 }), item({ basketIndex: 5 }), item({ basketIndex: 4 })]);
    expect(r.items.map((i) => i.basketIndex)).toEqual([null, null, null, 4]);
  });
  it('parses dates "16.11" and "16.11.2026" relative to now and nulls validTo < validFrom', () => {
    const a = page([item({ validFrom: '16.11', validTo: '22.11.2026' })]);
    expect(a.items[0].validFrom).toBe('2026-11-16');
    expect(a.items[0].validTo).toBe('2026-11-22');
    const b = page([], { validFrom: '20.11', validTo: '16.11' });
    expect(b.validFrom).toBe('2026-11-20');
    expect(b.validTo).toBeNull();
    expect(page([], { validFrom: '05.01' }).validFrom).toBe('2027-01-05');
  });
  it('a DD.MM more than 300 days in the future belongs to last year (a December leaflet read in January)', () => {
    const jan = new Date('2027-01-05T10:00:00.000Z');
    const p = normalizeLeafletPage(
      { chain: 'Biedronka', validFrom: '28.12', validTo: '03.01', items: [item()] },
      5,
      jan,
    );
    expect(p.validFrom).toBe('2026-12-28');
    expect(p.validTo).toBe('2027-01-03');
  });

  it('upper-cases and validates currency', () => {
    const r = page([item({ currencyCode: 'pln' }), item({ currencyCode: 'zł' })]);
    expect(r.items.map((i) => i.currencyCode)).toEqual(['PLN']); // an unreadable currency drops the item
  });
  it('caps name at 120 and condition at 60 chars', () => {
    const r = page([item({ name: 'a'.repeat(200), condition: 'b'.repeat(100) })]);
    expect(r.items[0].name).toHaveLength(120);
    expect(r.items[0].condition).toHaveLength(60);
  });
  it('exposes a strict json schema', () => {
    expect(LEAFLET_PAGE_FORMAT.json_schema.strict).toBe(true);
  });
});
