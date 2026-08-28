import { mapServerSplits } from '../serverSplits';

/**
 * The web build has no SQLite — `executeSql` resolves to `[]` — so every code
 * path that reads a receipt's category breakdown out of the local table finds
 * nothing there. The server sends the splits with the expense; this maps them
 * so the client can fall back to them, which is the rule `db/client.web.ts`
 * states for exactly this situation.
 */
describe('mapServerSplits', () => {
  const row = {
    id: 's1',
    categoryId: 'c-food',
    // Prisma Decimal columns arrive over the wire as strings.
    amount: '179.14',
    percentage: '76.57',
    notes: null,
    createdAt: '2026-08-28T16:30:30.000Z',
    updatedAt: '2026-08-28T16:30:30.000Z',
    category: { id: 'c-food', name: 'Groceries' },
  };

  it('turns the wire shape into splits the app can render', () => {
    const [split] = mapServerSplits([row], 'e1')!;

    expect(split.expenseId).toBe('e1');
    expect(split.categoryId).toBe('c-food');
    expect(split.amount).toBe(179.14);
    expect(split.percentage).toBe(76.57);
    expect(split.isDeleted).toBe(false);
  });

  it('parses Decimal strings into numbers rather than leaving them as text', () => {
    const [split] = mapServerSplits([row], 'e1')!;

    expect(typeof split.amount).toBe('number');
    expect(typeof split.percentage).toBe('number');
  });

  it('keeps the category so a name can be shown without a second lookup', () => {
    expect(mapServerSplits([row], 'e1')![0].category?.name).toBe('Groceries');
  });

  it('uses the local expense id, not the server one, because that is how the app addresses rows', () => {
    expect(mapServerSplits([row], 'local-42')![0].expenseId).toBe('local-42');
  });

  it('returns undefined when there is nothing to fall back to', () => {
    // undefined, not [] — the caller distinguishes "the server sent none" from
    // "the server sent some", and an empty array would look like the latter.
    expect(mapServerSplits(undefined, 'e1')).toBeUndefined();
    expect(mapServerSplits([], 'e1')).toBeUndefined();
    expect(mapServerSplits(null, 'e1')).toBeUndefined();
  });

  it('survives a row missing its optional fields', () => {
    const bare = { id: 's2', categoryId: 'c-x', amount: 1, percentage: 100 };

    const [split] = mapServerSplits([bare], 'e1')!;

    expect(split.amount).toBe(1);
    expect(split.notes).toBeUndefined();
    expect(split.createdAt instanceof Date).toBe(true);
  });
});
