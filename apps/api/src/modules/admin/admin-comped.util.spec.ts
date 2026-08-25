import {
  isComplimentarySub,
  isStripePaidSub,
  PAID_SUB_WHERE,
  COMPED_SUB_WHERE,
} from './admin-comped.util';

describe('admin-comped util', () => {
  const paidPro = { tier: 'pro', status: 'active', stripeSubscriptionId: 'sub_123' };
  const compedBusiness = { tier: 'business', status: 'active', stripeSubscriptionId: null };
  const compedPro = { tier: 'pro', status: 'active', stripeSubscriptionId: null };
  const free = { tier: 'free', status: 'active', stripeSubscriptionId: null };
  const trialing = { tier: 'pro', status: 'trialing', stripeSubscriptionId: 'sub_456' };
  const canceled = { tier: 'pro', status: 'canceled', stripeSubscriptionId: null };

  it('flags an active paid tier with no Stripe subscription as complimentary', () => {
    expect(isComplimentarySub(compedBusiness)).toBe(true);
    expect(isComplimentarySub(compedPro)).toBe(true);
  });

  it('does not flag a Stripe-backed subscription', () => {
    expect(isComplimentarySub(paidPro)).toBe(false);
  });

  it('does not flag free, trialing or canceled rows', () => {
    // free is the default tier — nothing was granted
    expect(isComplimentarySub(free)).toBe(false);
    // a trial is Stripe-managed and time-boxed, not a manual grant
    expect(isComplimentarySub(trialing)).toBe(false);
    // handleSubscriptionDeleted nulls stripeSubscriptionId AND resets tier to free,
    // so a canceled row must never read as a manual grant
    expect(isComplimentarySub(canceled)).toBe(false);
  });

  it('treats a missing subscription as neither comped nor paying', () => {
    expect(isComplimentarySub(null)).toBe(false);
    expect(isComplimentarySub(undefined)).toBe(false);
    expect(isStripePaidSub(null)).toBe(false);
  });

  it('isStripePaidSub is the exact complement of isComplimentarySub over paid active rows', () => {
    for (const sub of [paidPro, compedBusiness, compedPro]) {
      expect(isStripePaidSub(sub)).toBe(!isComplimentarySub(sub));
    }
  });

  it('isStripePaidSub excludes trials from revenue', () => {
    expect(isStripePaidSub(trialing)).toBe(false);
  });

  it('treats an absent or empty stripeSubscriptionId as unpaid, not as paying', () => {
    // Prisma yields null, but a hand-built row or a narrowed select yields undefined.
    // Erring towards "paying" here would inflate MRR, so both must read as comped.
    expect(isComplimentarySub({ tier: 'business', status: 'active' })).toBe(true);
    expect(isStripePaidSub({ tier: 'business', status: 'active' })).toBe(false);
    expect(isComplimentarySub({ tier: 'pro', status: 'active', stripeSubscriptionId: '' })).toBe(true);
    expect(isStripePaidSub({ tier: 'pro', status: 'active', stripeSubscriptionId: '' })).toBe(false);
  });

  it('the Prisma where literals mirror the JS predicates', () => {
    expect(PAID_SUB_WHERE).toEqual({
      tier: { in: ['pro', 'business'] },
      status: 'active',
      stripeSubscriptionId: { not: null },
    });
    expect(COMPED_SUB_WHERE).toEqual({
      tier: { in: ['pro', 'business'] },
      status: 'active',
      stripeSubscriptionId: null,
    });
  });
});
