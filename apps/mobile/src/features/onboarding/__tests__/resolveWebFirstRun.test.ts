import { resolveWebFirstRun, type WebFirstRunInputs } from '../resolveWebFirstRun';

/**
 * The dashboard's first-run decision on web.
 *
 * Every test below names the single production change that would make it fail.
 * A test that cannot be broken by a named one-line edit pins nothing — this
 * project has shipped one that passed against a deliberately broken
 * implementation — so if a case here has no such note, delete it.
 */

/** A brand-new, editable, empty account whose two pulls have both landed. */
const newUser: WebFirstRunInputs = {
  gateOpen: true,
  seen: false,
  canEdit: true,
  accountId: 'acc-1',
  nextAfter: null,
  expensesPullAt: 1_700_000_000_000,
  incomesPullAt: 1_700_000_000_000,
  expenseCount: 0,
  incomeCount: 0,
};

describe('resolveWebFirstRun', () => {
  describe('the answer is three-valued, never a boolean', () => {
    it('returns each of the three outcomes for the three situations that exist', () => {
      // Breaks if: any of the three returned literals is changed, or if two of
      // the branches are collapsed into one. This is the whole premise — a
      // boolean cannot express "we have not heard back yet", and reading that
      // state as "brand new" is what interrupts a user with years of history.
      expect(resolveWebFirstRun({ ...newUser, expensesPullAt: null })).toBe('wait');
      expect(resolveWebFirstRun(newUser)).toBe('show');
      expect(resolveWebFirstRun({ ...newUser, expenseCount: 1 })).toBe('suppress');
    });
  });

  describe('no pull has answered yet — the state a boolean cannot hold', () => {
    it('waits when neither pull has landed', () => {
      // Breaks if: the `expensesPullAt === null || incomesPullAt === null`
      // clause is deleted. Without it a fresh, offline first paint falls
      // through to the zero count and claims a brand-new user.
      expect(
        resolveWebFirstRun({ ...newUser, expensesPullAt: null, incomesPullAt: null }),
      ).toBe('wait');
    });

    it('waits when only the incomes pull has landed', () => {
      // Breaks if: the `||` between the two null checks becomes `&&`, or if
      // the `expensesPullAt` operand is dropped. The both-null case above
      // survives either mutation, so this one is not redundant with it.
      expect(resolveWebFirstRun({ ...newUser, expensesPullAt: null })).toBe('wait');
    });

    it('waits when only the expenses pull has landed', () => {
      // Breaks if: the `incomesPullAt` operand is dropped from the same clause.
      expect(resolveWebFirstRun({ ...newUser, incomesPullAt: null })).toBe('wait');
    });

    it('treats a pull timestamp of 0 as a real answer, not as absent', () => {
      // Breaks if: the null check is written as `!expensesPullAt` /
      // `!incomesPullAt`. Epoch 0 is not reachable in production, but the
      // falsy form is the natural typo and it silently converts a landed pull
      // into a permanent wait. `null` is the only value meaning "no answer".
      expect(resolveWebFirstRun({ ...newUser, expensesPullAt: 0, incomesPullAt: 0 })).toBe('show');
    });
  });

  describe('both pulls landed', () => {
    it('shows the first-run state for an account the server confirmed is empty', () => {
      // Breaks if: the final returned 'show' is changed to 'suppress' or
      // 'wait'. This is the only path that offers onboarding at all.
      expect(resolveWebFirstRun(newUser)).toBe('show');
    });

    it('suppresses when the account has an expense', () => {
      // Breaks if: `expenseCount` is dropped from the total.
      expect(resolveWebFirstRun({ ...newUser, expenseCount: 1 })).toBe('suppress');
    });

    it('suppresses when the account has only an income', () => {
      // Breaks if: `incomeCount` is dropped from the total (i.e. the check
      // narrows to `expenseCount > 0`). A user who tracks only income is
      // activated and must not be told they are new.
      expect(resolveWebFirstRun({ ...newUser, incomeCount: 1 })).toBe('suppress');
    });

    it('suppresses when the account has both', () => {
      // Breaks if: the sum becomes a comparison of one side only.
      expect(resolveWebFirstRun({ ...newUser, expenseCount: 12, incomeCount: 3 })).toBe('suppress');
    });
  });

  describe('the two guards inherited from shouldShowFirstRun', () => {
    it('suppresses for a viewer, who cannot create a transaction at all', () => {
      // Breaks if: `!canEdit` is dropped from the suppress guard. Offering
      // onboarding to a viewer is a dead end — every entry point it leads to
      // is blocked server-side by ViewerBlockGuard.
      expect(resolveWebFirstRun({ ...newUser, canEdit: false })).toBe('suppress');
    });

    it('suppresses a viewer even before any pull has answered', () => {
      // Breaks if: the suppress guard is moved below the wait check. No other
      // test pins that ordering — with the clauses swapped, a viewer returns
      // 'wait' and the dashboard shows a loading state forever instead of its
      // ordinary content.
      expect(
        resolveWebFirstRun({
          ...newUser,
          canEdit: false,
          expensesPullAt: null,
          incomesPullAt: null,
        }),
      ).toBe('suppress');
    });

    it('suppresses while the email-verification path owns navigation', () => {
      // Breaks if: `nextAfter` is dropped from the suppress guard. That path
      // has already sent the user to /get-started with a destination
      // attached; a second, param-less decision here races it and silently
      // deletes the pricing screen from the registration funnel.
      expect(resolveWebFirstRun({ ...newUser, nextAfter: 'welcome' })).toBe('suppress');
    });

    it('suppresses a pending nextAfter even before any pull has answered', () => {
      // Breaks if: that guard is moved below the wait check — same ordering
      // risk as the viewer case, and the race it exists to prevent happens
      // exactly during the un-answered window.
      expect(
        resolveWebFirstRun({ ...newUser, nextAfter: 'welcome', expensesPullAt: null }),
      ).toBe('suppress');
    });
  });

  describe('the guards that make the decision once', () => {
    it('suppresses once the flag has been seen on this browser', () => {
      // Breaks if: `seen` is dropped from the suppress guard. firstRunStore is
      // MMKV, which on web is localStorage-backed, so this genuinely persists
      // per browser and is what stops the state re-appearing every visit.
      expect(resolveWebFirstRun({ ...newUser, seen: true })).toBe('suppress');
    });

    it('suppresses before an account has been selected', () => {
      // Breaks if: `!accountId` is dropped. With no account there is nothing
      // for the counts to describe, so a zero total is not evidence.
      expect(resolveWebFirstRun({ ...newUser, accountId: null })).toBe('suppress');
    });

    it('treats an empty-string accountId as no account', () => {
      // Breaks if: the check is written `accountId === null`. Several stores
      // carry `currentAccountId || ''`, so the empty string is a real value
      // and it must not be mistaken for a selected account.
      expect(resolveWebFirstRun({ ...newUser, accountId: '' })).toBe('suppress');
    });

    it('suppresses while the cold-start gate is still closed', () => {
      // Breaks if: `gateOpen` is dropped from the suppress guard.
      //
      // NOTE for whoever writes the consuming hook: this is 'suppress', per
      // spec — not 'wait'. A hook that latches its decision on the first
      // 'show' or 'suppress' would therefore latch on the very first render
      // if it were ever rendered with the gate closed, and nobody would see
      // onboarding again. The hook must only run where the gate is already
      // open (the dashboard is behind auth, so it is), or latch on
      // 'show'/'suppress' AND gateOpen.
      expect(resolveWebFirstRun({ ...newUser, gateOpen: false })).toBe('suppress');
    });
  });

  describe('a suppressing condition always wins', () => {
    it('suppresses when a guard fails and the account is also empty and unanswered', () => {
      // Breaks if: any suppress clause is reordered after the wait check, or
      // if the guard's `||` chain becomes `&&` (which would need every
      // condition to fail at once before suppressing).
      expect(
        resolveWebFirstRun({
          gateOpen: false,
          seen: true,
          canEdit: false,
          accountId: null,
          nextAfter: 'welcome',
          expensesPullAt: null,
          incomesPullAt: null,
          expenseCount: 0,
          incomeCount: 0,
        }),
      ).toBe('suppress');
    });

    it('needs every guard to pass before it will ever say show', () => {
      // Breaks if: any single guard is dropped — each case below differs from
      // the showing case in exactly one field.
      const guardFailures: Partial<WebFirstRunInputs>[] = [
        { gateOpen: false },
        { seen: true },
        { canEdit: false },
        { accountId: null },
        { nextAfter: 'welcome' },
      ];
      for (const failure of guardFailures) {
        expect(resolveWebFirstRun({ ...newUser, ...failure })).toBe('suppress');
      }
      expect(resolveWebFirstRun(newUser)).toBe('show');
    });
  });
});
