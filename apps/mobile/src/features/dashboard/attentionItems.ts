import type { AnomalyAlert, Budget, BudgetProgress, UserSubscription } from '@budget/shared-types';
import type { MyInvitation } from '@/services/accounts.api';
import { resolveBudgetProjection, type BudgetProjection } from './budgetProjection';
import { selectUnreadAlerts } from '@/features/alerts/alertPresentation';

/**
 * "Needs your attention" — what goes in it, in what order, and where it stops.
 *
 * The design's own argument for one block instead of five cards is that five
 * differently-shaped urgencies in five places reintroduce the "which number
 * matters" problem. The consequence is that composition, ordering and the cap
 * become a single decision — and a wrong one renders perfectly. Nothing in
 * this repo renders a component in CI (no `react-test-renderer`, no
 * `@testing-library/react-native`), so the only defence these rules have is
 * that they live here, with tests, instead of inside `AttentionPanel.tsx`.
 *
 * ## Ordering is by KIND, never by timestamp
 *
 * An invitation from three days ago outranks an alert from this morning,
 * because a person is waiting on the invitation and nobody is waiting on the
 * alert. The design states this explicitly so that nobody later "fixes" the
 * list into one array sorted by date. `KIND_ORDER` below is that order, and it
 * is the reading order of the five sections in this file.
 *
 * Within a kind the rule differs, and the difference is deliberate rather than
 * an oversight — see each section.
 *
 * ## The cap and `+N more` are one number, computed once
 *
 * `overflowCount` is `everything.length - items.length`, never a second
 * `Math.max(0, total - 3)`. Two expressions of one quantity is precisely where
 * an off-by-one hides: both readings look plausible, the panel renders, and
 * "+1 more" opens a screen with two extra rows on it. Deriving one from the
 * other makes disagreement impossible, and makes `MAX_ATTENTION_ROWS` safe to
 * change with a single edit.
 *
 * ## Phase B inputs are optional from the start
 *
 * `pendingPurchaseRequestCount` and `subscriptions` are the two Phase B
 * additions (a purchase-request count and upcoming renewals). They are part of
 * this signature today, unfed, so that shipping them later adds DATA to a
 * tested module rather than a new shape to an untested one. An attention list
 * that never receives them is simply shorter — never an error, never a
 * placeholder row.
 */

/**
 * Three item rows, plus the `+N more` row on top when anything was dropped —
 * five items produce three rows and "+2 more", exactly as the design's layout
 * draws it. Not arbitrary: at 855px the viewport minus the 56px top bar and
 * 40px of padding leaves ~760px, the hero is 210px and three rows plus a
 * header is ~200px, so an attention block can never push the hero below the
 * fold.
 */
export const MAX_ATTENTION_ROWS = 3;

/**
 * The cap to pass when the user has explicitly asked to see everything.
 *
 * The `+N more` control **expands the panel in place** rather than navigating
 * to `/alerts` — the overflow can hold a budget or a renewal, and neither of
 * those appears on that screen, so the literal reading sent a person somewhere
 * their item is not. It is also the thesis of the whole dashboard: navigating
 * away IS the user leaving, so the overflow control of all things must not be
 * the one that navigates.
 *
 * `Infinity` rather than a large integer, because "no cap" is the actual
 * intent and `slice(0, Infinity)` expresses it exactly; a sentinel like 999
 * would be a silent truncation at an arbitrary size nobody would ever see fail.
 */
export const ALL_ATTENTION_ROWS = Number.POSITIVE_INFINITY;

/** "Subscriptions renewing within 7 days", from the design's composition list. */
export const RENEWAL_HORIZON_DAYS = 7;

/** The three renewal sentences, all already shipping in all nine locales. */
export type RenewalKey =
  | 'subscriptionManager.renewalToday'
  | 'subscriptionManager.renewalTomorrow'
  | 'subscriptionManager.renewalInDays';

/**
 * One row. A discriminated union so the panel's renderer is exhaustive and a
 * sixth kind cannot be added without every call site being told about it.
 *
 * `key` is a React key, kind-prefixed so two kinds drawing from different
 * tables can never collide, and deliberately the ONLY id-shaped field on the
 * item: acting on a row (`alertStore.dismiss`, `invitationStore.respond`)
 * reads the id off the entity the item carries, so there is never a question
 * of which id was meant.
 *
 * ## Which items carry an i18n key, and why not all of them
 *
 * A key appears here only where choosing BETWEEN keys is a decision that can
 * be wrong:
 *
 * - `budget` — the exceeded/projected/no-date collapse, three keys, owned by
 *   `budgetProjection.ts`.
 * - `renewal` — today / tomorrow / in N days, a three-way branch on a number.
 *
 * The other three already have an owner: an `alert` renders through
 * `renderAlertBody` (`features/alerts/alertPresentation.ts`), an `invitation`
 * through `InvitationCard`, which carries its own copy, and
 * `purchaseRequests` is a bare count. Minting a key for those here would be a
 * second source of truth for a string that already has one.
 */
