import type { Category } from '@budget/shared-types';
import { isDepositCategoryName } from '@budget/shared-utils';
import { eligibleParents, hasLiveChildren } from '../parentCandidates';

const cat = (id: string, extra: Partial<Category> = {}): Category =>
  ({ id, name: id, type: 'expense', isDeleted: false, ...extra }) as Category;

describe('eligibleParents', () => {
  const all = [
    cat('Food'),
    cat('Pizza', { parentId: 'Food' }),
    cat('Pfand'),
    cat('Old', { isDeleted: true }),
    cat('Salary', { type: 'income' }),
    cat('Self'),
  ];

  it('offers live top-level expense categories, not itself, not deposit', () => {
    expect(eligibleParents(all, { id: 'Self', name: 'Self' }, 'expense').map((c) => c.id)).toEqual(['Food']);
  });

  it('is empty for a category that already has children', () => {
    expect(eligibleParents(all, { id: 'Food', name: 'Food' }, 'expense')).toEqual([]);
    expect(hasLiveChildren(all, 'Food')).toBe(true);
  });

  it('ignores deleted children', () => {
    const list = [cat('A'), cat('B', { parentId: 'A', isDeleted: true }), cat('C')];
    expect(eligibleParents(list, { id: 'A', name: 'A' }, 'expense').map((c) => c.id)).toEqual(['C']);
  });

  it('eligibleParents returns income parents for an income category', () => {
    const list = [...all, cat('Bonus', { type: 'income', parentId: 'Salary' }), cat('Rent', { type: 'income' })];
    expect(eligibleParents(list, { id: 'Rent', name: 'Rent' }, 'income').map((c) => c.id)).toEqual(['Salary']);
    expect(eligibleParents(list, null, 'income').map((c) => c.id)).toEqual(['Salary', 'Rent']);
  });

  it('is empty for a deposit category being edited', () => {
    expect(eligibleParents(all, { id: 'Pfand', name: 'Pfand' }, 'expense')).toEqual([]);
  });

  it('recognises the deposit name in any language', () => {
    expect(isDepositCategoryName(' kaucja ')).toBe(true);
    expect(isDepositCategoryName('Food')).toBe(false);
  });
});
