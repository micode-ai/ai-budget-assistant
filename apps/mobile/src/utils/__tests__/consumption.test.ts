import { filterConsumption, filterIncomeConsumption } from '../consumption';

const expense = (over: Partial<any> = {}): any => ({
  id: 'e1',
  amount: 100,
  isDeleted: false,
  ...over,
});

describe('filterConsumption', () => {
  it('keeps an ordinary expense', () => {
    expect(filterConsumption([expense()])).toHaveLength(1);
  });

  it('drops a split receivable', () => {
    expect(filterConsumption([expense({ isSplitReceivable: true })])).toHaveLength(0);
  });

  it('KEEPS a standalone cash debt — the debt row IS the outflow there', () => {
    // The regression guard. Filtering on isDebt instead would silently rewrite
    // the numbers of every user who lends money in cash.
    expect(filterConsumption([expense({ isDebt: true })])).toHaveLength(1);
  });

  it('treats an absent marker as false', () => {
    // The column is nullable on the client, so most rows arrive without it.
    expect(filterConsumption([expense({ isSplitReceivable: undefined })])).toHaveLength(1);
    expect(filterConsumption([expense({ isSplitReceivable: null as any })])).toHaveLength(1);
  });

  it('a 200 bill split three ways still totals 200 of spending', () => {
    const rows = [
      expense({ id: 'receipt', amount: 200 }),
      expense({ id: 'd1', amount: 50, isDebt: true, isSplitReceivable: true }),
      expense({ id: 'd2', amount: 50, isDebt: true, isSplitReceivable: true }),
      expense({ id: 'd3', amount: 50, isDebt: true, isSplitReceivable: true }),
    ];
    const total = filterConsumption(rows).reduce((sum, e) => sum + e.amount, 0);
    expect(total).toBe(200);
  });
});

describe('filterIncomeConsumption (shared-groups phase 2, task H1)', () => {
  const income = (over: Partial<any> = {}): any => ({
    id: 'i1',
    amount: 1000,
    isDeleted: false,
    ...over,
  });

  it('is behaviour-neutral while nothing sets the flag: the total is identical', () => {
    const rows = [
      income({ id: 'salary', amount: 5000 }),
      income({ id: 'bonus', amount: 300, isSplitReceivable: false }),
      income({ id: 'old', amount: 20, isSplitReceivable: undefined }),
      income({ id: 'nulled', amount: 7, isSplitReceivable: null as any }),
    ];
    const raw = rows.reduce((sum, i) => sum + i.amount, 0);
    const filtered = filterIncomeConsumption(rows).reduce((sum, i) => sum + i.amount, 0);
    expect(filtered).toBe(raw);
    expect(filterIncomeConsumption(rows)).toHaveLength(rows.length);
  });

  it('drops a flagged income from the total', () => {
    const rows = [income({ id: 'salary', amount: 5000 }), income({ id: 'settle', amount: 150, isSplitReceivable: true })];
    expect(filterIncomeConsumption(rows).reduce((sum, i) => sum + i.amount, 0)).toBe(5000);
  });

  it('KEEPS a borrowed-money debt income — never excluded by isDebt', () => {
    expect(filterIncomeConsumption([income({ isDebt: true })])).toHaveLength(1);
    expect(filterIncomeConsumption([income({ isDebtRepayment: true })])).toHaveLength(1);
  });
});
