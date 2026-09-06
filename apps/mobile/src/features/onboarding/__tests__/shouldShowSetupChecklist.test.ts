import {
  resolveSetupSteps,
  shouldShowSetupChecklist,
  type SetupChecklistVisibilityInputs,
} from '../resolveSetupSteps';

/**
 * Whether the ORDINARY desktop rail draws the setup checklist.
 *
 * Every test below names the single production change that would make it
 * fail. A test that cannot be broken by a named one-line edit pins nothing, so
 * if a case here has no such note, delete it.
 */

/** Nothing set up yet — all three rows outstanding. */
const outstanding = resolveSetupSteps({
  expenseCount: 0,
  incomeCount: 0,
  walletCurrencyCount: 0,
  budgetCount: 0,
});

/** A fully configured account — every row ticked. */
const allDone = resolveSetupSteps({
  expenseCount: 4,
  incomeCount: 1,
  walletCurrencyCount: 2,
  budgetCount: 1,
});

/** The one situation that draws the card: an editor, on the ordinary
 *  dashboard, with every source answered and work still to do. */
const showing: SetupChecklistVisibilityInputs = {
  isDashboardView: true,
  canEdit: true,
  transactionPullAnswered: true,
  walletPullAnswered: true,
  dismissed: false,
  steps: outstanding,
};

describe('shouldShowSetupChecklist', () => {
  it('draws the card for an editor with outstanding steps and every pull answered', () => {
    // Breaks if: any condition is inverted. This is the only combination that
    // may render the card, so without it the feature could be dead and every
    // other test here would still pass.
    expect(shouldShowSetupChecklist(showing)).toBe(true);
  });

  it('stays silent until the WALLET pull has answered', () => {
    // Breaks if: `walletPullAnswered` is dropped from the guard.
    //
    // THIS IS THE NEW CONDITION. The wallet row's tick is
    // `walletSummary.length > 0`, and on web every local read returns empty
    // until the server answers — so a fully configured user watched "Set your
    // wallet balance" appear and then vanish, the card instructing them to do
    // something they did months ago. Note the steps here are ALL DONE: with
    // the real (answered) counts the card would not render at all, and it is
    // only the unanswered reading that manufactures an outstanding row.
    expect(
      shouldShowSetupChecklist({ ...showing, walletPullAnswered: false, steps: outstanding }),
    ).toBe(false);
    // ...and once it answers with the real figures, still silent — because
    // there is now genuinely nothing left to do.
    expect(shouldShowSetupChecklist({ ...showing, steps: allDone })).toBe(false);
  });

  it('stays silent until the transaction pulls have answered', () => {
    // Breaks if: `transactionPullAnswered` is dropped. Same failure through
    // the other two rows: after the wait bound elapses the view becomes
    // 'dashboard' with the server possibly still silent, and the card would
    // tell an established user to add their first transaction.
    expect(shouldShowSetupChecklist({ ...showing, transactionPullAnswered: false })).toBe(false);
  });

  it('needs BOTH pulls, not merely one of them', () => {
    // Breaks if: the `||` joining the two pull checks becomes `&&`, which
    // would demand that both be missing before staying silent — so a single
    // unanswered source would still render a wrong row. Neither
    // single-condition test above catches that mutation on its own.
    expect(
      shouldShowSetupChecklist({
        ...showing,
        transactionPullAnswered: true,
        walletPullAnswered: false,
      }),
    ).toBe(false);
    expect(
      shouldShowSetupChecklist({
        ...showing,
        transactionPullAnswered: false,
        walletPullAnswered: true,
      }),
    ).toBe(false);
  });

  it('disappears once every step is done, with no dismissal needed', () => {
    // Breaks if: the final `!isSetupComplete(steps)` is dropped or inverted.
    // The card's own exit is completion, not a close button.
    expect(shouldShowSetupChecklist({ ...showing, steps: allDone })).toBe(false);
  });

  it('respects a dismissal', () => {
    // Breaks if: `dismissed` is dropped. The user closed it; it must stay
    // closed across reloads, which is why the flag is persisted.
    expect(shouldShowSetupChecklist({ ...showing, dismissed: true })).toBe(false);
  });

  it('stays silent for a viewer, who cannot do any of the three things', () => {
    // Breaks if: `canEdit` is dropped. Every row navigates to a write screen
    // blocked server-side by ViewerBlockGuard, so the card would be a list of
    // three dead ends.
    expect(shouldShowSetupChecklist({ ...showing, canEdit: false })).toBe(false);
  });

  it('stays silent outside the ordinary dashboard view', () => {
    // Breaks if: `isDashboardView` is dropped. The first-run rail renders the
    // card itself, unconditionally; without this the loading state would draw
    // it too, beside the spinner that exists because nothing is known yet.
    expect(shouldShowSetupChecklist({ ...showing, isDashboardView: false })).toBe(false);
  });

  it('will not render on an empty step list', () => {
    // Breaks if: a caller pre-filters the done steps out before passing them.
    // `[].every(...)` is `true`, so an empty list reads as fully set up —
    // which is the safe direction here, and this pins that it stays so rather
    // than becoming an always-render.
    expect(shouldShowSetupChecklist({ ...showing, steps: [] })).toBe(false);
  });

  it('needs every condition, so no single one can be quietly removed', () => {
    // Breaks if: ANY one of the six is dropped — each case differs from the
    // showing one in exactly one field.
    const failures: Partial<SetupChecklistVisibilityInputs>[] = [
      { isDashboardView: false },
      { canEdit: false },
      { transactionPullAnswered: false },
      { walletPullAnswered: false },
      { dismissed: true },
      { steps: allDone },
    ];
    for (const failure of failures) {
      expect(shouldShowSetupChecklist({ ...showing, ...failure })).toBe(false);
    }
    expect(shouldShowSetupChecklist(showing)).toBe(true);
  });
});
