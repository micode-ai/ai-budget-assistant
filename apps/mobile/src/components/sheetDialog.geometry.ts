/**
 * The one rule a bottom-anchored sheet has to get right, in a file a test can
 * reach.
 *
 * The app is edge-to-edge, so the system navigation bar overlays the modal
 * window. A sheet anchored to the bottom with a FIXED `paddingBottom` puts its
 * last row underneath that bar — on a three-button-nav device (~48dp) the row
 * is not merely clipped but untappable. ABA-483 fixed eight sheets this way,
 * one hand-copied `Math.max(insets.bottom, …) + …` at a time, and the copies
 * did not even agree with each other. `SheetDialog` is the wrapper that owns
 * the composition so a ninth sheet cannot reintroduce it; this module is the
 * arithmetic, split out because a rule that lives in a `.tsx` cannot be tested
 * (nothing in this repo renders a component in CI).
 *
 * The shape is `max(inset, floor) + pad`, which covers both hand-written forms
 * found in the tree:
 *
 * - `pad` alone (`floor: 0`) is ABA-483's canonical `<base> + insets.bottom`.
 * - `floor` is the older `Math.max(insets.bottom, 24) + 16` form the settings
 *   sheets use — a guaranteed minimum that also clears the bar. It is kept as
 *   a parameter, rather than normalised away, because normalising would move
 *   the phone's pixels on shipped screens; a NEW sheet should pass neither and
 *   take the default.
 *
 * Whatever the parameters, the result is never less than the inset, which is
 * the property that actually matters and the one the tests pin.
 */

/** Padding above the system inset when a call site says nothing. */
export const SHEET_BOTTOM_PADDING = 24;

export interface SheetBottomPaddingOptions {
  /** Padding that sits ABOVE the system inset. Defaults to `SHEET_BOTTOM_PADDING`. */
  padBottom?: number;
  /** Minimum the inset is raised to before `padBottom` is added. Defaults to 0. */
  insetFloor?: number;
}

export function sheetBottomPadding(
  bottomInset: number,
  { padBottom = SHEET_BOTTOM_PADDING, insetFloor = 0 }: SheetBottomPaddingOptions = {},
): number {
  // A safe-area provider that has not measured yet reports 0; some report the
  // value asynchronously and a NaN would poison the whole style object, so an
  // unusable reading is treated as "no bar" rather than propagated.
  const inset = Number.isFinite(bottomInset) && bottomInset > 0 ? bottomInset : 0;
  const floor = Number.isFinite(insetFloor) && insetFloor > 0 ? insetFloor : 0;
  const pad = Number.isFinite(padBottom) && padBottom > 0 ? padBottom : 0;
  return Math.max(inset, floor) + pad;
}
