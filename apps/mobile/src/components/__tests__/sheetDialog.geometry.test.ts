import {
  sheetBottomPadding,
  SHEET_BOTTOM_PADDING,
} from '../sheetDialog.geometry';

/**
 * Each block names the production change it exists to catch. The suite is
 * worth having only because ABA-483's bug was arithmetic, was invisible to
 * `tsc` and to every other test in this repo, and was found eight times by
 * hand on a device.
 */
describe('sheetBottomPadding', () => {
  // Would fail if the `+ inset` / `Math.max(inset, …)` were dropped from the
  // wrapper's formula — i.e. if a sheet went back to a fixed bottom padding,
  // which is exactly ABA-483.
  describe('always clears the system navigation bar', () => {
    it.each([0, 16, 24, 34, 48, 64])('inset %ipx', (inset) => {
      expect(sheetBottomPadding(inset)).toBeGreaterThanOrEqual(inset);
      expect(sheetBottomPadding(inset, { padBottom: 0 })).toBeGreaterThanOrEqual(inset);
      expect(sheetBottomPadding(inset, { padBottom: 16, insetFloor: 24 })).toBeGreaterThanOrEqual(inset);
      expect(sheetBottomPadding(inset, { padBottom: 0, insetFloor: 32 })).toBeGreaterThanOrEqual(inset);
    });
  });

  // Would fail if the default stopped leaving room above the bar — a sheet
  // whose last button ends exactly at the nav bar's top edge is unpleasant
  // even when it is technically tappable.
  it('leaves padding above the inset by default', () => {
    expect(sheetBottomPadding(48)).toBe(48 + SHEET_BOTTOM_PADDING);
    expect(sheetBottomPadding(0)).toBe(SHEET_BOTTOM_PADDING);
  });

  // Would fail if `padBottom` and `insetFloor` were transposed in the
  // signature or at a call site: the two produce different numbers for every
  // inset below the floor, and a transposed pair is otherwise silent.
  describe('reproduces the formulas the shipped sheets use', () => {
    it('the settings sheets: max(inset, 24) + 16', () => {
      const legacy = (inset: number) => Math.max(inset, 24) + 16;
      for (const inset of [0, 16, 24, 34, 48]) {
        expect(sheetBottomPadding(inset, { padBottom: 16, insetFloor: 24 })).toBe(legacy(inset));
      }
    });

    it('the safe-to-spend sheet: inset + 32', () => {
      for (const inset of [0, 34, 48]) {
        expect(sheetBottomPadding(inset, { padBottom: 32 })).toBe(inset + 32);
      }
    });

    it('the colour picker: inset + 16', () => {
      for (const inset of [0, 34, 48]) {
        expect(sheetBottomPadding(inset, { padBottom: 16 })).toBe(inset + 16);
      }
    });

    it('the financial-health panel: max(inset, 32), unchanged where there is no bar', () => {
      // Its shipped value was a flat 32 with no inset at all, so the two agree
      // on a device with no navigation bar and differ only where that flat 32
      // was the defect.
      expect(sheetBottomPadding(0, { padBottom: 0, insetFloor: 32 })).toBe(32);
      expect(sheetBottomPadding(24, { padBottom: 0, insetFloor: 32 })).toBe(32);
      expect(sheetBottomPadding(48, { padBottom: 0, insetFloor: 32 })).toBe(48);
    });
  });

  // Would fail if the guards were removed: `useSafeAreaInsets()` can report 0
  // before it has measured, and a NaN anywhere in a style object silently
  // voids the whole property rather than throwing.
  describe('never returns an unusable number', () => {
    it('treats an unmeasured or nonsense inset as no bar', () => {
      expect(sheetBottomPadding(Number.NaN)).toBe(SHEET_BOTTOM_PADDING);
      expect(sheetBottomPadding(-10)).toBe(SHEET_BOTTOM_PADDING);
      expect(sheetBottomPadding(Number.POSITIVE_INFINITY)).toBe(SHEET_BOTTOM_PADDING);
    });

    it('ignores nonsense options rather than propagating them', () => {
      expect(sheetBottomPadding(48, { padBottom: Number.NaN })).toBe(48);
      expect(sheetBottomPadding(48, { insetFloor: Number.NaN })).toBe(48 + SHEET_BOTTOM_PADDING);
      expect(Number.isFinite(sheetBottomPadding(48, { padBottom: Number.NaN, insetFloor: Number.NaN }))).toBe(true);
    });
  });
});
