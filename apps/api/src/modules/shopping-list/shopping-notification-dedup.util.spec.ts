import { restockDedupKey, dealDedupKey, weekBucket } from './shopping-notification-dedup.util';

describe('shopping-notification-dedup.util', () => {
  it('builds a restock key bound to the last-purchase date', () => {
    expect(restockDedupKey('Bread', '2026-07-13')).toBe('restock:Bread:2026-07-13');
  });

  it('builds a deal key bound to product, merchant and week', () => {
    expect(dealDedupKey('Milk', 'Lidl', '2026-07-13')).toBe('deal:Milk:Lidl:2026-07-13');
  });

  it('weekBucket returns the Monday (UTC) of the given date', () => {
    expect(weekBucket(new Date('2026-07-13T00:00:00Z'))).toBe('2026-07-13'); // Monday
    expect(weekBucket(new Date('2026-07-17T09:30:00Z'))).toBe('2026-07-13'); // Friday
    expect(weekBucket(new Date('2026-07-19T23:00:00Z'))).toBe('2026-07-13'); // Sunday
    expect(weekBucket(new Date('2026-07-20T00:00:00Z'))).toBe('2026-07-20'); // next Monday
  });
});
