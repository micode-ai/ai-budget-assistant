import { diffTransaction } from './transaction-revision.util';

describe('diffTransaction', () => {
  it('reports amount change', () => {
    expect(diffTransaction({ amount: 12, categoryId: 'a' }, { amount: 15, categoryId: 'a' })).toEqual({
      amount: { from: 12, to: 15 },
    });
  });
  it('returns null when nothing tracked changed', () => {
    expect(diffTransaction({ amount: 12, notes: 'x' }, { amount: 12, notes: 'y' })).toBeNull();
  });
  it('treats equal Dates as unchanged', () => {
    expect(diffTransaction({ date: new Date('2026-01-02') }, { date: new Date('2026-01-02') })).toBeNull();
  });
  it('skips E2EE rows', () => {
    expect(diffTransaction({ amount: 0, encryptedPayload: 'x' }, { amount: 0, encryptedPayload: 'y' })).toBeNull();
  });
  it('leaves out tier-1 ciphertext fields when the text is encrypted', () => {
    const before = { amount: 10, description: 'enc:aaa', merchant: 'enc:bbb' };
    const after = { amount: 12, description: 'enc:ccc', merchant: 'enc:ddd' };
    expect(diffTransaction(before, after, { textEncrypted: true })).toEqual({ amount: { from: 10, to: 12 } });
    expect(diffTransaction({ description: 'enc:a' }, { description: 'enc:b' }, { textEncrypted: true })).toBeNull();
  });
});
