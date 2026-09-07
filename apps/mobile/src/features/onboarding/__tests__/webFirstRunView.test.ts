import {
  FIRST_RUN_WAIT_TIMEOUT_MS,
  hasActivityEvidence,
  hasPullAnswered,
  resolveFirstRunView,
  shouldMarkFirstRunSeen,
  type ActivityEvidenceInputs,
  type MarkSeenInputs,
} from '../webFirstRunView';

/** Both pulls answered, nothing recorded. The state a brand-new account is in. */
const answeredAndEmpty: ActivityEvidenceInputs = {
  expensesPullAt: 1_700_000_000_000,
  incomesPullAt: 1_700_000_000_001,
  expenseCount: 0,
  incomeCount: 0,
};

/** Neither pull has come back. The state an offline first paint is in. */
const unanswered: ActivityEvidenceInputs = {
  expensesPullAt: null,
  incomesPullAt: null,
  expenseCount: 0,
  incomeCount: 0,
};

describe('resolveFirstRunView', () => {
  describe('before the wait bound elapses', () => {
    it('holds the loading state while a pull is unanswered', () => {
      // Breaks if: the `'wait'` case is dropped and the ordinary dashboard is
      // drawn instead. That is the whole defect this state exists for — on web
      // a failed or in-flight pull reads as an empty account, so an offline
      // first paint would show nine cards reporting absence.
      expect(resolveFirstRunView({ outcome: 'wait', waitTimedOut: false })).toBe('wait');
    });

    it('draws the first-run state when the predicate says show', () => {
      // Breaks if: `'show'` stops being mapped, which would make the entire
      // feature unreachable while every test of the predicate still passed.
      expect(resolveFirstRunView({ outcome: 'show', waitTimedOut: false })).toBe('first-run');
    });

    it('draws the ordinary dashboard when the predicate says suppress', () => {
      // Breaks if: `'suppress'` starts mapping to anything else. Suppress is
      // the answer for a viewer, an established user and a pending
      // `nextAfter`, i.e. almost everyone.
      expect(resolveFirstRunView({ outcome: 'suppress', waitTimedOut: false })).toBe('dashboard');
    });
  });

  describe('after the wait bound elapses', () => {
    it('gives up waiting and draws the ordinary dashboard', () => {
      // Breaks if: the bound is dropped. Without it a permanently failing pull
      // sits at `'wait'` for ever, and the user looks at a spinner nothing
      // will ever resolve — which contradicts the spec's own "a permanently
      // offline user sees the ordinary empty dashboard".
      expect(resolveFirstRunView({ outcome: 'wait', waitTimedOut: true })).toBe('dashboard');
    });

    it('refuses a late show — the timeout wins over the answer that follows it', () => {
      // THE load-bearing one. Breaks if: the `waitTimedOut` check is moved
      // below the outcome checks (the obvious "tidier" ordering). A pull
      // landing at 7s would then flip a settled dashboard into "add your first
      // expense" five seconds after the user started reading it — and for a
      // user with years of history whose network merely stalled, that is the
      // exact harm the asymmetry is chosen to avoid.
      expect(resolveFirstRunView({ outcome: 'show', waitTimedOut: true })).toBe('dashboard');
    });

    it('still draws the ordinary dashboard on suppress', () => {
      // Breaks if: the timeout branch returns something other than
      // `'dashboard'` — the two paths to the ordinary dashboard must agree.
      expect(resolveFirstRunView({ outcome: 'suppress', waitTimedOut: true })).toBe('dashboard');
    });
  });

  it('bounds the wait with a positive, finite, human-scale delay', () => {
    // Breaks if: the constant becomes 0 (the loading state would be skipped
    // entirely on the very first tick, restoring the empty-cards flash it
    // exists to prevent) or `Infinity` (an unbounded wait, i.e. no bound at
    // all). Both are silent: nothing renders in CI, and neither changes a
    // type.
    expect(Number.isFinite(FIRST_RUN_WAIT_TIMEOUT_MS)).toBe(true);
    expect(FIRST_RUN_WAIT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(FIRST_RUN_WAIT_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe('hasPullAnswered', () => {
  it('is false while neither pull has come back', () => {
    // Breaks if: the function starts defaulting to "answered", which is the
    // whole ambiguity the three-valued predicate was added to remove.
    expect(hasPullAnswered({ expensesPullAt: null, incomesPullAt: null })).toBe(false);
  });

  it('is false while only the expense pull has come back', () => {
    // Breaks if: `&&` becomes `||`. An income-only account would then be
    // judged on an income list nobody had fetched.
    expect(hasPullAnswered({ expensesPullAt: 1, incomesPullAt: null })).toBe(false);
  });

  it('is false while only the income pull has come back', () => {
    // Breaks if: the expense side stops being checked at all — the more
    // likely half to be dropped, since it is the one every screen loads.
    expect(hasPullAnswered({ expensesPullAt: null, incomesPullAt: 1 })).toBe(false);
  });

  it('is true once both have come back', () => {
    // Breaks if: the comparison is inverted.
    expect(hasPullAnswered({ expensesPullAt: 1, incomesPullAt: 2 })).toBe(true);
  });

  it('treats a zero timestamp as an answer, not an absence', () => {
    // Breaks if: `=== null` becomes a truthiness check. `lastPullAt` is a
    // `Date.now()` stamp so 0 will not occur in practice, but reading a real
    // answer as absent is the failure that leaves the dashboard waiting until
    // the bound elapses — a five-second spinner for no reason.
    expect(hasPullAnswered({ expensesPullAt: 0, incomesPullAt: 0 })).toBe(true);
  });
});

describe('hasActivityEvidence', () => {
  it('is false for an answered pull with nothing in it', () => {
    // Breaks if: the count comparison is inverted or dropped. This is the
    // brand-new account, and reading it as activated deletes the feature.
    expect(hasActivityEvidence(answeredAndEmpty)).toBe(false);
  });

  it('is true for an answered pull with an expense', () => {
    // Breaks if: `> 0` becomes `> 1`, or the expense side is dropped.
    expect(hasActivityEvidence({ ...answeredAndEmpty, expenseCount: 1 })).toBe(true);
  });

  it('is true for an answered pull with ONLY an income', () => {
    // Breaks if: `incomeCount` is dropped from the sum. A user who logged a
    // salary and no expense has activated the app just as much as one who did
    // the reverse — and this boolean is what marks `seen`, so getting it
    // wrong would keep re-offering onboarding to a real user.
    expect(hasActivityEvidence({ ...answeredAndEmpty, incomeCount: 1 })).toBe(true);
  });

  it('is false when the counts are non-zero but no pull has answered', () => {
    // Breaks if: the pull check is dropped and the counts are trusted alone.
    // On web SQLite is a mock, so a count is an artefact until the server has
    // spoken; trusting it here would mark `seen` — permanently — off a
    // reading that means nothing.
    expect(hasActivityEvidence({ ...unanswered, expenseCount: 12, incomeCount: 3 })).toBe(false);
  });

  it('is false when only one of the two pulls has answered', () => {
    // Breaks if: `hasPullAnswered` is inlined here as a single-sided check.
    expect(
      hasActivityEvidence({ ...answeredAndEmpty, incomesPullAt: null, expenseCount: 5 }),
    ).toBe(false);
  });
});

describe('shouldMarkFirstRunSeen — the exit condition', () => {
  const base: MarkSeenInputs = { gateOpen: true, seen: false, ...answeredAndEmpty };

  it('marks seen the moment a first transaction is confirmed by the server', () => {
    // Breaks if: the exit is removed. Without it the state ends only because
    // the count changed, and a later pull that came back empty would put a
    // populated account straight back into "add your first expense".
    expect(shouldMarkFirstRunSeen({ ...base, expenseCount: 1 })).toBe(true);
  });

  it('marks seen for an established user who is never shown the state', () => {
    // Breaks if: this is wired to "the user just left the first-run state"
    // instead of to evidence. The established user never enters it, so that
    // version would leave `seen` false for the entire installed base — which
    // is the defect `useFirstRunOnboarding`'s guard 1 exists to fix on native.
    expect(shouldMarkFirstRunSeen({ ...base, expenseCount: 400, incomeCount: 25 })).toBe(true);
  });

  it('does not mark seen for a genuinely empty account', () => {
    // Breaks if: the evidence check is dropped. Marking here would delete the
    // first-run state for exactly the user it is built for, permanently and
    // silently — MMKV is localStorage on web, so it survives every reload.
    expect(shouldMarkFirstRunSeen(base)).toBe(false);
  });

  it('does not mark seen while the pulls are unanswered, whatever the counts say', () => {
    // Breaks if: `hasActivityEvidence` is replaced by a bare count check.
    expect(shouldMarkFirstRunSeen({ ...base, ...unanswered, expenseCount: 9 })).toBe(false);
  });

  it('does not mark seen before the app is ready', () => {
    // Breaks if: `gateOpen` stops being a condition. It writes a permanent
    // flag, and a reading taken mid-bootstrap or mid-sign-out is not evidence
    // of anything — this is the same class of mistake as latching a
    // gate-shut `'suppress'`, one level further down.
    expect(shouldMarkFirstRunSeen({ ...base, gateOpen: false, expenseCount: 1 })).toBe(false);
  });

  it('does not rewrite a flag that is already set', () => {
    // Breaks if: the `seen` short-circuit is dropped. Every render with
    // transactions present would then call `markSeen()` again — an MMKV write
    // and a `set()` on every dashboard render.
    expect(shouldMarkFirstRunSeen({ ...base, seen: true, expenseCount: 1 })).toBe(false);
  });
});
