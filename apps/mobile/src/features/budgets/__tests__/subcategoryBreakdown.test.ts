import { buildSubcategoryRows } from '../subcategoryBreakdown';

describe('buildSubcategoryRows', () => {
  it('is empty without children', () => {
    expect(buildSubcategoryRows({})).toEqual([]);
    expect(buildSubcategoryRows({ subcategories: [], ownSpent: 50 })).toEqual([]);
  });

  it('lists children then the without-subcategory row', () => {
    const rows = buildSubcategoryRows({
      ownSpent: 20,
      subcategories: [
        { categoryId: 'a', categoryName: 'Bread', spent: 30 },
        { categoryId: 'b', categoryName: 'Cheese', categoryColor: '#fff', spent: 10 },
      ],
    });
    expect(rows.map((r) => [r.name, r.spent])).toEqual([
      ['Bread', 30],
      ['Cheese', 10],
      [null, 20],
    ]);
  });

  it('omits the own row when ownSpent is 0 or absent', () => {
    const subs = [{ categoryId: 'a', categoryName: 'Bread', spent: 30 }];
    expect(buildSubcategoryRows({ subcategories: subs, ownSpent: 0 })).toHaveLength(1);
    expect(buildSubcategoryRows({ subcategories: subs })).toHaveLength(1);
  });
});
