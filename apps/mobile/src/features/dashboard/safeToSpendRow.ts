/**
 * Whether the desktop hero should draw the Safe-to-Spend figure at all.
 *
 * ## The bug this exists to stop
 *
 * `useSafeToSpend` reports `hasEnoughData` as `data !== null`, and the server
 * answers an empty account with real, well-formed zeros — so on a brand-new
 * account the hook says "enough data" while holding none, and the hero prints
 * `0,00 zł` as a statement about the user's money. A blank is honest; an
 * invitation is honest; a zero is a claim, and it is false.
 *
 * ## Why this is not an invented rule
 *
 * `useSafeToSpend`'s own OFFLINE branch already refuses exactly this case:
 *
 *     const hasWalletData = walletSummary.length > 0;
 *     if (!hasWalletData) return null; // not enough data for a meaningful number
 *
 * The local fallback has always declined to produce a number without a wallet
 * balance. The server path simply never had the same guard applied to it. This
 * function applies the condition the hook already holds itself to.
 *
 * ## Why it lives here and not in the hook
 *
 * `HomeHeroHeader` renders the same hook on the phone, so correcting
 * `hasEnoughData` inside `useSafeToSpend` would change the mobile rendering —
 * which this branch may not do. Gating at the desktop call site (`FocusColumn`)
 * leaves the phone byte-identical. This module is deliberately under
 * `features/dashboard/` rather than beside the hook in `features/insights/`,
 * so that nobody reads it as part of the hook's contract and wires it in
 * there: the hook's contract is still wrong, and correcting it needs a product
 * decision and a store release.
 */

export interface SafeToSpendRowInputs {
  /** `widgetVisibility.safeToSpend` — the user's own on/off switch. */
  widgetVisible: boolean;
  /** `useSafeToSpend().hasEnoughData`, as it is today. */
  hasEnoughData: boolean;
  /** Whether the hook actually returned a payload to render. */
  hasData: boolean;
  /**
   * `walletSummary.length` — one entry per currency the account holds money
   * in. Zero means the app has no balance to reason from, so any figure it
   * prints is arithmetic on nothing.
   */
  walletCurrencyCount: number;
}

/**
 * All four conditions, `&&`-joined, order irrelevant.
 *
 * A pending wallet pull reads as zero currencies here and therefore suppresses
 * the row, which is the safe direction: the figure appears a moment late
 * instead of appearing wrong and then correcting itself.
 */
export function shouldShowSafeToSpendRow({
  widgetVisible,
  hasEnoughData,
  hasData,
  walletCurrencyCount,
}: SafeToSpendRowInputs): boolean {
  return widgetVisible && hasEnoughData && hasData && walletCurrencyCount > 0;
}
