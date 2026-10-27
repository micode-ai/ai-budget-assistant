import type { Category } from '@budget/shared-types';
import {
  GAP_HALF,
  dropPayload,
  dropTargetAt,
  refusalAt,
  refuseParentDrop,
  type RowLayout,
} from '../categoryDrop';

const cat = (id: string, extra: Partial<Category> = {}): Category =>
  ({ id, name: id, type: 'expense', isDeleted: false, ...extra }) as Category;

describe('refuseParentDrop', () => {
  const food = cat('Food');
  const pizza = cat('Pizza', { parentId: 'Food' });
  const travel = cat('Travel');
  const all = [food, pizza, travel, cat('Pfand'), cat('Salary', { type: 'income' })];

  it('refuses a dragged category that has children', () => {
    expect(refuseParentDrop(all, food, travel)).toBe('hasChildren');
  });
  it('refuses a target that is not top-level', () => {
    expect(refuseParentDrop(all, travel, pizza)).toBe('targetNotTopLevel');
  });
  it('refuses self', () => {
    expect(refuseParentDrop(all, travel, travel)).toBe('self');
  });
  it('refuses a type mismatch', () => {
    expect(refuseParentDrop(all, travel, cat('Salary', { type: 'income' }))).toBe('typeMismatch');
  });
  it('refuses the deposit category on either side', () => {
    const pfand = cat('Pfand');
    expect(refuseParentDrop(all, pfand, travel)).toBe('deposit');
    expect(refuseParentDrop(all, travel, pfand)).toBe('deposit');
  });
  it('refuses dropping onto the current parent', () => {
    expect(refuseParentDrop(all, pizza, food)).toBe('alreadyThere');
  });
  it('allows a valid pair', () => {
    expect(refuseParentDrop(all, travel, food)).toBeNull();
    expect(refuseParentDrop(all, pizza, travel)).toBeNull();
  });
});

describe('dropTargetAt', () => {
  const food = cat('Food');
  const pizza = cat('Pizza', { parentId: 'Food' });
  const travel = cat('Travel');
  const salary = cat('Salary', { type: 'income' });
  const all = [food, pizza, travel, salary];
  const rows: RowLayout[] = [
    { categoryId: 'Food', depth: 0, top: 0, height: 50 },
    { categoryId: 'Pizza', depth: 1, top: 50, height: 50 },
    { categoryId: 'Travel', depth: 0, top: 100, height: 50 },
  ];

  it('top-level row is a parent target', () => {
    expect(dropTargetAt(125, rows, pizza, all)).toEqual({ kind: 'parent', categoryId: 'Travel' });
  });
  it('child rows are never a target', () => {
    expect(dropTargetAt(75, rows, travel, all)).toBeNull();
  });
  it('gap returns topLevel for a subcategory', () => {
    expect(dropTargetAt(100 + GAP_HALF - 1, rows, pizza, all)).toEqual({ kind: 'topLevel' });
    expect(dropTargetAt(150 + GAP_HALF, rows, pizza, all)).toEqual({ kind: 'topLevel' });
  });
  it('a top-level drag over its own row edge returns null (self, and no gap target)', () => {
    expect(dropTargetAt(100, rows, travel, all)).toBeNull();
  });
  it('gap bands are ignored for a top-level drag', () => {
    // Inside a top-level row but within a gap band: a top-level drag still hits the row.
    expect(dropTargetAt(100 + GAP_HALF - 1, rows, cat('Other'), [...all, cat('Other')])).toEqual({
      kind: 'parent',
      categoryId: 'Travel',
    });
    expect(dropTargetAt(GAP_HALF - 1, rows, travel, all)).toEqual({
      kind: 'parent',
      categoryId: 'Food',
    });
  });
  it('outside any zone returns null', () => {
    expect(dropTargetAt(400, rows, pizza, all)).toBeNull();
    expect(dropTargetAt(-50, rows, pizza, all)).toBeNull();
  });
  it('type mismatch is refused', () => {
    expect(dropTargetAt(125, rows, salary, all)).toBeNull();
  });
  it('a row of the other type is not a target', () => {
    const mixed: RowLayout[] = [{ categoryId: 'Salary', depth: 0, top: 0, height: 50 }];
    expect(dropTargetAt(25, mixed, travel, all)).toBeNull();
  });
});

describe('refusalAt', () => {
  const food = cat('Food');
  const pizza = cat('Pizza', { parentId: 'Food' });
  const travel = cat('Travel');
  const pfand = cat('Pfand');
  const all = [food, pizza, travel, pfand];
  const rows: RowLayout[] = [
    { categoryId: 'Food', depth: 0, top: 0, height: 50 },
    { categoryId: 'Pizza', depth: 1, top: 50, height: 50 },
    { categoryId: 'Travel', depth: 0, top: 100, height: 50 },
    { categoryId: 'Pfand', depth: 0, top: 150, height: 50 },
  ];

  it('names why a hovered row refuses the drop', () => {
    expect(refusalAt(125, rows, food, all)).toBe('hasChildren');
    expect(refusalAt(75, rows, travel, all)).toBe('targetNotTopLevel');
    expect(refusalAt(175, rows, travel, all)).toBe('deposit');
  });
  it('is null over a valid target, a gap line or empty space', () => {
    expect(refusalAt(125, rows, pizza, all)).toBeNull();
    expect(refusalAt(100, rows, pizza, all)).toBeNull();
    expect(refusalAt(400, rows, travel, all)).toBeNull();
  });
  it('stays silent for self and the current parent', () => {
    expect(refusalAt(125, rows, travel, all)).toBeNull();
    expect(refusalAt(25, rows, pizza, all)).toBeNull();
  });
});

describe('dropPayload', () => {
  it('carries only the parent change', () => {
    expect(dropPayload({ kind: 'parent', categoryId: 'Food' })).toEqual({ parentId: 'Food' });
    expect(dropPayload({ kind: 'topLevel' })).toEqual({ parentId: null });
  });
  it('has no name, colour or icon keys at all', () => {
    const payload = dropPayload({ kind: 'parent', categoryId: 'Food' });
    expect(Object.keys(payload)).toEqual(['parentId']);
  });
});
