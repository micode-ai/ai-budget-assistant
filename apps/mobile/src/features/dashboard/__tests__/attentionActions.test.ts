import type { AnomalyAlert } from '@budget/shared-types';
import {
  alertAction,
  mergeTargets,
  buildTrackedSubscription,
  buildMarkRecurringUpdate,
} from '../attentionActions';

const alert = (over: Partial<AnomalyAlert> = {}): AnomalyAlert => ({
  id: 'a1',
  accountId: 'acc',
  userId: 'u',
  type: 'duplicate_charge',
  params: {},
  expenseId: null,
  categoryId: null,
  readAt: null,
  dismissedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

/**
 * The recurring/merge alerts BOTH carry an `expenseId`, so the order of the
 * three branches is the whole decision. Every test below names the production
 * change it dies on.
 */
describe('alertAction', () => {
  it('offers Track for a recurring suggestion even though it carries an expenseId', () => {
    // Breaks if: the `alert.expenseId` branch is moved ahead of the
    // `recurring_suggestion` branch. The API sets `expenseId` on this alert
    // type, so reordering silently replaces the inline "Track it" action with
    // an expense dialog — and "Track it" then exists nowhere on the dashboard.
    expect(
      alertAction(alert({ type: 'recurring_suggestion', expenseId: 'e1' }), true),
    ).toBe('track');
  });

  it('opens the merge screen for a possible_merge even though it carries an expenseId', () => {
    // Breaks if: same reordering as above. A merge row would open ONE of the
    // two expenses in a dialog instead of the screen that reconciles the pair.
    expect(alertAction(alert({ type: 'possible_merge', expenseId: 'e1' }), true)).toBe('merge');
  });

  it('opens the expense for any other alert that references one', () => {
    expect(alertAction(alert({ type: 'price_overcharge', expenseId: 'e9' }), true)).toBe('expense');
  });

  it('does nothing for an alert with no expense behind it', () => {
    // Breaks if: the last branch stops checking `expenseId` and returns
    // `'expense'` unconditionally. `category_spike` carries a categoryId and
    // no expense, so the dialog would open on `undefined` — the row would look
    // clickable and do nothing, or open the wrong thing.
    expect(alertAction(alert({ type: 'category_spike', expenseId: null }), true)).toBe('none');
  });

  it('withholds Track and Merge from a viewer, who cannot write either', () => {
    // Breaks if: the `canEdit` gate is dropped. Both actions end in a write
    // the server rejects with ViewerBlockGuard, so the button could only ever
    // fail — matching `app/alerts/index.tsx`, which gates exactly these two.
    expect(alertAction(alert({ type: 'recurring_suggestion', expenseId: 'e1' }), false)).toBe('none');
    expect(alertAction(alert({ type: 'possible_merge', expenseId: 'e1' }), false)).toBe('none');
  });

  it('still opens an expense for a viewer, which is read-only', () => {
    // Breaks if: `canEdit` is applied to the whole function rather than to the
    // two write branches. A viewer would lose the one alert action that is
    // legitimately theirs.
    expect(alertAction(alert({ type: 'duplicate_charge', expenseId: 'e1' }), false)).toBe('expense');
  });
});

describe('mergeTargets', () => {
  it('prefers the params ids and falls back to the column for the first one', () => {
    // Breaks if: the fallback chain is reordered or dropped. `app/alerts/
    // index.tsx` reads them in exactly this order; a merge opened with an
    // empty `aId` lands on a screen that cannot find either expense.
    expect(mergeTargets(alert({ params: { expenseId: 'p1', otherExpenseId: 'p2' }, expenseId: 'c1' })))
      .toEqual({ aId: 'p1', bId: 'p2' });
    expect(mergeTargets(alert({ params: { otherExpenseId: 'p2' }, expenseId: 'c1' })))
      .toEqual({ aId: 'c1', bId: 'p2' });
  });
});

describe('buildTrackedSubscription', () => {
  const now = new Date(2026, 8, 6); // 6 Sep 2026, local time on purpose.
  const recurring = (params: Record<string, unknown>) =>
    alert({ type: 'recurring_suggestion', params, expenseId: 'e1' });

  it('reads the amount out of the string the API actually sends', () => {
    // Breaks if: `p.amount` is passed straight through. The server stores it
    // as `Number(expense.amount).toFixed(2)` — a STRING — and the DTO wants a
    // number.
    const built = buildTrackedSubscription(
      recurring({ merchant: 'Netflix', amount: '43.00', currencyCode: 'PLN', cycle: 'monthly' }),
      now,
      'USD',
    );
    expect(built?.amount).toBe(43);
  });

  it('refuses an unparseable amount rather than posting NaN', () => {
    // Breaks if: the `Number.isFinite` guard is dropped. `NaN` serialises to
    // `null` in JSON, so this would create a subscription with no amount — or
    // a 422 the user experiences as the button doing nothing.
    expect(
      buildTrackedSubscription(
        recurring({ merchant: 'Netflix', amount: 'n/a', currencyCode: 'PLN', cycle: 'monthly' }),
        now,
        'USD',
      ),
    ).toBeNull();
  });

  it('refuses a partly-numeric amount instead of silently truncating it', () => {
    // Breaks if: `Number()` becomes `parseFloat()`. `parseFloat('12abc')` is
    // 12, which tracks a subscription at a price nobody was ever charged.
    expect(
      buildTrackedSubscription(
        recurring({ merchant: 'Netflix', amount: '12abc', currencyCode: 'PLN', cycle: 'monthly' }),
        now,
        'USD',
      ),
    ).toBeNull();
  });

  it('refuses a zero or negative amount', () => {
    expect(
      buildTrackedSubscription(
        recurring({ merchant: 'Netflix', amount: '0', currencyCode: 'PLN', cycle: 'monthly' }),
        now,
        'USD',
      ),
    ).toBeNull();
  });

  it('keeps the detected cycle instead of assuming monthly', () => {
    // Breaks if: `billingCycle` is hardcoded, the way the FORM at
    // `subscriptions/new.tsx` hardcodes it. That form hands the user a picker
    // to correct it; this path has none, so a weekly charge filed as monthly
    // under-reports the monthly-equivalent total by ~4.3x for ever.
    const built = buildTrackedSubscription(
      recurring({ merchant: 'Gym', amount: '25.00', currencyCode: 'PLN', cycle: 'weekly' }),
      now,
      'USD',
    );
    expect(built?.billingCycle).toBe('weekly');
  });

  it('advances the renewal date by ONE cycle, per cycle, into the future', () => {
    // Breaks if: the step ignores the cycle, or the date is not advanced at
    // all. The renewal cron pushes three days BEFORE this date and the
    // auto-charge cron books an expense once it is reached — a date left at
    // today (or in the past) fires a reminder immediately and mints a
    // duplicate expense the same night.
    expect(
      buildTrackedSubscription(
        recurring({ merchant: 'Gym', amount: '25', currencyCode: 'PLN', cycle: 'weekly' }),
        now,
        'USD',
      )?.nextRenewalDate,
    ).toBe('2026-09-13');

    expect(
      buildTrackedSubscription(
        recurring({ merchant: 'Netflix', amount: '43', currencyCode: 'PLN', cycle: 'monthly' }),
        now,
        'USD',
      )?.nextRenewalDate,
    ).toBe('2026-10-06');
  });

  it('formats the renewal date from LOCAL components, not through UTC', () => {
    // Breaks if: `toISOString().split('T')[0]` comes back. At 23:30 local on
    // a positive UTC offset that prints the NEXT calendar day; at 00:30 on a
    // negative one, the previous. Same defect ABA-381 fixed across every date
    // field in this app. This test only bites when the machine is not on UTC,
    // so it is deliberately paired with the explicit local `new Date(y, m, d)`
    // fixtures above rather than relied on alone.
    const late = new Date(2026, 8, 6, 23, 30, 0);
    expect(
      buildTrackedSubscription(
        recurring({ merchant: 'Gym', amount: '25', currencyCode: 'PLN', cycle: 'weekly' }),
        late,
        'USD',
      )?.nextRenewalDate,
    ).toBe('2026-09-13');
  });

  it('keeps the charge currency, never the display currency', () => {
    // Breaks if: the caller's currency is used unconditionally. That would
    // relabel a 43 PLN charge as 43 USD without converting it — the same class
    // of defect ABA-386/387 fixed on the API side.
    const built = buildTrackedSubscription(
      recurring({ merchant: 'Netflix', amount: '43', currencyCode: 'PLN', cycle: 'monthly' }),
      now,
      'USD',
    );
    expect(built?.currencyCode).toBe('PLN');
  });

  it('falls back to the display currency only when the alert carries none', () => {
    const built = buildTrackedSubscription(
      recurring({ merchant: 'Netflix', amount: '43', cycle: 'monthly' }),
      now,
      'USD',
    );
    expect(built?.currencyCode).toBe('USD');
  });

  it('refuses a cycle it does not understand rather than guessing', () => {
    // Breaks if: an unknown cycle falls through to a default. `CYCLE_STEP`
    // covers only what `detectCycle` can emit; inventing a schedule for
    // anything else would drive both crons off a fabricated date.
    expect(
      buildTrackedSubscription(
        recurring({ merchant: 'Netflix', amount: '43', currencyCode: 'PLN', cycle: 'fortnightly' }),
        now,
        'USD',
      ),
    ).toBeNull();
  });

  it('refuses an alert with no merchant rather than creating a nameless subscription', () => {
    expect(
      buildTrackedSubscription(
        recurring({ merchant: '   ', amount: '43', currencyCode: 'PLN', cycle: 'monthly' }),
        now,
        'USD',
      ),
    ).toBeNull();
  });

  it('refuses any alert that is not a recurring suggestion', () => {
    // Breaks if: the type guard is dropped. Every other alert type carries
    // different params, so this would build a subscription out of whatever
    // happened to be in them.
    expect(
      buildTrackedSubscription(
        alert({ type: 'price_increase', params: { merchant: 'X', amount: '5', cycle: 'monthly' } }),
        now,
        'USD',
      ),
    ).toBeNull();
  });

  it('carries detectedFrom so the row and the form produce the same record', () => {
    const built = buildTrackedSubscription(
      recurring({ merchant: 'Netflix', amount: '43', currencyCode: 'PLN', cycle: 'monthly' }),
      now,
      'USD',
    );
    expect(built?.detectedFrom).toBe('Netflix');
    expect(built?.name).toBe('Netflix');
  });
});

/**
 * `recurring-bill-detection-nudge` — the second, independent write action on
 * a `recurring_suggestion` alert, sitting beside `buildTrackedSubscription`.
 * It reuses the SAME detector signal to flag the alert's own triggering
 * expense as recurring, closing the ABA-523 gap without a new alert type.
 */
describe('buildMarkRecurringUpdate', () => {
  const recurring = (params: Record<string, unknown>, expenseId: string | null = 'e1') =>
    alert({ type: 'recurring_suggestion', params, expenseId });
  const fixedId = () => 'fixed-uuid';

  it('flags the alert\'s own expense, not any other id', () => {
    const built = buildMarkRecurringUpdate(
      recurring({ merchant: 'Mieszkanie', amount: '4374.18', cycle: 'monthly' }, 'e42'),
      fixedId,
    );
    expect(built?.expenseId).toBe('e42');
    expect(built?.isRecurring).toBe(true);
  });

  it('carries the cycle straight through — monthly and weekly share their string with RecurringPeriod', () => {
    // Breaks if: a translation table (like buildTrackedSubscription's
    // CYCLE_STEP) is introduced where none is needed — the detector's two
    // possible cycle values are already valid RecurringPeriod values.
    expect(
      buildMarkRecurringUpdate(recurring({ cycle: 'monthly' }), fixedId)?.recurringPeriod,
    ).toBe('monthly');
    expect(
      buildMarkRecurringUpdate(recurring({ cycle: 'weekly' }), fixedId)?.recurringPeriod,
    ).toBe('weekly');
  });

  it('generates the recurringId through the injected generator', () => {
    // Breaks if: `generateUUID` is called directly instead of through the
    // injected `generateId` — this test would then only be able to assert
    // "some string", not the exact id `expenseStore.updateExpense` receives.
    expect(buildMarkRecurringUpdate(recurring({ cycle: 'monthly' }), fixedId)?.recurringId).toBe(
      'fixed-uuid',
    );
  });

  it('refuses a cycle it does not recognise rather than guessing a period', () => {
    expect(buildMarkRecurringUpdate(recurring({ cycle: 'fortnightly' }), fixedId)).toBeNull();
    expect(buildMarkRecurringUpdate(recurring({}), fixedId)).toBeNull();
  });

  it('refuses when the alert carries no expenseId to mark', () => {
    // Belt-and-braces: the detector always sets this, but a defensive caller
    // must not send `undefined` as a route param.
    expect(buildMarkRecurringUpdate(recurring({ cycle: 'monthly' }, null), fixedId)).toBeNull();
  });

  it('refuses any alert that is not a recurring suggestion', () => {
    // Breaks if: the type guard is dropped, the same class of mistake
    // `buildTrackedSubscription`'s own equivalent test guards against.
    expect(
      buildMarkRecurringUpdate(
        alert({ type: 'price_increase', params: { cycle: 'monthly' }, expenseId: 'e1' }),
        fixedId,
      ),
    ).toBeNull();
  });
});
