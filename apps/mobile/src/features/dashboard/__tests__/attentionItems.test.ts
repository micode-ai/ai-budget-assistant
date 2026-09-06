import type { AnomalyAlert, Budget, BudgetProgress, UserSubscription } from '@budget/shared-types';
import type { MyInvitation } from '@/services/accounts.api';
import {
  MAX_ATTENTION_ROWS,
  RENEWAL_HORIZON_DAYS,
  buildAttentionItems,
  renewalKeyForDays,
  type AttentionInputs,
} from '../attentionItems';

/**
 * "Needs your attention": composition, by-kind order, the cap and `+N more`.
 *
 * Every test names the one production change that would make it fail. Nothing
 * renders a component in this repo's CI, so these rules have no other defence:
 * a wrong order, a wrong cap or a wrong overflow count all render perfectly.
 */

let seq = 0;
const uid = (prefix: string) => `${prefix}-${++seq}`;

function invitation(over: Partial<MyInvitation> = {}): MyInvitation {
  return {
    id: uid('inv'),
    accountId: 'a1',
    accountName: 'Family',
    accountType: 'shared',
    inviterName: 'Anna',
    role: 'editor',
    createdAt: '2026-09-01T09:00:00Z',
    ...over,
  };
}

function alert(over: Partial<AnomalyAlert> = {}): AnomalyAlert {
  return {
    id: uid('alert'),
    accountId: 'a1',
    userId: 'u1',
    type: 'duplicate_charge',
    params: {},
    expenseId: null,
    categoryId: null,
    readAt: null,
    dismissedAt: null,
    createdAt: '2026-09-06T09:00:00Z',
    ...over,
  };
}

function budget(over: Partial<Budget> = {}): Budget {
  return {
    id: uid('budget'),
    localId: 'l1',
    userId: 'u1',
    accountId: 'a1',
    name: 'Groceries',
    amount: 500,
    currencyCode: 'PLN',
    period: 'monthly',
    startDate: new Date('2026-09-01T00:00:00Z'),
    alertThreshold: null,
    isActive: true,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    isDeleted: false,
    syncStatus: 'synced',
    syncVersion: 1,
    ...over,
  };
}

/** A budget whose forecast puts it past its limit — i.e. one that earns a row. */
function overrunning(b: Budget, percentageUsed = 80): BudgetProgress {
  return {
    budget: b,
    spent: (b.amount * percentageUsed) / 100,
    remaining: Math.max(0, b.amount - (b.amount * percentageUsed) / 100),
    percentageUsed,
    isOverBudget: percentageUsed > 100,
    daysRemaining: 10,
    projectedTotal: b.amount * 1.3,
    dailyBurnRate: 20,
  };
}

/** A budget comfortably inside its limit — no row. */
function onTrack(b: Budget): BudgetProgress {
  return {
    budget: b,
    spent: 100,
    remaining: b.amount - 100,
    percentageUsed: 20,
    isOverBudget: false,
    daysRemaining: 10,
    projectedTotal: b.amount * 0.5,
    dailyBurnRate: 5,
  };
}

