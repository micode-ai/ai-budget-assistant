import { shouldShowSafeToSpendRow, type SafeToSpendRowInputs } from '../safeToSpendRow';

/**
 * Whether the desktop hero draws the Safe-to-Spend figure.
 *
 * Every test below names the single production change that would make it
 * fail. A test that cannot be broken by a named one-line edit pins nothing, so
 * if a case here has no such note, delete it.
 */

/** A visible widget, a server answer in hand, and one currency of real money. */
const drawable: SafeToSpendRowInputs = {
  widgetVisible: true,
  hasEnoughData: true,
  hasData: true,
  walletCurrencyCount: 1,
};

describe('shouldShowSafeToSpendRow', () => {
  it('draws the figure when the account actually holds money', () => {
    // Breaks if: any condition is inverted. This is the only combination that
    // may ever print a number, so without it the whole hero could go dark and
    // every other test here would still pass.
    expect(shouldShowSafeToSpendRow(drawable)).toBe(true);
  });

  it('suppresses the figure for an account with no wallet balance at all', () => {
    // Breaks if: `walletCurrencyCount > 0` is dropped.
    //
    // THIS IS THE WHOLE POINT. `useSafeToSpend.hasEnoughData` is
    // `data !== null`, and the API answers an empty account with real, well
    // formed zeros — so the hook reports "enough data" while holding none and
    // the hero printed `0,00 zł` as a claim about the user's money. Every
    // other input here is `true` in that situation, which is precisely why no
    // pre-existing condition caught it.
    expect(shouldShowSafeToSpendRow({ ...drawable, walletCurrencyCount: 0 })).toBe(false);
  });

  it('is a count, not a truthiness check on the array', () => {
    // Breaks if: the caller is changed to pass `!!walletSummary` (an empty
    // array is truthy in JS, so the guard would be a no-op) or the comparison
    // becomes `>= 0`, which is true for every possible count.
    expect(shouldShowSafeToSpendRow({ ...drawable, walletCurrencyCount: 0 })).toBe(false);
    expect(shouldShowSafeToSpendRow({ ...drawable, walletCurrencyCount: 3 })).toBe(true);
  });

  it('respects the user turning the widget off', () => {
    // Breaks if: `widgetVisible` is dropped. The row would then reappear for a
    // user who explicitly hid it in Settings.
    expect(shouldShowSafeToSpendRow({ ...drawable, widgetVisible: false })).toBe(false);
  });

  it('still honours the hook saying it has nothing', () => {
    // Breaks if: `hasEnoughData` is dropped. The new wallet condition ADDS to
    // the existing ones and replaces none of them — the hook's own `null`
    // answer (its offline branch, an unfetched account) must keep winning.
    expect(shouldShowSafeToSpendRow({ ...drawable, hasEnoughData: false })).toBe(false);
  });

  it('will not render a row with no payload behind it', () => {
    // Breaks if: `hasData` is dropped. The hero dereferences
    // `safeToSpend.data.safeToSpendToday`, so this is the guard standing
    // between a missing payload and a crash on the first screen after sign-in.
    expect(shouldShowSafeToSpendRow({ ...drawable, hasData: false })).toBe(false);
  });

  it('needs every condition, so no single one can be quietly removed', () => {
    // Breaks if: ANY one of the four is dropped — each case below differs
    // from the drawable one in exactly one field, and the `&&` chain becoming
    // an `||` fails here too.
    const failures: Partial<SafeToSpendRowInputs>[] = [
      { widgetVisible: false },
      { hasEnoughData: false },
      { hasData: false },
      { walletCurrencyCount: 0 },
    ];
    for (const failure of failures) {
      expect(shouldShowSafeToSpendRow({ ...drawable, ...failure })).toBe(false);
    }
    expect(shouldShowSafeToSpendRow(drawable)).toBe(true);
  });
});