export type AttentionItem =
  | { kind: 'invitation'; key: string; invitation: MyInvitation }
  | { kind: 'purchaseRequests'; key: string; count: number }
  | { kind: 'alert'; key: string; alert: AnomalyAlert }
  | { kind: 'budget'; key: string; budget: Budget; projection: BudgetProjection }
  | {
      kind: 'renewal';
      key: string;
      subscription: UserSubscription;
      i18nKey: RenewalKey;
      /** `{{count}}` for `renewalInDays`; ignored by the other two keys. */
      days: number;
    };

export interface AttentionList {
  /** At most `MAX_ATTENTION_ROWS`, already in render order. */
  items: AttentionItem[];
  /**
   * How many qualifying items did NOT fit. `0` means the list is complete and
   * the `+N more` row must not be drawn — it is not a "show it anyway with a
   * zero" case.
   */
  overflowCount: number;
}

export interface AttentionInputs {
  /** `invitationStore.invitations` — already only the caller's own pending ones. */
  invitations: MyInvitation[];
  /**
   * `alertStore.alerts`. The whole list, read AND unread: the unread filter is
   * a rule of this panel and therefore lives here, not at the call site.
   */
  alerts: AnomalyAlert[];
  /** `budgetStore.budgets` — every budget; the active/deleted filter is below. */
  budgets: Budget[];
  /**
   * `budgetStore.getBudgetProgress`, injected rather than read from the store,
   * so this stays a pure function of its inputs. Same shape as
   * `resolveMonthlyBudgetSegments`, which the dashboard already calls this way.
   *
   * Note for the call site: `getBudgetProgress` closes over the expense and
   * category stores, so a `useMemo` around this call needs those in its
   * dependency list too — see `FocusColumn.tsx`'s existing comment on exactly
   * that hazard.
   */
  getBudgetProgress: (budgetId: string) => BudgetProgress | null;

  // ---- Phase B. Absent today; present in the signature so that adding them
  // ---- is a data change, not a shape change. ----

  /**
   * Purchase requests awaiting this user's vote, as a COUNT — one aggregate
   * row, not one row per request, matching the design's count-bearing copy.
   *
   * The caller is responsible for only loading this on a non-personal
   * account; a personal account simply passes nothing. `undefined` and `0`
   * both produce no row, so a failed fetch and an empty queue are
   * indistinguishable here, which is the correct outcome for a fail-silent
   * load.
   */
  pendingPurchaseRequestCount?: number;
  /**
   * `userSubscriptionStore.subscriptions` — the whole list. The `isActive` and
   * `<= 7 days` filters are rules of this panel and live below, so that Phase B
   * hands over data and inherits the tested arithmetic rather than
   * re-implementing the window at the call site.
   */
  subscriptions?: UserSubscription[];
}

/**
 * The one place the by-kind order is written down. The array order IS the
 * render order.
 */
const KIND_ORDER = ['invitation', 'purchaseRequests', 'alert', 'budget', 'renewal'] as const;

/**
 * Invitations, in the order they arrive.
 *
 * Unsorted on purpose. The other kinds below sort because each has a real
 * urgency metric and a cap that could otherwise hide the most urgent member;
 * invitations have neither — every pending invitation is equally "a person is
 * waiting", and the design notes there are usually zero or one. Imposing an
 * order here would be an invented rule, and an invented rule is worse than no
 * rule.
 */
function invitationItems(invitations: MyInvitation[]): AttentionItem[] {
  return invitations.map((invitation) => ({
    kind: 'invitation' as const,
    key: `invitation:${invitation.id}`,
    invitation,
  }));
}

/** Zero, absent, or a negative count all mean "no row". */
function purchaseRequestItems(count: number | undefined): AttentionItem[] {
  if (!count || count <= 0) return [];
  return [{ kind: 'purchaseRequests' as const, key: 'purchaseRequests:pending', count }];
}

/**
 * Unread, undismissed anomaly alerts, newest first.
 *
 * The filtering and ordering moved to `selectUnreadAlerts` in
 * `features/alerts/alertPresentation.ts` when the top bar's alerts panel
 * needed the same reading. Addendum 5 orders that panel's list deliberately to
 * match this one, so the rule has to have one home — two copies of it is
 * exactly how the two surfaces would come to disagree about what is most
 * urgent. Behaviour here is unchanged; this now only wraps each alert as an
 * `AttentionItem`.
 */
function alertItems(alerts: AnomalyAlert[]): AttentionItem[] {
  return selectUnreadAlerts(alerts).map((alert) => ({
    kind: 'alert' as const,
    key: `alert:${alert.id}`,
    alert,
  }));
}

interface ProjectedBudget {
  budget: Budget;
  progress: BudgetProgress | null;
  projection: BudgetProjection;
}

