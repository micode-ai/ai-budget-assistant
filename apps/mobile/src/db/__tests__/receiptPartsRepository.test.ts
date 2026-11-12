/**
 * receiptPartsRepository — parts 2..N of a multi-photo receipt in
 * `expense_receipt_parts`. The mock boundary is `../client` (as in the other
 * repository tests); a tiny in-memory table answers the four statements the
 * repository issues, so a save → read round-trip is exercised end to end.
 */
import {
  saveReceiptPartsLocally,
  getReceiptPartsFromDb,
  deleteReceiptPartsLocally,
  readReceiptPartsStrict,
} from '../receiptPartsRepository';

type Params = (string | number | null)[];
type Row = { expense_id: string; idx: number; image: string; mime: string };

let table: Row[] = [];
const statements: string[] = [];

const mockExecuteSql = jest.fn(async (sql: string, params: Params = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  statements.push(s);
  if (s.startsWith('DELETE FROM expense_receipt_parts WHERE expense_id = ?')) {
    table = table.filter((r) => r.expense_id !== params[0]);
    return [];
  }
  if (s.startsWith('INSERT INTO expense_receipt_parts')) {
    const [expense_id, idx, image, mime] = params as [string, number, string, string];
    table = table.filter((r) => !(r.expense_id === expense_id && r.idx === idx));
    table.push({ expense_id, idx, image, mime });
    return [];
  }
  if (s.startsWith('SELECT idx, image, mime FROM expense_receipt_parts WHERE expense_id = ? ORDER BY idx')) {
    return table.filter((r) => r.expense_id === params[0]).sort((a, b) => a.idx - b.idx);
  }
  throw new Error(`unexpected SQL: ${s}`);
});

jest.mock('../client', () => ({
  executeSql: (sql: string, params: Params) => mockExecuteSql(sql, params),
  withTransaction: (task: () => Promise<void>) => task(),
}));

beforeEach(() => {
  table = [];
  statements.length = 0;
});

describe('receiptPartsRepository', () => {
  it('round-trips parts 2..N in order, stored under idx 2..N', async () => {
    await saveReceiptPartsLocally('exp-1', [
      { imageBase64: 'P2', mimeType: 'image/jpeg' },
      { imageBase64: 'P3', mimeType: 'image/png' },
    ]);
    expect(table.map((r) => r.idx).sort()).toEqual([2, 3]);
    expect(await getReceiptPartsFromDb('exp-1')).toEqual([
      { imageBase64: 'P2', mimeType: 'image/jpeg' },
      { imageBase64: 'P3', mimeType: 'image/png' },
    ]);
  });

  it('a second save replaces the parts instead of appending', async () => {
    await saveReceiptPartsLocally('exp-1', [
      { imageBase64: 'OLD2', mimeType: 'image/jpeg' },
      { imageBase64: 'OLD3', mimeType: 'image/jpeg' },
    ]);
    await saveReceiptPartsLocally('exp-1', [{ imageBase64: 'NEW2', mimeType: 'image/jpeg' }]);
    expect(await getReceiptPartsFromDb('exp-1')).toEqual([{ imageBase64: 'NEW2', mimeType: 'image/jpeg' }]);
  });

  it('keeps other expenses apart and deletes only the one asked for', async () => {
    await saveReceiptPartsLocally('exp-1', [{ imageBase64: 'A', mimeType: 'image/jpeg' }]);
    await saveReceiptPartsLocally('exp-2', [{ imageBase64: 'B', mimeType: 'image/jpeg' }]);
    await deleteReceiptPartsLocally('exp-1');
    expect(await getReceiptPartsFromDb('exp-1')).toEqual([]);
    expect(await getReceiptPartsFromDb('exp-2')).toEqual([{ imageBase64: 'B', mimeType: 'image/jpeg' }]);
  });

  it('stores at most 3 extra parts', async () => {
    const p = { imageBase64: 'X', mimeType: 'image/jpeg' };
    await saveReceiptPartsLocally('exp-1', [p, p, p, p, p]);
    expect(table.map((r) => r.idx).sort()).toEqual([2, 3, 4]);
  });

  it('a read that fails (web, an old database) reads as no parts', async () => {
    mockExecuteSql.mockRejectedValueOnce(new Error('no such table'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getReceiptPartsFromDb('exp-1')).toEqual([]);
    warn.mockRestore();
  });

  it('the strict read (sync path) rethrows instead of reading as no parts', async () => {
    mockExecuteSql.mockRejectedValueOnce(new Error('disk I/O error'));
    await expect(readReceiptPartsStrict('exp-1')).rejects.toThrow('disk I/O error');
  });
});
