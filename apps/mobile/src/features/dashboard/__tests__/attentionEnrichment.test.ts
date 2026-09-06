import type { AccountType, UserSubscription } from '@budget/shared-types';
import { isPurchaseRequestAccount, resolveAttentionEnrichment } from '../attentionEnrichment';
import { buildAttentionItems, type AttentionInputs } from '../attentionItems';

/**
 * The boundary the two Phase B reads cross into "Needs your attention".
 *
 * Every test below names the one production change that would make it fail.
 * Nothing renders a component in this repo's CI, so a wrong answer here is
 * invisible: the panel draws whatever it is handed, perfectly.
 */

const ACCOUNT = 'acc-current';
const OTHER_ACCOUNT = 'acc-other';

function subscription(over: Partial<UserSubscription> = {}): UserSubscription {
  return {
    id: 'sub-1',
    accountId: ACCOUNT,
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

const base = {
  accountId: ACCOUNT,
  accountType: 'shared' as AccountType,
  pendingPurchaseRequestCount: 0,
  subscriptions: [] as UserSubscription[],
};

describe('isPurchaseRequestAccount', () => {
  // Fails if the personal-account gate is dropped. A personal account has
  // nobody else to vote, so the count is meaningless there, not merely zero.
  it('is false for a personal account', () => {
    expect(isPurchaseRequestAccount('personal')).toBe(false);
  });

  // Fails if the gate is narrowed to `shared` only - business, trip and
  // investment accounts all take members and so can hold a pending vote.
  it.each<AccountType>(['shared', 'business', 'trip', 'investment'])(
    'is true for a %s account',
    (type) => {
      expect(isPurchaseRequestAccount(type)).toBe(true);
    },
  );

  // Fails the moment `!!accountType &&` is dropped for the "obvious"
  // `accountType !== 'personal'`, which reads an unloaded account list as a
  // definitely-shared account and both fires the request and shows its row.
  it('is false when the account type is not known yet', () => {
    expect(isPurchaseRequestAccount(undefined)).toBe(false);
  });
});

describe('resolveAttentionEnrichment - the purchase-request count', () => {
  // Fails if the count is gated only where the REQUEST is issued. Nothing
  // zeroes `purchaseRequestStore.pendingCount` on an account switch, so a
  // count fetched on a shared account survives into a personal one, where the
  // panel would show a queue that account cannot have.
  it('zeroes a count left over from another account when the account is personal', () => {
    const result = resolveAttentionEnrichment({
      ...base,
      accountType: 'personal',
      pendingPurchaseRequestCount: 4,
    });
    expect(result.pendingPurchaseRequestCount).toBe(0);
  });

  // Fails if the gate is inverted or the count is dropped altogether.
  it('passes the count through unchanged on a non-personal account', () => {
    const result = resolveAttentionEnrichment({
      ...base,
      pendingPurchaseRequestCount: 4,
    });
    expect(result.pendingPurchaseRequestCount).toBe(4);
  });
});

describe('resolveAttentionEnrichment - subscriptions', () => {
  // Fails if the account filter is removed. The store holds the previous
  // account's rows until the reload lands, so without this the panel demands
  // attention for another account's subscription, by name.
  it('drops subscriptions belonging to another account', () => {
    const mine = subscription({ id: 'mine' });
    const theirs = subscription({ id: 'theirs', accountId: OTHER_ACCOUNT });
    const result = resolveAttentionEnrichment({
      ...base,
      subscriptions: [mine, theirs],
    });
    expect(result.subscriptions.map((s) => s.id)).toEqual(['mine']);
  });

  // Fails if `Number.isFinite` is removed. `daysUntilRenewal` is computed per
  // request and never validated on arrival; `null <= 7` is true, so an absent
  // value would pass the horizon filter and be presented as due this week.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['NaN', NaN],
  ])('drops a subscription whose daysUntilRenewal is %s', (_label, value) => {
    const result = resolveAttentionEnrichment({
      ...base,
      subscriptions: [subscription({ daysUntilRenewal: value as unknown as number })],
    });
    expect(result.subscriptions).toEqual([]);
  });

  // Fails if the filter ever starts transforming rows rather than only
  // removing them - everything this module does must be subtractive.
  it('returns a healthy row untouched, by reference', () => {
    const sub = subscription();
    const result = resolveAttentionEnrichment({ ...base, subscriptions: [sub] });
    expect(result.subscriptions).toEqual([sub]);
    expect(result.subscriptions[0]).toBe(sub);
  });

  // Fails if the unknown-account case falls through to an unfiltered list.
  // Before the account id is known, no row can be attributed to this screen.
  it('returns nothing while the current account is not known', () => {
    const result = resolveAttentionEnrichment({
      ...base,
      accountId: null,
      subscriptions: [subscription()],
    });
    expect(result.subscriptions).toEqual([]);
  });

  // Filtering is NOT the panel's own `isActive`/horizon rule, which lives in
  // `attentionItems.ts`. Fails if either is duplicated here, which would make
  // the two copies free to disagree.
  it('keeps rows the panel itself will later reject', () => {
    const inactive = subscription({ id: 'inactive', isActive: false });
    const faraway = subscription({ id: 'faraway', daysUntilRenewal: 300 });
    const result = resolveAttentionEnrichment({
      ...base,
      subscriptions: [inactive, faraway],
    });
    expect(result.subscriptions.map((s) => s.id)).toEqual(['inactive', 'faraway']);
  });
});

describe('resolveAttentionEnrichment feeding buildAttentionItems', () => {
  const phaseA: AttentionInputs = {
    invitations: [],
    alerts: [],
    budgets: [],
    getBudgetProgress: () => null,
  };

  /**
   * The defect this boundary exists to prevent, stated end to end.
   *
   * Unguarded, a subscription with no day count passes `<= 7` and is drawn as
   * a renewal - the failure is silent, because the panel renders it exactly as
   * it renders a real one. Guarded, it simply does not appear and the list is
   * shorter. Fails if the guard moves, is removed, or stops being applied
   * before `buildAttentionItems` is called.
   */
  it('keeps a day-less subscription out of a panel that would otherwise admit it', () => {
    const broken = subscription({ daysUntilRenewal: null as unknown as number });

    const unguarded = buildAttentionItems({ ...phaseA, subscriptions: [broken] });
    expect(unguarded.items.map((i) => i.kind)).toEqual(['renewal']);

    const guarded = buildAttentionItems({
      ...phaseA,
      ...resolveAttentionEnrichment({ ...base, subscriptions: [broken] }),
    });
    expect(guarded.items).toEqual([]);
  });

  // Fails if the resolved shape stops being spreadable into `AttentionInputs`
  // - i.e. if this module and the panel's own module drift apart on names.
  it('produces both Phase B rows for real data, in the by-kind order', () => {
    const result = buildAttentionItems({
      ...phaseA,
      ...resolveAttentionEnrichment({
        ...base,
        pendingPurchaseRequestCount: 2,
        subscriptions: [subscription()],
      }),
    });
    expect(result.items.map((i) => i.kind)).toEqual(['purchaseRequests', 'renewal']);
  });
});
