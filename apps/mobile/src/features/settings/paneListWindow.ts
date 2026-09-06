/**
 * How many rows a settings pane renders, and how many it withholds.
 *
 * This exists as a module rather than a few lines inside
 * `SettingsScreenList.tsx` for the reason this branch has already paid for
 * twice: a rule that lives in a `.tsx` cannot be tested, and nothing in this
 * repo renders a component in CI.
 *
 * ## Why a pane caps at all
 *
 * A settings pane has no scroller of its own -- the shell owns the page scroll
 * -- so the list it renders is rendered in full, in one commit. On the products
 * pane, whose list is one row per distinct product ever scanned and which the
 * API returns with no `take` and no pagination, that measured 12,359 DOM
 * elements and 67,894px of content for ~1,120 products.
 *
 * The full-page path is unaffected and must stay so: there the screen keeps its
 * `FlatList`, which genuinely windows, because inside `SettingsScreenFrame`'s
 * `flex: 1` `SafeAreaView` the list's laid-out height really is the viewport.
 * The cap is a desktop answer to a desktop problem.
 *
 * ## What makes a cap honest here
 *
 * Truncation is only acceptable when it is *stated*. `hasMore` is what the
 * caller renders an affordance from, and `hiddenCount` is what it says -- so a
 * capped list always announces that there is more, and how much more. A cap
 * that produced no affordance would be the silent-truncation defect this
 * function exists to avoid, which is why the two travel together.
 *
 * The other half of honesty is not here but at the call site: a search must
 * filter the FULL collection and be capped afterwards, never the other way
 * round. Capping first would make a product unreachable by searching for it,
 * which is worse than any row count.
 */

export interface PaneListWindow {
  /** How many rows to render, from the start of the collection. */
  visibleCount: number;
  /** How many are withheld. Always 0 when {@link hasMore} is false. */
  hiddenCount: number;
  /** Whether to render the "show more" affordance. */
  hasMore: boolean;
}

/**
 * @param total     Rows the caller has, AFTER any filtering.
 * @param maxRows   The cap, or `undefined` for none. A non-positive or
 *                  non-finite value is treated as no cap: a cap of zero would
 *                  render an empty list under a "+N more" button, which is a
 *                  worse failure than not capping, and no product decision
 *                  produces one.
 * @param expanded  Whether the user has already asked for the whole list.
 */
export function resolvePaneListWindow(
  total: number,
  maxRows: number | undefined,
  expanded: boolean,
): PaneListWindow {
  const count = Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0;
  const uncapped: PaneListWindow = { visibleCount: count, hiddenCount: 0, hasMore: false };

  if (expanded) return uncapped;
  if (maxRows === undefined || !Number.isFinite(maxRows) || maxRows <= 0) return uncapped;

  const cap = Math.trunc(maxRows);
  // `<=`, not `<`: a collection exactly at the cap is fully rendered, so
  // announcing "+0 more" would be both untrue and unpressable.
  if (count <= cap) return uncapped;

  return { visibleCount: cap, hiddenCount: count - cap, hasMore: true };
}