/**
 * Budgets heading past their limit, worst first.
 *
 * `isActive` and `isDeleted` are filtered here, mirroring `classifyBudget`'s
 * rule that an inactive budget is never "needs attention" regardless of its
 * numbers. Without it, a budget the user switched off last spring can occupy
 * one of three rows forever.
 *
 * Sorted by `percentageUsed` descending, the same key `groupBudgets` uses on
 * the budgets tab. One sort key covers both states for free: an exceeded
 * budget is over 100% by definition (`spent > amount`), so it always outranks
 * a merely projected one without a second comparison to keep in step. Sorting
 * matters here precisely because of the cap — unordered, an already-blown
 * budget could sit behind "+2 more" while a mildly-projected one takes the row.
 */
function budgetItems(
  budgets: Budget[],
  getBudgetProgress: (budgetId: string) => BudgetProgress | null,
): AttentionItem[] {
  const projected: ProjectedBudget[] = [];
  for (const budget of budgets) {
    if (!budget.isActive || budget.isDeleted) continue;
    const progress = getBudgetProgress(budget.id);
    const projection = resolveBudgetProjection(budget, progress);
    if (projection) projected.push({ budget, progress, projection });
  }

  return projected
    .sort((a, b) => (b.progress?.percentageUsed ?? 0) - (a.progress?.percentageUsed ?? 0))
    .map(({ budget, projection }) => ({
      kind: 'budget' as const,
      key: `budget:${budget.id}`,
      budget,
      projection,
    }));
}

/**
 * Which of the three renewal sentences a day count earns.
 *
 * Exported because it is a three-way branch on a number, which is the shape of
 * thing that is wrong by one for a year before anyone notices.
 *
 * A count at or below zero reads as "today". `daysUntilRenewal` is computed
 * server-side from `nextRenewalDate`, and the auto-charge cron advances that
 * date once a day — so a negative value means a renewal that is due and has
 * not been processed yet. "Renews today" is the closest true sentence
 * available; hiding it because the number went one below the window would drop
 * the most urgent item in the kind.
 */
export function renewalKeyForDays(days: number): RenewalKey {
  if (days <= 0) return 'subscriptionManager.renewalToday';
  if (days === 1) return 'subscriptionManager.renewalTomorrow';
  return 'subscriptionManager.renewalInDays';
}

/**
 * Active subscriptions renewing within the horizon, soonest first.
 *
 * There is no lower bound — see `renewalKeyForDays`. Sorted ascending so that
 * a renewal due today can never be hidden behind one due in a week.
 */
function renewalItems(subscriptions: UserSubscription[] | undefined): AttentionItem[] {
  if (!subscriptions) return [];
  return subscriptions
    .filter((s) => s.isActive && s.daysUntilRenewal <= RENEWAL_HORIZON_DAYS)
    .slice()
    .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal)
    .map((subscription) => ({
      kind: 'renewal' as const,
      key: `renewal:${subscription.id}`,
      subscription,
      i18nKey: renewalKeyForDays(subscription.daysUntilRenewal),
      days: subscription.daysUntilRenewal,
    }));
}

/**
 * Compose, order by kind, cap, and count what was dropped.
 *
 * An empty result is the ordinary case and is not a failure — the panel hides
 * entirely when `items` is empty, which on most days is the correct dashboard.
 *
 * `maxRows` defaults to `MAX_ATTENTION_ROWS`, so every call written before the
 * parameter existed is unchanged and the resting state of the panel is still
 * three rows. It exists because the return shape genuinely cannot express an
 * expanded reading: `{ items: <=3, overflowCount: number }` carries no way to
 * recover items 4..N, and the alternative — reaching into this module's
 * internals from the panel — would put composition and ordering back in an
 * untested component. Pass `ALL_ATTENTION_ROWS` for the expanded reading.
 *
 * Note that an uncapped call necessarily returns `overflowCount: 0`, because
 * nothing was dropped. That is correct and is why the panel remembers how many
 * were hidden from its own CAPPED reading rather than from this one — see
 * `AttentionPanel`, which derives that number in exactly one place.
 */
export function buildAttentionItems(
  inputs: AttentionInputs,
  maxRows: number = MAX_ATTENTION_ROWS,
): AttentionList {
  const byKind: Record<(typeof KIND_ORDER)[number], AttentionItem[]> = {
    invitation: invitationItems(inputs.invitations),
    purchaseRequests: purchaseRequestItems(inputs.pendingPurchaseRequestCount),
    alert: alertItems(inputs.alerts),
    budget: budgetItems(inputs.budgets, inputs.getBudgetProgress),
    renewal: renewalItems(inputs.subscriptions),
  };

  const everything = KIND_ORDER.flatMap((kind) => byKind[kind]);
  const items = everything.slice(0, maxRows);

  // Derived from what was kept, never recomputed from the cap. See the header.
  return { items, overflowCount: everything.length - items.length };
}
