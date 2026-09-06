import {
  FIRST_RUN_ROW_STACK_WIDTH,
  FIRST_RUN_ROW_THREE_UP_WIDTH,
  entryCardBasis,
  isChecklistBand,
  resolveEntryRowRegime,
} from '../firstRunLayout';

describe('resolveEntryRowRegime', () => {
  it('defaults to three-up before the row has been measured', () => {
    // Breaks if: the `null` case starts returning a narrow regime. `null` is
    // the state of every first render, and the widest regime is right at
    // every width from 1200 up — which is what this screen is designed
    // around, so this is the default that produces no reflow flash there.
    expect(resolveEntryRowRegime(null)).toBe('three');
  });

  it('is three-up exactly AT the threshold, not just above it', () => {
    // Breaks if: `>=` becomes `>`. An off-by-one at a boundary is invisible
    // in this repo — nothing renders a component in CI — and would drop a
    // window sitting exactly on the threshold into a narrower layout.
    expect(resolveEntryRowRegime(FIRST_RUN_ROW_THREE_UP_WIDTH)).toBe('three');
  });

  it('drops to 2+1 one pixel below the three-up threshold', () => {
    // Breaks if: the first comparison is dropped, or the two thresholds are
    // swapped — which would make the wide regime unreachable entirely.
    expect(resolveEntryRowRegime(FIRST_RUN_ROW_THREE_UP_WIDTH - 1)).toBe('twoPlusOne');
  });

  it('stays 2+1 exactly AT the stack threshold', () => {
    // Breaks if: `>=` becomes `>` on the second comparison.
    expect(resolveEntryRowRegime(FIRST_RUN_ROW_STACK_WIDTH)).toBe('twoPlusOne');
  });

  it('stacks one pixel below the stack threshold', () => {
    // Breaks if: the stacked branch is removed and a very narrow container
    // keeps trying to fit two cards across, clipping their labels.
    expect(resolveEntryRowRegime(FIRST_RUN_ROW_STACK_WIDTH - 1)).toBe('stacked');
  });

  it('stacks rather than throwing on a zero or absurd width', () => {
    // Breaks if: a guard is added that treats 0 as "unmeasured" and returns
    // three-up. `onLayout` can legitimately report 0 for one frame on web,
    // and three cards at 0px is the one answer that clips.
    expect(resolveEntryRowRegime(0)).toBe('stacked');
  });

  it('keeps the two thresholds ordered', () => {
    // Breaks if: someone edits one constant without the other. With the
    // stack threshold above the three-up one, the 2+1 regime becomes
    // unreachable and the row jumps straight from three to stacked.
    expect(FIRST_RUN_ROW_STACK_WIDTH).toBeLessThan(FIRST_RUN_ROW_THREE_UP_WIDTH);
  });
});

describe('entryCardBasis', () => {
  it('gives three cards a basis that fits three per row and not four', () => {
    // Breaks if: the basis rises above 33.33%. `flexBasis` + `flexGrow` in a
    // wrapping row is what produces the columns without any arithmetic
    // against the gap; a basis that does not leave room for three defeats
    // the whole mechanism silently — the row simply wraps differently.
    expect(Number.parseFloat(entryCardBasis('three'))).toBeLessThanOrEqual(33.33);
    expect(Number.parseFloat(entryCardBasis('three')) * 3).toBeLessThanOrEqual(100);
  });

  it('gives two cards a basis that fits two per row and not three', () => {
    // Breaks if: the 2+1 basis drops to a third, which would put all three
    // on one row and make the regime indistinguishable from three-up.
    const basis = Number.parseFloat(entryCardBasis('twoPlusOne'));
    expect(basis * 2).toBeLessThanOrEqual(100);
    expect(basis * 3).toBeGreaterThan(100);
  });

  it('gives a stacked card the full row', () => {
    // Breaks if: the stacked basis is anything under 100%, which would let a
    // second card share the row at the width chosen precisely because two do
    // not fit.
    expect(entryCardBasis('stacked')).toBe('100%');
  });
});

describe('isChecklistBand', () => {
  it('is a band only in the widest regime', () => {
    // Breaks if: the band is drawn in a narrow regime. Three steps squeezed
    // under ~300px each stop reading as a progress strip and start reading as
    // three truncated labels — and the band deliberately drops its hint
    // lines, so a truncated title is all that is left.
    expect(isChecklistBand('three')).toBe(true);
    expect(isChecklistBand('twoPlusOne')).toBe(false);
    expect(isChecklistBand('stacked')).toBe(false);
  });

  it('switches at the same width as the card row', () => {
    // Breaks if: the band grows its own threshold. The design ties them
    // together ("the checklist band becomes a stack at the same first
    // threshold"), and they are stacked full-width siblings, so the width
    // that stops three cards fitting is the width that stops three steps
    // fitting.
    expect(isChecklistBand(resolveEntryRowRegime(FIRST_RUN_ROW_THREE_UP_WIDTH))).toBe(true);
    expect(isChecklistBand(resolveEntryRowRegime(FIRST_RUN_ROW_THREE_UP_WIDTH - 1))).toBe(false);
  });
});
