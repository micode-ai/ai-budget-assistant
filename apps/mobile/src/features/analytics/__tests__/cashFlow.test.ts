import {
  classifyCommitments,
  matchSubscription,
  monthWindowsEndingAt,
  monthlyCashFlow,
  summarizeCashFlow,
  type CommitmentSubscription,
} from '../cashFlow';

// 1 EUR = 4 PLN; everything reported in PLN.
const convert = (amount: number, currency: string) => (currency === 'EUR' ? amount * 4 : amount);

const sub = (over: Partial<CommitmentSubscription> = {}): CommitmentSubscription => ({
  id: 's1',
  name: 'Streaming',
  amount: 50,
  currencyCode: 'PLN',
  categoryId: 'cat-ent',
  isActive: true,
  ...over,
});

describe('summarizeCashFlow', () => {
  it('converts, subtracts and reports the savings rate', () => {
    const r = summarizeCashFlow(
      [{ amount: 100, currencyCode: 'EUR', date: '2026-06-02' }],
      [{ amount: 1000, currencyCode: 'PLN', date: '2026-06-01' }],
      convert,
    );
    expect(r).toEqual({ earned: 1000, spent: 400, saved: 600, savingsRate: 60 });
  });

  it('has no savings rate when nothing was earned, and a negative saved when overspent', () => {
    const r = summarizeCashFlow([{ amount: 30, currencyCode: 'PLN', date: '2026-06-02' }], [], convert);
    expect(r.savingsRate).toBeNull();
    expect(r.saved).toBe(-30);
  });
});

describe('monthlyCashFlow', () => {
  it('buckets by calendar month, oldest first', () => {
    const windows = monthWindowsEndingAt(new Date(2026, 5, 15), 3);
    expect(windows.map((w) => w.start.getMonth())).toEqual([3, 4, 5]);
    const months = monthlyCashFlow(
      [
        { amount: 10, currencyCode: 'PLN', date: new Date(2026, 4, 31, 23) },
        { amount: 20, currencyCode: 'PLN', date: new Date(2026, 5, 1) },
      ],
      [{ amount: 5, currencyCode: 'EUR', date: new Date(2026, 3, 10) }],
      windows,
      convert,
    );
    expect(months.map((m) => [m.earned, m.spent])).toEqual([[20, 0], [0, 10], [0, 20]]);
  });
});

describe('matchSubscription', () => {
  it('matches by name in the description or merchant, case-insensitively', () => {
    expect(matchSubscription({ amount: 1, currencyCode: 'PLN', date: '', description: ' streaming ' }, [sub()])?.id).toBe('s1');
    expect(matchSubscription({ amount: 1, currencyCode: 'PLN', date: '', merchant: 'STREAMING' }, [sub()])?.id).toBe('s1');
  });

  it('matches by category, currency and an amount within 1%', () => {
    const e = { amount: 50.4, currencyCode: 'PLN', date: '', categoryId: 'cat-ent' };
    expect(matchSubscription(e, [sub()])?.id).toBe('s1');
    expect(matchSubscription({ ...e, amount: 52 }, [sub()])).toBeNull();
    expect(matchSubscription({ ...e, currencyCode: 'EUR' }, [sub()])).toBeNull();
  });

  it('ignores inactive subscriptions', () => {
    expect(matchSubscription({ amount: 50, currencyCode: 'PLN', date: '', description: 'Streaming' }, [sub({ isActive: false })])).toBeNull();
  });
});

describe('classifyCommitments', () => {
  it('counts recurring series and subscription matches as fixed, the rest as flexible', () => {
    const r = classifyCommitments(
      [
        { amount: 1000, currencyCode: 'PLN', date: '', description: 'Rent', recurringId: 'rec-1' },
        { amount: 50, currencyCode: 'PLN', date: '', description: 'Streaming' },
        { amount: 25, currencyCode: 'EUR', date: '', description: 'Dinner' },
        { amount: 1000, currencyCode: 'PLN', date: '', description: 'Rent', recurringId: 'rec-1' },
      ],
      [sub()],
      convert,
    );
    expect(r.fixed).toBe(2050);
    expect(r.flexible).toBe(100);
    expect(Math.round(r.fixedShare)).toBe(95);
    expect(r.items).toEqual([
      { key: 'r:rec-1', label: 'Rent', kind: 'recurring', amount: 2000 },
      { key: 's:s1', label: 'Streaming', kind: 'subscription', amount: 50 },
    ]);
  });

  it('reports a zero share when nothing was spent', () => {
    expect(classifyCommitments([], [sub()], convert).fixedShare).toBe(0);
  });
});

describe('monthWindowsEndingAt with an anchor day', () => {
  it('returns financial months ending with the one containing the date', () => {
    const ws = monthWindowsEndingAt(new Date(2026, 9, 10), 2, 10);
    expect(ws.map((w) => [w.start, w.end])).toEqual([
      [new Date(2026, 8, 10), new Date(2026, 9, 10)],
      [new Date(2026, 9, 10), new Date(2026, 10, 10)],
    ]);
  });
});

describe('classifyCommitments with a linked renewal (ABA-776)', () => {
  it('counts an expense booked by a renewal as that subscription, even after it was cancelled', () => {
    const r = classifyCommitments(
      [{ amount: 45, currencyCode: 'PLN', date: '', description: 'renamed later', userSubscriptionId: 's1' }],
      [sub({ isActive: false, name: 'Music' })],
      convert,
    );
    expect(r.fixed).toBe(45);
    expect(r.items).toEqual([{ key: 's:s1', label: 'Music', kind: 'subscription', amount: 45 }]);
  });
});
