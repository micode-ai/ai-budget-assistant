// "Complimentary" (comped) = a paid tier an admin granted by hand, with no money behind it.
//
// No column stores this. It does not need one: `stripeSubscriptionId` is written by exactly
// one place in the codebase — the Stripe webhook (`SubscriptionsService.handleSubscriptionCreated`,
// via `stripeSub.id`) — while `AdminService.changeSubscriptionTier` sets only `tier` + `status`.
// So "active paid tier with no Stripe subscription id" identifies the manually-granted set
// exactly, retroactively for grants already made, and self-heals if the user later actually pays.
//
// `handleSubscriptionDeleted` nulls `stripeSubscriptionId` AND resets `tier` to free, so a
// churned ex-payer can never read as a grant.
//
// Known limitation: a user who paid for Pro through Stripe and was then hand-upgraded to
// Business keeps a non-null `stripeSubscriptionId`, so they count as paying at the Business
// price. Fixing that needs an explicit flag; it is deliberately out of scope.
//
// The JS predicates and the Prisma `where` literals live in the same file on purpose — a
// counting query and an in-memory filter that disagree is the failure mode this guards against.

export interface CompedSubRow {
  tier: string;
  status: string;
  // Nullish rather than strictly `string | null`: Prisma returns null for an unset column,
  // but an absent field reads as undefined, and a strict `=== null` check would silently
  // classify such a row as PAYING — the exact direction of error this module exists to prevent.
  stripeSubscriptionId?: string | null;
}

type PaidTier = 'pro' | 'business';

// Not `as const`: Prisma's generated `where` types want a mutable SubscriptionTier[],
// so the readonly tuple a const assertion produces is rejected at every call site.
const PAID_TIERS: PaidTier[] = ['pro', 'business'];

function isActivePaidTier(sub: CompedSubRow): boolean {
  return sub.status === 'active' && (PAID_TIERS as string[]).includes(sub.tier);
}

/** Granted by an admin, no payment behind it. Excluded from every revenue figure. */
export function isComplimentarySub(sub: CompedSubRow | null | undefined): boolean {
  if (!sub) return false;
  return isActivePaidTier(sub) && !sub.stripeSubscriptionId;
}

/** Actually paying through Stripe. Trials are excluded (status is `trialing`, not `active`). */
export function isStripePaidSub(sub: CompedSubRow | null | undefined): boolean {
  if (!sub) return false;
  return isActivePaidTier(sub) && !!sub.stripeSubscriptionId;
}

/** Prisma `where` fragment for `isStripePaidSub`. Keep in sync with the predicate above. */
export const PAID_SUB_WHERE = {
  tier: { in: [...PAID_TIERS] },
  status: 'active' as const,
  stripeSubscriptionId: { not: null },
};

/** Prisma `where` fragment for `isComplimentarySub`. Keep in sync with the predicate above. */
export const COMPED_SUB_WHERE = {
  tier: { in: [...PAID_TIERS] },
  status: 'active' as const,
  stripeSubscriptionId: null,
};
