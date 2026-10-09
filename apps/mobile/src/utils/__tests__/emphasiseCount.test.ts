import { emphasiseCount } from '../emphasiseCount';

describe('emphasiseCount', () => {
  it('splits around the last occurrence of the count', () => {
    expect(emphasiseCount('Without a category: 12', 12)).toEqual({
      before: 'Without a category: ',
      countText: '12',
      after: '',
      found: true,
    });
  });

  it('prefers the last occurrence, so an earlier digit in the copy is safe', () => {
    const r = emphasiseCount('Top 3 receipts: 3', 3);
    expect(r.before).toBe('Top 3 receipts: ');
    expect(r.after).toBe('');
  });

  it('keeps text after the count', () => {
    const r = emphasiseCount('5 receipts waiting', 5);
    expect(r).toEqual({ before: '', countText: '5', after: ' receipts waiting', found: true });
  });

  it('reports found=false and returns the whole label as before when absent', () => {
    expect(emphasiseCount('Some receipts', 4)).toEqual({
      before: 'Some receipts',
      countText: '4',
      after: '',
      found: false,
    });
  });
});
