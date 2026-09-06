import { Platform, useWindowDimensions } from 'react-native';

export const DESKTOP_MIN_WIDTH = 1024;
// Wide so that on a typical laptop the content column fills the space right of
// the sidebar — keeping the page scrollbar at the right edge (a "general" scroll)
// rather than floating mid-page. Centers with small side margins only on very
// wide monitors.
export const CONTENT_MAX_WIDTH = 1080;
export const SIDEBAR_WIDTH = 240;
// Height of the full-width desktop top bar (brand + global controls).
export const TOP_BAR_HEIGHT = 56;
export const COLUMN_HORIZONTAL_PADDING = 16;
/**
 * `WebTopBar`'s own horizontal padding.
 *
 * It lives here rather than only in that file because two panels anchored to
 * controls IN that bar — the account menu and the alerts inbox — need the same
 * number to line their right edge up with the trigger that opened them, and
 * neither may import `WebTopBar`: a child importing its parent would drag the
 * whole desktop bar into the native graph, which is exactly what
 * `WebShell.tsx`'s no-op split exists to prevent. Three hand-copied literals
 * drifting is what breaks that alignment, invisibly and only at one width, so
 * the shared constants module is the right home — the same role
 * `DESKTOP_MIN_WIDTH` and `SECOND_RAIL_MIN_WIDTH` already play.
 */
export const WEB_TOP_BAR_PADDING_X = 20;
// Below this, the facet rail collapses to a labelled dropdown in the screen's
// top bar (design spec decision 6's "1024-1439" regime) — a side rail next to
// a five-column table doesn't fit in that band. This is a SEPARATE threshold
// from DESKTOP_MIN_WIDTH: 1024-1439 is still "desktop", just the one regime
// where the layout concedes.
export const FACET_RAIL_MIN_WIDTH = 1440;
// Dashboard round 6: a second 300px rail column beside the first, so a
// wide-enough window shows two standing columns instead of one very long
// one. At 1920px this yields 40 outer padding + a fluid focus column +
// 20 gap + 300 + 20 gap + 300 (verified against a real deployed build).
// Below this, exactly one rail — same as before round 6.
export const SECOND_RAIL_MIN_WIDTH = 1680;
// Addendum 2: each setup-checklist cell in the first-run band is `flex: 1`
// capped at this width, with the row left-packed — NOT equal thirds. An equal
// split of 1640px of content guarantees ~400px of nothing inside every cell,
// and the band sits directly under the row of three entry cards, so a
// stretched echo of that rhythm holding a fifth of the content reads as the
// same row, broken. The cap only bites above ~1300px of content width, so
// 1440 and 1200 fill naturally and the leftover lands at the band's right
// edge — one void, at an edge, which is ordinary for a card holding a
// horizontal list. A starting value to be judged by eye: nothing in this repo
// renders a component in CI.
export const CHECKLIST_CELL_MAX_WIDTH = 420;
// The settings shell's left pane (ABA-508). Between SIDEBAR_WIDTH (240) and
// the alerts panel (400): settings labels are longer than nav labels and
// shorter than alert bodies. Fixed, never fluid — the pane beside it is what
// absorbs the window's width. It lives here rather than beside the shell for
// the same reason WEB_TOP_BAR_PADDING_X does: it is the one number two
// separate things (the pane's own width and the content offset beside it)
// have to agree on, and a hand-copied literal drifting is invisible until a
// human looks at one width.
export const SETTINGS_NAV_WIDTH = 280;

/** Pure gate — true only on web at desktop width. Native never qualifies. */
export function isDesktopWeb(width: number): boolean {
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}

/** Reactive hook form: re-evaluates on browser resize. */
export function useIsDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  return isDesktopWeb(width);
}
