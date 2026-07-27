import { filterConsumption } from '../consumption';

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