function subscription(over: Partial<UserSubscription> = {}): UserSubscription {
  return {
    id: uid('sub'),
    accountId: 'a1',
    name: 'Netflix',
    amount: 43,
    currencyCode: 'PLN',
    billingCycle: 'monthly',
    nextRenewalDate: '2026-09-09',
    categoryId: null,
    notes: null,
    detectedFrom: null,
    isActive: true,
    monthlyEquivalent: 43,
    daysUntilRenewal: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

/** Phase A inputs with nothing in them; Phase B genuinely absent. */
const empty: AttentionInputs = {
  invitations: [],
  alerts: [],
  budgets: [],
  getBudgetProgress: () => null,
};

/** Builds `getBudgetProgress` from an id -> progress map, the way the store does. */
const progressLookup =
  (map: Record<string, BudgetProgress>) =>
  (id: string): BudgetProgress | null =>
    map[id] ?? null;

/** n alerts, all unread, newest first in the produced order. */
function nAlerts(n: number): AnomalyAlert[] {
  return Array.from({ length: n }, (_, i) =>
    alert({ createdAt: new Date(Date.UTC(2026, 8, 6, 12 - i)).toISOString() }),
  );
}

const kinds = (result: ReturnType<typeof buildAttentionItems>) =>
  result.items.map((i) => i.kind);

describe('buildAttentionItems — the cap and the +N more count', () => {
  it('shows nothing at all on a calm account', () => {
    // Breaks if: any kind starts emitting a placeholder row for its own empty
    // state. The panel hides entirely when `items` is empty, and most days it
    // should — an always-present block with "nothing to do" in it is chrome.
    expect(buildAttentionItems(empty)).toEqual({ items: [], overflowCount: 0 });
  });

  it('never reports an overflow when nothing overflowed', () => {
    // Breaks if: `overflowCount` becomes `everything.length -
    // MAX_ATTENTION_ROWS` — the classic second expression of the same
    // quantity. On an empty account that is -3, and on a one-item account -2,
    // so a "+-2 more" row appears next to a single alert.
    expect(buildAttentionItems({ ...empty, alerts: nAlerts(1) }).overflowCount).toBe(0);
    expect(buildAttentionItems({ ...empty, alerts: nAlerts(2) }).overflowCount).toBe(0);
  });

  it('fills exactly three rows with three items and calls that complete', () => {
    // Breaks if: the cap is `slice(0, MAX_ATTENTION_ROWS - 1)` or the overflow
    // is computed with a stray `+ 1`. Three is the boundary the whole cap
    // argument rests on — it is the largest list that must NOT produce a
    // "+N more" row.
    const result = buildAttentionItems({ ...empty, alerts: nAlerts(3) });
    expect(result.items).toHaveLength(3);
    expect(result.overflowCount).toBe(0);
  });

  it('drops exactly one when a fourth arrives', () => {
    // Breaks if: the cap is off by one in either direction. Four items must be
    // three rows and "+1 more" — not two rows and "+2 more" (which would be
    // the reading where the more-row itself consumes a slot) and not four rows
    // (which is the reading that pushes the hero toward the fold).
    const result = buildAttentionItems({ ...empty, alerts: nAlerts(4) });
    expect(result.items).toHaveLength(3);
    expect(result.overflowCount).toBe(1);
  });

  it('matches the design layout exactly: five items are three rows and "+2 more"', () => {
    // Breaks if: the cap or the overflow arithmetic moves at all. This is the
    // literal case drawn in the design doc's populated mockup, so it is the
    // one number a reviewer can check against the picture.
    const result = buildAttentionItems({ ...empty, alerts: nAlerts(5) });
    expect(result.items).toHaveLength(3);
    expect(result.overflowCount).toBe(2);
  });

  it('keeps shown + overflow equal to the whole queue, at every size', () => {
    // Breaks if: `overflowCount` is ever computed from the cap constant rather
    // than derived from what was actually kept. That is the invariant the two
    // numbers exist to satisfy, and it is the only one that survives someone
    // changing MAX_ATTENTION_ROWS — a fixed `- 3` would keep passing the
    // boundary cases above and start lying the moment the cap moves.
    for (const total of [0, 1, 2, 3, 4, 7, 20]) {
      const result = buildAttentionItems({ ...empty, alerts: nAlerts(total) });
      expect(result.items.length + result.overflowCount).toBe(total);
      expect(result.items.length).toBeLessThanOrEqual(MAX_ATTENTION_ROWS);
      expect(result.overflowCount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('buildAttentionItems — ordering across kinds', () => {
  it('orders by kind: invitation, purchase requests, alert, budget, renewal', () => {
    // Breaks if: `KIND_ORDER` is reordered, or a kind is appended to the
    // composed array in the wrong place. With one of every kind the cap keeps
    // the first three, so this pins both the head of the order AND that the
    // cap applies after composition rather than per kind.
    const b = budget();
    const result = buildAttentionItems({
      invitations: [invitation()],
      alerts: [alert()],
      budgets: [b],
      getBudgetProgress: progressLookup({ [b.id]: overrunning(b) }),
      pendingPurchaseRequestCount: 2,
      subscriptions: [subscription()],
    });

    expect(kinds(result)).toEqual(['invitation', 'purchaseRequests', 'alert']);
    expect(result.overflowCount).toBe(2);
  });

  it('places a budget above a renewal', () => {
    // Breaks if: the last two entries of KIND_ORDER are swapped. The cap hides
    // this in the test above, so the tail of the order needs its own case —
    // otherwise budget-vs-renewal is untested and free to drift.
    const b = budget();
    const result = buildAttentionItems({
      ...empty,
      budgets: [b],
      getBudgetProgress: progressLookup({ [b.id]: overrunning(b) }),
      subscriptions: [subscription()],
    });
    expect(kinds(result)).toEqual(['budget', 'renewal']);
  });

  it('does not sort the list by date across kinds', () => {
    // Breaks if: somebody "fixes" the panel into one array sorted by
    // createdAt. A three-day-old invitation must still outrank an alert raised
    // this morning, because a person is waiting on the invitation and nobody
    // is waiting on the alert. The design names this explicitly for exactly
    // this reason.
    const result = buildAttentionItems({
      ...empty,
      invitations: [invitation({ createdAt: '2026-09-03T09:00:00Z' })],
      alerts: [alert({ createdAt: '2026-09-06T09:00:00Z' })],
    });
    expect(kinds(result)).toEqual(['invitation', 'alert']);
  });

  it('prefixes every row key with its own kind', () => {
    // Breaks if: ANY ONE of the five `key:` lines drops its prefix and becomes
    // the bare entity id. The prefix is the whole mechanism: ids come from
    // different tables, so without it two kinds can collide, and duplicate
    // React keys in one list silently reuse the wrong row's state when the
    // list changes.
    //
    // Asserting only that the keys are distinct is NOT enough, and this test
    // said exactly that until a mutation run showed it surviving: dropping one
    // prefix still leaves the OTHER kind prefixed, so no collision occurs and
    // nothing fails. Only dropping two at once would show — and a test that
    // needs a two-line mistake to fire does not guard a one-line one.
    const b = budget();
    const shown = [
      ...buildAttentionItems({
        ...empty,
        invitations: [invitation()],
        alerts: [alert()],
        pendingPurchaseRequestCount: 1,
      }).items,
      ...buildAttentionItems({
        ...empty,
        budgets: [b],
        getBudgetProgress: progressLookup({ [b.id]: overrunning(b) }),
        subscriptions: [subscription()],
      }).items,
    ];

    expect(shown).toHaveLength(5);
    for (const item of shown) {
      expect(item.key.startsWith(`${item.kind}:`)).toBe(true);
    }
  });

  it('keeps two kinds apart even when their ids collide', () => {
    // Breaks if: the prefixes go from both the invitation and the alert row.
    // The property the prefix above exists to buy, stated as itself — entity
    // ids are unique per table, never across tables.
    const result = buildAttentionItems({
      ...empty,
      invitations: [invitation({ id: 'shared-id' })],
      alerts: [alert({ id: 'shared-id' })],
    });
    const keys = result.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('buildAttentionItems — alerts', () => {
  it('leaves out an alert the user has already read', () => {
    // Breaks if: the `!a.readAt` filter is dropped. `alertStore` holds
    // `GET /alerts` verbatim, which includes read alerts, so without this the
    // three rows fill up with things already seen and a live invitation is
    // pushed behind "+N more".
    const result = buildAttentionItems({
      ...empty,
      alerts: [alert({ readAt: '2026-09-06T10:00:00Z' }), alert()],
    });
    expect(result.items).toHaveLength(1);
  });

  it('leaves out an alert that has been dismissed', () => {
    // Breaks if: the `!a.dismissedAt` filter is dropped. The store removes
    // dismissed alerts optimistically, but a pull that races the dismiss can
    // put one back, and a row the user explicitly cleared reappearing is worse
    // than a row that never showed.
    const result = buildAttentionItems({
      ...empty,
      alerts: [alert({ dismissedAt: '2026-09-06T10:00:00Z' })],
    });
    expect(result.items).toHaveLength(0);
  });

  it('puts the newest alert first', () => {
    // Breaks if: the sort comparator is reversed, or removed in favour of
    // trusting the server's `orderBy`. With a cap of three, the oldest-first
    // reading hides today's alert behind three from last week.
    const older = alert({ createdAt: '2026-09-01T09:00:00Z' });
    const newer = alert({ createdAt: '2026-09-06T09:00:00Z' });
    const result = buildAttentionItems({ ...empty, alerts: [older, newer] });

    expect(result.items.map((i) => (i.kind === 'alert' ? i.alert.id : null))).toEqual([
      newer.id,
      older.id,
    ]);
  });

});

describe('buildAttentionItems — budgets', () => {
  it('includes a budget only once its forecast passes the limit', () => {
    // Breaks if: the `resolveBudgetProjection` gate is dropped and every
    // budget becomes a row. An account with six healthy budgets would fill the
    // panel permanently and never empty.
    const over = budget({ name: 'Groceries' });
    const fine = budget({ name: 'Transport' });
    const result = buildAttentionItems({
      ...empty,
      budgets: [over, fine],
      getBudgetProgress: progressLookup({
        [over.id]: overrunning(over),
        [fine.id]: onTrack(fine),
      }),
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind === 'budget' && result.items[0].budget.name).toBe('Groceries');
  });

  it('carries the projection alongside the budget so the row needs no second decision', () => {
    // Breaks if: the item stops carrying `projection` and the panel re-derives
    // it. Two callers of `resolveBudgetProjection` is two chances to render
    // both sentences, which is the thing that module exists to prevent.
    const b = budget();
    const result = buildAttentionItems({
      ...empty,
      budgets: [b],
      getBudgetProgress: progressLookup({ [b.id]: overrunning(b) }),
    });

    const item = result.items[0];
    expect(item.kind).toBe('budget');
    expect(item.kind === 'budget' && item.projection.i18nKey).toBe('insights.projectedTotal');
  });

  it('ignores a budget the user has switched off', () => {
    // Breaks if: the `b.isActive` filter is dropped. `classifyBudget` already
    // rules an inactive budget out of "needs attention" regardless of its
    // numbers; without the same rule here, a budget switched off last spring
    // holds one of three rows forever and cannot be cleared from the panel.
    const b = budget({ isActive: false });
    const result = buildAttentionItems({
      ...empty,
      budgets: [b],
      getBudgetProgress: progressLookup({ [b.id]: overrunning(b) }),
    });
    expect(result.items).toHaveLength(0);
  });

  it('ignores a deleted budget', () => {
    // Breaks if: the `!b.isDeleted` filter is dropped. Soft-deleted rows stay
    // in the store until the next pull prunes them.
    const b = budget({ isDeleted: true });
    const result = buildAttentionItems({
      ...empty,
      budgets: [b],
      getBudgetProgress: progressLookup({ [b.id]: overrunning(b) }),
    });
    expect(result.items).toHaveLength(0);
  });

  it('puts the worst budget first, whatever order the store held them in', () => {
    // Breaks if: the percentage sort is dropped or reversed. With a cap of
    // three, an unsorted list can leave a budget already 40% past its limit
    // behind "+2 more" while three mildly-projected ones take the rows — the
    // panel showing the least urgent of what it knows.
    const mild = budget({ name: 'Transport' });
    const blown = budget({ name: 'Groceries' });
    const result = buildAttentionItems({
      ...empty,
      budgets: [mild, blown],
      getBudgetProgress: progressLookup({
        [mild.id]: overrunning(mild, 60),
        [blown.id]: overrunning(blown, 140),
      }),
    });

    expect(result.items.map((i) => (i.kind === 'budget' ? i.budget.name : null))).toEqual([
      'Groceries',
      'Transport',
    ]);
  });

  it('survives a budget whose progress the store cannot compute', () => {
    // Breaks if: the `null` progress case throws instead of being skipped.
    // `getBudgetProgress` returns null for a budget outside its period, which
    // is ordinary — and an exception here takes the dashboard down.
    const b = budget();
    const result = buildAttentionItems({ ...empty, budgets: [b], getBudgetProgress: () => null });
    expect(result.items).toHaveLength(0);
  });
});

describe('buildAttentionItems — Phase B inputs', () => {
  it('is simply shorter when the Phase B inputs never arrive', () => {
    // Breaks if: either optional input becomes required, or `renewalItems`
    // stops guarding `undefined` and throws on `.filter` of nothing. Phase A
    // ships without these, so an error here is a blank dashboard on day one.
    const result = buildAttentionItems({ ...empty, alerts: nAlerts(1) });
    expect(kinds(result)).toEqual(['alert']);
  });

  it('renders pending purchase requests as ONE counted row, not one row each', () => {
    // Breaks if: the count is expanded into N rows. Four pending requests
    // would then consume every row and push an invitation out of the panel,
    // and the copy the design chose is count-bearing precisely because it is
    // one row.
    const result = buildAttentionItems({ ...empty, pendingPurchaseRequestCount: 4 });
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.kind === 'purchaseRequests' && item.count).toBe(4);
  });

  it('draws no purchase-request row for an empty or absent queue', () => {
    // Breaks if: the `!count` guard is dropped — a personal account (which
    // never loads this) or an account with nothing pending would get a row
    // reading "0 purchase requests awaiting your vote".
    expect(buildAttentionItems({ ...empty, pendingPurchaseRequestCount: 0 }).items).toHaveLength(0);
    expect(buildAttentionItems({ ...empty }).items).toHaveLength(0);
  });

  it('includes a renewal on the last day of the horizon', () => {
    // Breaks if: `<= RENEWAL_HORIZON_DAYS` becomes `<`. The design says
    // "within 7 days", and an off-by-one silently drops the whole first day
    // of the window.
    const result = buildAttentionItems({
      ...empty,
      subscriptions: [subscription({ daysUntilRenewal: RENEWAL_HORIZON_DAYS })],
    });
    expect(result.items).toHaveLength(1);
  });

  it('excludes a renewal one day beyond the horizon', () => {
    // Breaks if: the comparison becomes `<= 8`, or the filter is dropped. With
    // the filter gone, every subscription the user has ever tracked becomes an
    // attention row.
    const result = buildAttentionItems({
      ...empty,
      subscriptions: [subscription({ daysUntilRenewal: RENEWAL_HORIZON_DAYS + 1 })],
    });
    expect(result.items).toHaveLength(0);
  });

  it('ignores a cancelled subscription however soon its date says it renews', () => {
    // Breaks if: the `isActive` filter is dropped. `GET /user-subscriptions`
    // returns inactive rows too, and `nextRenewalDate` is left where it was
    // when the user switched the subscription off — so a cancelled Netflix
    // would keep announcing a renewal that will never be charged.
    const result = buildAttentionItems({
      ...empty,
      subscriptions: [subscription({ isActive: false, daysUntilRenewal: 1 })],
    });
    expect(result.items).toHaveLength(0);
  });

  it('puts the soonest renewal first', () => {
    // Breaks if: the ascending sort is dropped or reversed. With the cap, a
    // renewal due today can otherwise sit behind three due later in the week.
    const result = buildAttentionItems({
      ...empty,
      subscriptions: [
        subscription({ name: 'Spotify', daysUntilRenewal: 6 }),
        subscription({ name: 'Netflix', daysUntilRenewal: 0 }),
      ],
    });

    expect(result.items.map((i) => (i.kind === 'renewal' ? i.subscription.name : null))).toEqual([
      'Netflix',
      'Spotify',
    ]);
  });

  it('carries the renewal sentence on the row', () => {
    // Breaks if: `i18nKey`/`days` stop being computed here and the panel
    // branches on the number itself. Three keys chosen at the render site is
    // a second copy of a three-way rule with no test on it.
    const result = buildAttentionItems({
      ...empty,
      subscriptions: [subscription({ daysUntilRenewal: 3 })],
    });
    const item = result.items[0];
    expect(item.kind === 'renewal' && item.i18nKey).toBe('subscriptionManager.renewalInDays');
    expect(item.kind === 'renewal' && item.days).toBe(3);
  });
});

describe('renewalKeyForDays', () => {
  it('says today for a renewal due today', () => {
    // Breaks if: the `days <= 0` branch becomes `days === 0` and today's
    // renewal falls through to "Renews in 0 days".
    expect(renewalKeyForDays(0)).toBe('subscriptionManager.renewalToday');
  });

  it('says today for a renewal already overdue', () => {
    // Breaks if: the branch becomes `days === 0`. `daysUntilRenewal` goes
    // negative whenever the auto-charge cron has not run yet, and "Renews in
    // -2 days" is the sentence that reaches the user.
    expect(renewalKeyForDays(-2)).toBe('subscriptionManager.renewalToday');
  });

  it('says tomorrow for exactly one day out', () => {
    // Breaks if: the boundary moves either way — `days <= 1` swallows today,
    // `days === 2` gives tomorrow's renewal the plural sentence.
    expect(renewalKeyForDays(1)).toBe('subscriptionManager.renewalTomorrow');
  });

  it('counts the days from two onward', () => {
    // Breaks if: the tomorrow branch widens to `days <= 2`, which would
    // announce a renewal two days away as happening tomorrow.
    expect(renewalKeyForDays(2)).toBe('subscriptionManager.renewalInDays');
    expect(renewalKeyForDays(7)).toBe('subscriptionManager.renewalInDays');
  });
});
