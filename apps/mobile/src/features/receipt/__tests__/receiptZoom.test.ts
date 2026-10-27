import {
  MIN_SCALE,
  MAX_SCALE,
  DOUBLE_TAP_SCALE,
  FIT_STATE,
  fitSize,
  clampScale,
  clampTranslate,
  zoomAround,
  zoomTo,
  toggleZoom,
  panBy,
  isZoomed,
  wheelZoomFactor,
  isTapRelease,
  isDoubleTap,
  shouldHandleDoubleClick,
  DOUBLE_TAP_MAX_MS,
  DOUBLE_TAP_SLOP_PX,
  DBLCLICK_AFTER_TOUCH_SUPPRESS_MS,
} from '../receiptZoom';

const viewport = { width: 400, height: 800 };

describe('fitSize', () => {
  it('fits a tall receipt to the viewport height, keeping its aspect ratio', () => {
    expect(fitSize({ width: 800, height: 3200 }, viewport)).toEqual({ width: 200, height: 800 });
  });

  it('fits a wide image to the viewport width', () => {
    expect(fitSize({ width: 1600, height: 800 }, viewport)).toEqual({ width: 400, height: 200 });
  });

  it('scales a small image UP to fit, as resizeMode="contain" does', () => {
    expect(fitSize({ width: 100, height: 200 }, viewport)).toEqual({ width: 400, height: 800 });
  });

  it('falls back to the viewport when the image size is not known yet', () => {
    expect(fitSize(null, viewport)).toEqual(viewport);
    expect(fitSize({ width: 0, height: 0 }, viewport)).toEqual(viewport);
  });

  it('returns zero size for an unmeasured viewport', () => {
    expect(fitSize({ width: 800, height: 1600 }, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });
});

describe('clampScale', () => {
  it('never goes below fit', () => {
    expect(clampScale(0.3)).toBe(MIN_SCALE);
  });

  it('never goes above the maximum', () => {
    expect(clampScale(12)).toBe(MAX_SCALE);
  });

  it('keeps a scale inside the range', () => {
    expect(clampScale(2.2)).toBe(2.2);
  });

  it('treats a non-finite scale as fit', () => {
    expect(clampScale(NaN)).toBe(MIN_SCALE);
    expect(clampScale(Infinity)).toBe(MIN_SCALE);
  });
});

describe('clampTranslate', () => {
  it('centres content that is no larger than the viewport on that axis', () => {
    // 200pt wide content at 1.5x = 300pt, still narrower than 400pt
    expect(clampTranslate(80, 1.5, 200, 400)).toBe(0);
  });

  it('allows panning up to the edge of the scaled content and no further', () => {
    // 200pt at 3x = 600pt in a 400pt viewport: 100pt of overflow per side
    expect(clampTranslate(90, 3, 200, 400)).toBe(90);
    expect(clampTranslate(150, 3, 200, 400)).toBe(100);
    expect(clampTranslate(-150, 3, 200, 400)).toBe(-100);
  });

  it('is zero at fit', () => {
    expect(clampTranslate(50, 1, 400, 400)).toBe(0);
  });
});

describe('zoomAround', () => {
  it('keeps the content point under the focal point fixed', () => {
    const focal = 100;
    const t0 = 0;
    const t1 = zoomAround(focal, 1, 2, t0);
    // content point under focal before: (100 - 0) / 1 = 100; after: (100 - t1) / 2
    expect((focal - t1) / 2).toBeCloseTo(100);
  });

  it('does not move when zooming around the centre from a centred state', () => {
    expect(zoomAround(0, 1, 3, 0)).toBe(0);
  });

  it('works from an already-panned, zoomed state', () => {
    const t1 = zoomAround(-50, 2, 4, 30);
    expect((-50 - t1) / 4).toBeCloseTo((-50 - 30) / 2);
  });
});

describe('zoomTo', () => {
  const content = { width: 400, height: 800 };

  it('zooms around the focal point and clamps the result to the edges', () => {
    const s = zoomTo(FIT_STATE, 2.5, { x: 150, y: 300 }, content, viewport);
    expect(s.scale).toBe(2.5);
    // unclamped x would be 150 - 2.5 * 150 = -225; overflow is (1000 - 400) / 2 = 300
    expect(s.x).toBeCloseTo(-225);
    expect(s.y).toBeCloseTo(-450);
  });

  it('clamps a focal point near the corner so no empty space shows', () => {
    const s = zoomTo(FIT_STATE, 2, { x: 200, y: 400 }, content, viewport);
    // unclamped: 200 - 2 * 200 = -200, overflow (800 - 400) / 2 = 200
    expect(s.x).toBe(-200);
    expect(s.y).toBe(-400);
  });

  it('clamps the requested scale', () => {
    expect(zoomTo(FIT_STATE, 9, { x: 0, y: 0 }, content, viewport).scale).toBe(MAX_SCALE);
    const back = zoomTo({ scale: 3, x: 100, y: 100 }, 0.5, { x: 0, y: 0 }, content, viewport);
    expect(back).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe('toggleZoom (double-tap / double-click)', () => {
  const content = { width: 200, height: 800 };

  it('zooms in to the double-tap scale around the tap point from fit', () => {
    const s = toggleZoom(FIT_STATE, { x: 20, y: -100 }, content, viewport);
    expect(s.scale).toBe(DOUBLE_TAP_SCALE);
    expect(s.x).toBeCloseTo(20 - DOUBLE_TAP_SCALE * 20);
    expect(s.y).toBeCloseTo(-100 + DOUBLE_TAP_SCALE * 100);
  });

  it('returns to fit when already zoomed', () => {
    expect(toggleZoom({ scale: 2, x: 30, y: -40 }, { x: 0, y: 0 }, content, viewport)).toEqual(FIT_STATE);
  });
});

describe('panBy', () => {
  const content = { width: 200, height: 800 };

  it('does nothing at fit', () => {
    expect(panBy(FIT_STATE, 40, 40, content, viewport)).toEqual(FIT_STATE);
  });

  it('moves and clamps when zoomed', () => {
    // 200 x 800 at 3x = 600 x 2400 in 400 x 800: overflow 100 / 800
    const s = panBy({ scale: 3, x: 0, y: 0 }, 250, -300, content, viewport);
    expect(s).toEqual({ scale: 3, x: 100, y: -300 });
  });
});

describe('isZoomed', () => {
  it('ignores floating-point noise around fit', () => {
    expect(isZoomed(1.0000001)).toBe(false);
    expect(isZoomed(1.2)).toBe(true);
  });
});

describe('wheelZoomFactor', () => {
  it('zooms in on a wheel-up (negative deltaY) and out on a wheel-down', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
  });

  it('is symmetric, so up then down returns to the same scale', () => {
    expect(wheelZoomFactor(-120) * wheelZoomFactor(120)).toBeCloseTo(1);
  });

  it('caps a huge single delta (a trackpad fling) to one bounded step', () => {
    expect(wheelZoomFactor(-100000)).toBeLessThanOrEqual(2);
  });
});

describe('web double-tap / double-click arbitration', () => {
  const tap = (time: number, x = 100, y = 100) => ({ time, x, y });

  describe('isTapRelease', () => {
    it('is a tap when the pointer barely moved since pointerdown', () => {
      expect(isTapRelease(tap(0), tap(120, 104, 98))).toBe(true);
    });

    it('is not a tap when the pointer dragged', () => {
      expect(isTapRelease(tap(0), tap(120, 100 + DOUBLE_TAP_SLOP_PX + 1, 100))).toBe(false);
    });
  });

  describe('isDoubleTap', () => {
    it('pairs two quick taps close together', () => {
      expect(isDoubleTap(tap(0), tap(DOUBLE_TAP_MAX_MS - 50, 110, 95))).toBe(true);
    });

    it('rejects a second tap that comes too late', () => {
      expect(isDoubleTap(tap(0), tap(DOUBLE_TAP_MAX_MS + 1))).toBe(false);
    });

    it('rejects a second tap too far from the first', () => {
      expect(isDoubleTap(tap(0), tap(100, 100 + DOUBLE_TAP_SLOP_PX + 1, 100))).toBe(false);
    });

    it('has nothing to pair with without a first tap', () => {
      expect(isDoubleTap(null, tap(100))).toBe(false);
    });
  });

  describe('shouldHandleDoubleClick', () => {
    it('handles a plain mouse double-click', () => {
      expect(shouldHandleDoubleClick(10_000, null, false)).toBe(true);
    });

    it('ignores the dblclick a browser synthesises right after a touch double-tap already toggled', () => {
      expect(shouldHandleDoubleClick(10_200, 10_000, undefined)).toBe(false);
    });

    it('handles a mouse double-click well after an earlier touch toggle', () => {
      expect(shouldHandleDoubleClick(10_000 + DBLCLICK_AFTER_TOUCH_SUPPRESS_MS + 1, 10_000, false)).toBe(true);
    });

    it('ignores any dblclick the browser reports as touch-generated', () => {
      expect(shouldHandleDoubleClick(10_000, null, true)).toBe(false);
    });
  });
});
