/**
 * remapCategoryId re-points every reference to a category, including the
 * children's parent_id: otherwise a child created under a locally-id'd parent
 * is orphaned locally until the next full pull.
 */
const mockExec = jest.fn().mockResolvedValue(undefined);
jest.mock('../client', () => ({ executeSql: (...a: unknown[]) => mockExec(...a) }));

import { remapCategoryId } from '../categoryRepository';

describe('remapCategoryId', () => {
  it('re-points children parent_id at the new id', async () => {
    await remapCategoryId('old-1', 'new-1', 'old-1');
    expect(mockExec).toHaveBeenCalledWith(
      'UPDATE categories SET parent_id = ? WHERE parent_id = ?',
      ['new-1', 'old-1'],
    );
  });
});
