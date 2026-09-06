/**
 * The pane row cap. Each test names the production change that reddens it.
 *
 * The two that matter most are the boundary and the pairing: an off-by-one at
 * the cap produces a "+0 more" button that cannot be pressed, and a `hasMore`
 * that could be true with `hiddenCount` 0 (or false with a positive one) is the
 * silent-truncation defect the cap exists to avoid.
 */

import { resolvePaneListWindow } from '../paneListWindow';

describe('resolvePaneListWindow', () => {
  // Catches: applying a cap when the caller passed none. Every existing
  // `SettingsScreenList` caller is in this case, so it is also what keeps the
  // cap from reaching a screen that did not ask for one.
  it('does not cap when no cap is given', () => {
    expect(resolvePaneListWindow(1120, undefined, false)).toEqual({
      visibleCount: 1120,
      hiddenCount: 0,
      hasMore: false,
    });
  });

  // Catches: dropping the `expanded` short-circuit, which would re-hide the
  // rows the moment the user pressed the button that revealed them.
  it('does not cap once the user has expanded', () => {
    expect(resolvePaneListWindow(1120, 100, true)).toEqual({
      visibleCount: 1120,
      hiddenCount: 0,
      hasMore: false,
    });
  });

  it('caps and reports what it withheld', () => {
    expect(resolvePaneListWindow(1120, 100, false)).toEqual({
      visibleCount: 100,
      hiddenCount: 1020,
      hasMore: true,
    });
  });

  // Catches: `<` where `<=` belongs. At exactly the cap nothing is withheld, so
  // an affordance there would read "+0 more" and do nothing when pressed.
  it('shows no affordance at exactly the cap', () => {
    expect(resolvePaneListWindow(100, 100, false)).toEqual({
      visibleCount: 100,
      hiddenCount: 0,
      hasMore: false,
    });
  });

  it('shows the affordance one row past the cap', () => {
    expect(resolvePaneListWindow(101, 100, false)).toMatchObject({
      visibleCount: 100,
      hiddenCount: 1,
      hasMore: true,
    });
  });

  it('does not cap a collection shorter than the cap', () => {
    expect(resolvePaneListWindow(7, 100, false)).toEqual({
      visibleCount: 7,
      hiddenCount: 0,
      hasMore: false,
    });
  });

  // Catches: treating a non-positive cap as a real one. `desktopMaxRows={0}`
  // would otherwise render an empty list under a "+1120 more" button -- a worse
  // failure than not capping, and the shape a mistyped constant produces.
  it.each([0, -5])('treats a non-positive cap (%p) as no cap', (cap) => {
    expect(resolvePaneListWindow(1120, cap, false)).toEqual({
      visibleCount: 1120,
      hiddenCount: 0,
      hasMore: false,
    });
  });

  // Catches: removing the finiteness guards. A NaN cap compares false against
  // everything, so without the guard it would fall through to the capped branch
  // and produce NaN counts in the label.
  it.each([NaN, Infinity])('treats a non-finite cap (%p) as no cap', (cap) => {
    expect(resolvePaneListWindow(1120, cap, false)).toEqual({
      visibleCount: 1120,
      hiddenCount: 0,
      hasMore: false,
    });
  });

  it('handles an empty collection', () => {
    expect(resolvePaneListWindow(0, 100, false)).toEqual({
      visibleCount: 0,
      hiddenCount: 0,
      hasMore: false,
    });
  });

  // The invariant the caller relies on, asserted across the whole boundary
  // rather than at one point: `hasMore` and a positive `hiddenCount` are the
  // same fact, and the two parts always sum to the total. A cap that could
  // withhold rows without saying so is exactly the defect being avoided.
  it('never withholds a row without saying so', () => {
    for (const total of [0, 1, 99, 100, 101, 1120]) {
      const w = resolvePaneListWindow(total, 100, false);
      expect(w.hasMore).toBe(w.hiddenCount > 0);
      expect(w.visibleCount + w.hiddenCount).toBe(total);
      expect(w.visibleCount).toBeLessThanOrEqual(total);
    }
  });
});
