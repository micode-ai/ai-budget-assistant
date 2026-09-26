import { reconcileReceiptCategory } from './receipt-overall-category.util';

const split = (categoryId: string | null, categoryName: string, amount: number) => ({
  categoryId,
  categoryName,
  amount,
  percentage: 0,
  itemIndexes: [],
});

describe('reconcileReceiptCategory', () => {
  it('keeps a learned merchant rule no matter what the split says', () => {
    const r = reconcileReceiptCategory({
      ruleCategoryId: 'c-rule',
      model: { categoryId: 'c-build', name: 'Zakupy budowlane' },
      groups: [split(null, 'Zakupy spożywcze', 30), split('c-build', 'Zakupy budowlane', 5)],
    });
    expect(r.categoryId).toBe('c-rule');
  });

  it('drops the model pick when most of the receipt went to a proposed category', () => {
    // The Biedronka receipt on a renovation account: food lines proposed as a
    // new groceries category, the model still said "Zakupy budowlane".
    const r = reconcileReceiptCategory({
      ruleCategoryId: null,
      model: { categoryId: 'c-build', name: 'Zakupy budowlane' },
      groups: [split(null, 'Zakupy spożywcze', 30.5), split('c-hyg', 'Higiena osobista', 10.35)],
    });
    expect(r).toEqual({ categoryId: null, categorySuggestion: 'Zakupy spożywcze' });
  });

  it('replaces a model pick the split does not contain with the largest existing group', () => {
    const r = reconcileReceiptCategory({
      ruleCategoryId: null,
      model: { categoryId: 'c-build', name: 'Zakupy budowlane' },
      groups: [split('c-food', 'Zakupy spożywcze', 30), split('c-hyg', 'Higiena osobista', 10)],
    });
    expect(r).toEqual({ categoryId: 'c-food', categorySuggestion: 'Zakupy spożywcze' });
  });

  it('keeps the model pick when the split agrees with it', () => {
    const r = reconcileReceiptCategory({
      ruleCategoryId: null,
      model: { categoryId: 'c-food', name: 'Zakupy spożywcze' },
      groups: [split('c-food', 'Zakupy spożywcze', 30), split('c-hyg', 'Higiena osobista', 10)],
    });
    expect(r).toEqual({ categoryId: 'c-food', categorySuggestion: 'Zakupy spożywcze' });
  });

  it('keeps the model pick when there is no split to check it against', () => {
    const r = reconcileReceiptCategory({
      ruleCategoryId: null,
      model: { categoryId: 'c-fuel', name: 'Transport' },
      groups: [],
    });
    expect(r).toEqual({ categoryId: 'c-fuel', categorySuggestion: 'Transport' });
  });

  it('keeps an empty model answer empty', () => {
    const r = reconcileReceiptCategory({ ruleCategoryId: null, model: { categoryId: null, name: null }, groups: [] });
    expect(r).toEqual({ categoryId: null, categorySuggestion: null });
  });
});
