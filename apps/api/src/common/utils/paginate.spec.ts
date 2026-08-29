import { paginateById } from './paginate';

describe('paginateById', () => {
  it('yields nothing when the first page is empty', async () => {
    const fetchPage = jest.fn().mockResolvedValue([]);
    const pages: unknown[][] = [];
    for await (const page of paginateById(fetchPage, 500)) pages.push(page);

    expect(pages).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(undefined);
  });

  it('stops after a short (final) page without an extra fetch', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const fetchPage = jest.fn().mockResolvedValue(rows);
    const pages: { id: string }[][] = [];
    for await (const page of paginateById(fetchPage, 500)) pages.push(page);

    expect(pages).toEqual([rows]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('advances the cursor to the last row of each full page', async () => {
    const batchSize = 2;
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce([{ id: '1' }, { id: '2' }])
      .mockResolvedValueOnce([{ id: '3' }, { id: '4' }])
      .mockResolvedValueOnce([{ id: '5' }]);

    const pages: { id: string }[][] = [];
    for await (const page of paginateById(fetchPage, batchSize)) pages.push(page);

    expect(pages).toEqual([
      [{ id: '1' }, { id: '2' }],
      [{ id: '3' }, { id: '4' }],
      [{ id: '5' }],
    ]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, '2');
    expect(fetchPage).toHaveBeenNthCalledWith(3, '4');
  });

  it('never holds more than one page in flight at a time', async () => {
    // Regression guard for the bug this util fixes: the whole point is that
    // callers only ever see one batch, never the full table.
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce([{ id: '1' }])
      .mockResolvedValueOnce([]);

    const seenSizes: number[] = [];
    for await (const page of paginateById(fetchPage, 500)) {
      seenSizes.push(page.length);
    }

    expect(seenSizes).toEqual([1]);
  });
});
