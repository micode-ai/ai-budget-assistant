/**
 * remapCategoryId re-points every reference to a category, including the
 * children's parent_id: otherwise a child created under a locally-id'd parent
 * is orphaned locally until the next full pull.
 */
const mockExec = jest.fn().mockResolvedValue(undefined);
jest.mock('../client', () => ({ executeSql: (...a: unknown[]) => mockExec(...a) }));

import { remapCategoryId, mergeCategoryInto, getKeyConvergenceCandidates } from '../categoryRepository';

describe('remapCategoryId', () => {
  it('re-points children parent_id at the new id', async () => {
    await remapCategoryId('old-1', 'new-1', 'old-1');
    expect(mockExec).toHaveBeenCalledWith(
      'UPDATE categories SET parent_id = ? WHERE parent_id = ?',
      ['new-1', 'old-1'],
    );
  });
});

describe('mergeCategoryInto', () => {
  beforeEach(() => mockExec.mockClear());

  it('soft-deletes a merged seed, so its id stays the tombstone loadCategories checks', async () => {
    await mergeCategoryInto('default-exp-groceries', 'srv-1');
    const sql = mockExec.mock.calls.map((c) => c[0] as string);
    expect(sql).toContain('UPDATE categories SET is_deleted = 1, updated_at = ? WHERE id = ?');
    expect(sql).not.toContain('DELETE FROM categories WHERE id = ?');
  });

  it('still hard-deletes any other stale row', async () => {
    await mergeCategoryInto('dev-uuid-1', 'srv-1');
    expect(mockExec).toHaveBeenCalledWith('DELETE FROM categories WHERE id = ?', ['dev-uuid-1']);
  });
});

describe('getKeyConvergenceCandidates', () => {
  it('also returns keyless default-* seeds, so the first pull after an upgrade can converge', async () => {
    mockExec.mockClear();
    mockExec.mockResolvedValueOnce([]);
    await getKeyConvergenceCandidates('acc-1', 'groceries', 'expense', 'srv-1');
    const [sql, params] = mockExec.mock.calls[0];
    expect(sql).toContain("(system_key = ? OR (system_key IS NULL AND id LIKE 'default-%'))");
    expect(sql).toContain('is_deleted = 0');
    expect(params).toEqual(['acc-1', 'expense', 'srv-1', 'groceries']);
  });
});
