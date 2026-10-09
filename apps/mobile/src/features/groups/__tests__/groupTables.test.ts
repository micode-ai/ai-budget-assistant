import type { GroupActivityItem, GroupSummary } from '@budget/shared-types';
import { activityDayKey, groupActivityByDay, myShareOf } from '../groupActivityTable';
import { groupsTotalsByCurrency, sortGroupsForTable } from '../groupListTable';

const expense = (
  id: string,
  date: string,
  amount: number,
  over: Record<string, unknown> = {},
): GroupActivityItem => ({
  kind: 'expense',
  at: `${date}T10:00:00.000Z`,
  expense: {
    id,
    groupId: 'g',
    description: id,
    amount,
    date,
    paidByMemberId: 'a',
    splitType: 'equal',
    createdByMemberId: 'a',
    shares: [
      { memberId: 'a', shareValue: null, shareAmount: amount / 2 },
      { memberId: 'b', shareValue: null, shareAmount: amount / 2 },
    ],
    deletedAt: null,
    deletedByMemberId: null,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    ...over,
  },
});

const settlement = (id: string, createdAt: string, amount: number, voidedAt: string | null = null): GroupActivityItem => ({
  kind: 'settlement',
  at: createdAt,
  settlement: {
    id,
    groupId: 'g',
    fromMemberId: 'b',
    toMemberId: 'a',
    amount,
    method: null,
    recordedByMemberId: 'b',
    voidedAt,
    voidedByMemberId: null,
    createdAt,
  },
});

describe('groupActivityByDay', () => {
  it('groups by day, newest day first, even when the feed order is not day order', () => {
    // Entered last but dated earliest: feed order alone would put 6 Oct above 9 Oct.
    const { days } = groupActivityByDay(
      [expense('x', '2026-10-09', 10), expense('y', '2026-10-06', 5), expense('z', '2026-10-09', 20)],
      'a',
    );
    expect(days.map((d) => d.dayKey)).toEqual(['2026-10-09', '2026-10-06']);
    expect(days[0].rows.map((r) => r.id)).toEqual(['e-x', 'e-z']);
  });

  it('sums live expenses only: deleted rows and settlements add nothing', () => {
    const local = new Date(2026, 9, 9, 12, 0, 0);
    const { days } = groupActivityByDay(
      [
        expense('x', '2026-10-09', 40),
        expense('del', '2026-10-09', 100, { deletedAt: '2026-10-09T11:00:00.000Z' }),
        settlement('s', local.toISOString(), 12),
      ],
      'a',
    );
    expect(days).toHaveLength(1);
    expect(days[0].subtotal).toBe(40);
    expect(days[0].rows).toHaveLength(3);
  });

  it('files a settlement under its LOCAL day, not the UTC date', () => {
    // 00:30 local on the 9th is the 8th in UTC for any zone east of UTC; the local day must win.
    const at = new Date(2026, 9, 9, 0, 30, 0).toISOString();
    expect(activityDayKey(settlement('s', at, 1))).toBe('2026-10-09');
  });

  it('returns the flat id order the keyboard cursor walks, day by day', () => {
    const { order } = groupActivityByDay(
      [expense('a1', '2026-10-07', 1), expense('b1', '2026-10-09', 1), expense('b2', '2026-10-09', 1)],
      'a',
    );
    expect(order).toEqual(['e-b1', 'e-b2', 'e-a1']);
  });

  it('rounds the subtotal to cents', () => {
    const { days } = groupActivityByDay([expense('p', '2026-10-09', 0.1), expense('q', '2026-10-09', 0.2)], 'a');
    expect(days[0].subtotal).toBe(0.3);
  });

  it('is empty for no items', () => {
    expect(groupActivityByDay([], 'a')).toEqual({ days: [], order: [] });
  });
});

describe('myShareOf', () => {
  const e = expense('x', '2026-10-09', 40);
  it('reads my entry in the split', () => {
    if (e.kind !== 'expense') throw new Error('fixture');
    expect(myShareOf(e.expense, 'a')).toBe(20);
  });
  it('is null when I am not part of the split', () => {
    if (e.kind !== 'expense') throw new Error('fixture');
    expect(myShareOf(e.expense, 'zz')).toBeNull();
  });
  it('is null on a settlement row', () => {
    const { days } = groupActivityByDay([settlement('s', new Date(2026, 9, 9, 12).toISOString(), 5)], 'a');
    expect(days[0].rows[0].myShare).toBeNull();
  });
});

const group = (
  id: string,
  name: string,
  currencyCode: string,
  myBalance: number,
  status: 'active' | 'archived' = 'active',
): GroupSummary => ({ id, name, emoji: null, currencyCode, status, memberCount: 3, myBalance });

describe('sortGroupsForTable', () => {
  it('lists active groups first, each block by name, and leaves the input alone', () => {
    const input = [
      group('1', 'Zakopane', 'PLN', 0, 'archived'),
      group('2', 'Flat', 'EUR', 1),
      group('3', 'Alps', 'EUR', 1),
      group('4', 'Berlin', 'EUR', 0, 'archived'),
    ];
    expect(sortGroupsForTable(input).map((g) => g.name)).toEqual(['Alps', 'Flat', 'Berlin', 'Zakopane']);
    expect(input.map((g) => g.id)).toEqual(['1', '2', '3', '4']);
  });
});

describe('groupsTotalsByCurrency', () => {
  it('never blends currencies and splits owed from owe', () => {
    expect(
      groupsTotalsByCurrency([
        group('1', 'a', 'EUR', 30),
        group('2', 'b', 'EUR', -12.5),
        group('3', 'c', 'PLN', -18),
        group('4', 'd', 'EUR', 12.1),
      ]),
    ).toEqual([
      { currencyCode: 'EUR', owed: 42.1, owe: 12.5 },
      { currencyCode: 'PLN', owed: 0, owe: 18 },
    ]);
  });

  it('ignores archived groups entirely, including their currency', () => {
    expect(groupsTotalsByCurrency([group('1', 'a', 'USD', 99, 'archived')])).toEqual([]);
  });

  it('treats a balance inside a cent as settled', () => {
    expect(groupsTotalsByCurrency([group('1', 'a', 'EUR', 0.004), group('2', 'b', 'EUR', -0.009)])).toEqual([
      { currencyCode: 'EUR', owed: 0, owe: 0 },
    ]);
  });

  it('is empty without groups', () => {
    expect(groupsTotalsByCurrency([])).toEqual([]);
  });
});
