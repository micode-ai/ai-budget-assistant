/**
 * How the first-run entry cards lay out at a given content width.
 *
 * Pure, so the thresholds are testable without a renderer — the same reason
 * `resolveWebFirstRun`, `resolveSetupSteps` and `webFirstRunView` are pure.
 * Nothing in this repo renders a component in CI, so an off-by-one here would
 * otherwise be invisible until someone resized a browser.
 */

/**
 * At or above this measured content width the three secondary entry cards sit
 * in ONE row, and the setup checklist is laid out as a horizontal band.
 *
 * Both read the same number on purpose: they are stacked full-width siblings,
 * so the width that stops three cards fitting side by side is the same width
 * that stops three checklist steps fitting side by side.
 */
export const FIRST_RUN_ROW_THREE_UP_WIDTH = 900;

/** Below this the three cards go one per row. */
export const FIRST_RUN_ROW_STACK_WIDTH = 620;

export type EntryRowRegime = 'three' | 'twoPlusOne' | 'stacked';

/**
 * `width` is measured with `onLayout` on the row itself — never
 * `useContentWidth()`, which reports the (capped) window. The first-run
 * composition spans the content area left of the sidebar, so the window is
 * always the wrong number by at least `SIDEBAR_WIDTH` plus padding.
 *
 * `null` means "not measured yet" and resolves to `'three'`: that is the
 * regime at every width from 1200 up, which is what this state is designed
 * around, so defaulting to it means no reflow flash on the common case. The
 * narrower bands get one frame of three-up before `onLayout` reports, which
 * cannot clip anything — the row wraps.
 */
export function resolveEntryRowRegime(width: number | null): EntryRowRegime {
  if (width === null) return 'three';
  if (width >= FIRST_RUN_ROW_THREE_UP_WIDTH) return 'three';
  if (width >= FIRST_RUN_ROW_STACK_WIDTH) return 'twoPlusOne';
  return 'stacked';
}

/**
 * `flexBasis` for one card in a wrapping row, paired with `flexGrow: 1`.
 *
 * Percentages rather than arithmetic against the gap: three 30% bases fit one
 * row and a fourth cannot, two 45% bases fit and a third cannot, and `flexGrow`
 * then absorbs the slack exactly. Nothing here has to know the gap's size,
 * which is what keeps it correct when the theme's spacing changes.
 */
export function entryCardBasis(regime: EntryRowRegime): `${number}%` {
  if (regime === 'three') return '30%';
  if (regime === 'twoPlusOne') return '45%';
  return '100%';
}

/**
 * Is the checklist drawn as a horizontal band (steps across) rather than as a
 * stack of rows?
 *
 * Only in the widest regime. A band whose three steps are squeezed under
 * 300px each stops reading as a progress strip and starts reading as three
 * truncated labels.
 */
export function isChecklistBand(regime: EntryRowRegime): boolean {
  return regime === 'three';
}
