import { PROPOSED_PREFIX, proposedKey } from '../proposedCategory';
import { proposedNamesForSave, resolveProposedCategories } from '../resolveProposedCategories';

const REAL_GROCERIES = '4c6595d1-a2a5-4c7a-8573-6931474f4194';

/**
 * A Biedronka basket: fifteen grocery lines plus a 4.50 deposit block. The
 * deposit is the only group with no receipt line behind it, so its
 * `itemIndexes` is empty and `seedItemCategories` never writes it into the
 * line→category map.
 */
const receiptWithDeposit = () => ({
  itemCategories: { 0: REAL_GROCERIES, 1: REAL_GROCERIES } as Record<number, string>,
  splits: [
    { categoryId: REAL_GROCERIES, categoryName: 'Groceries', itemIndexes: [0, 1] },
    { categoryId: proposedKey('Kaucja'), categoryName: 'Kaucja', itemIndexes: [] as number[] },
  ],
});

describe('proposedNamesForSave', () => {
  it('includes a proposal that exists only in the splits (the deposit)', () => {
    const { itemCategories, splits } = receiptWithDeposit();
    expect(proposedNamesForSave(itemCategories, splits)).toEqual(['Kaucja']);
  });

  it('includes proposals attached to lines', () => {
    const names = proposedNamesForSave(
      { 0: proposedKey('Chemia'), 1: REAL_GROCERIES },
      [{ categoryId: REAL_GROCERIES }],
    );
    expect(names).toEqual(['Chemia']);
  });

  it('deduplicates a proposal that is on both a line and its split', () => {
    const key = proposedKey('Chemia');
    expect(proposedNamesForSave({ 0: key, 1: key }, [{ categoryId: key }])).toEqual(['Chemia']);
  });

  it('returns nothing when every category already exists', () => {
    expect(proposedNamesForSave({ 0: REAL_GROCERIES }, [{ categoryId: REAL_GROCERIES }])).toEqual([]);
  });

  it('ignores unassigned lines', () => {
    expect(proposedNamesForSave({ 0: null, 1: undefined }, [])).toEqual([]);
  });
});

describe('the splits payload handed to addExpense', () => {
  // The regression this whole module exists for. Built from the lines alone,
  // the deposit's name was never created and `new:Kaucja` was sent to the API,
  // where the server auto-created a category literally called "new:Kaucja".
  it('carries no `new:` sentinel when the receipt has a deposit', async () => {
    const { itemCategories, splits } = receiptWithDeposit();

    const created: string[] = [];
    const resolveKey = await resolveProposedCategories(
      proposedNamesForSave(itemCategories, splits),
      async (name) => {
        created.push(name);
        return { id: `created-${name}` };
      },
    );

    expect(created).toEqual(['Kaucja']);

    const payload = splits.map((s) => ({ categoryId: resolveKey(s.categoryId) as string }));
    expect(payload).toEqual([{ categoryId: REAL_GROCERIES }, { categoryId: 'created-Kaucja' }]);
    for (const entry of payload) {
      expect(entry.categoryId.startsWith(PROPOSED_PREFIX)).toBe(false);
    }
  });

  it('resolves the deposit on the receipt-line map too, so items agree with splits', async () => {
    const { itemCategories, splits } = receiptWithDeposit();
    const resolveKey = await resolveProposedCategories(
      proposedNamesForSave(itemCategories, splits),
      async (name) => ({ id: `created-${name}` }),
    );

    expect(resolveKey(itemCategories[0])).toBe(REAL_GROCERIES);
    expect(resolveKey(proposedKey('Kaucja'))).toBe('created-Kaucja');
  });

  it('leaves a real category id untouched and maps an unassigned line to undefined', async () => {
    const resolveKey = await resolveProposedCategories([], async () => ({ id: 'unused' }));
    expect(resolveKey(REAL_GROCERIES)).toBe(REAL_GROCERIES);
    expect(resolveKey(null)).toBeUndefined();
    expect(resolveKey(undefined)).toBeUndefined();
  });

  it('creates nothing when there are no proposals', async () => {
    const create = jest.fn();
    await resolveProposedCategories([], create);
    expect(create).not.toHaveBeenCalled();
  });
});
