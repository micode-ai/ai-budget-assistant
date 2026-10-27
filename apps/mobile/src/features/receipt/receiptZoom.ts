/**
 * Zoom/pan math for the full-screen receipt viewer (`ReceiptImageViewer`).
 *
 * Coordinate model: the image is laid out at its "fit" size (`fitSize`, what
 * `resizeMode="contain"` draws) centred in the viewport, then transformed by
 * `translate(x, y) scale(scale)` with the transform origin at the viewport
 * centre. Every point and translation here is therefore measured from the
 * viewport CENTRE, not its top-left corner — callers convert gesture/pointer
 * coordinates with `x - viewport.width / 2` before passing them in.
 *
 * Every function is a `'worklet'` so the native viewer can run it on the UI
 * thread inside a gesture callback; the directive is a no-op string on web and
 * under jest. Keep them pure and free of anything a worklet cannot capture.
 */

export interface ZoomSize {
  width: number;
  height: number;
}

export interface ZoomPoint {
  x: number;
  y: number;
}

export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

/** Never zoom out past the whole receipt. */
export const MIN_SCALE = 1;
/** Small print is legible well before this; beyond it the bitmap just blurs. */
export const MAX_SCALE = 5;
/** What a double-tap / double-click zooms to from fit. */
export const DOUBLE_TAP_SCALE = 2.5;
/** Factor of one "+" / "−" button press on web. */
export const BUTTON_ZOOM_STEP = 1.5;

export const FIT_STATE: ZoomState = { scale: 1, x: 0, y: 0 };

/** Wheel sensitivity: scale factor = exp(-deltaY * WHEEL_SENSITIVITY). */
const WHEEL_SENSITIVITY = 0.002;
/** A single wheel event is capped to this |deltaY| so a trackpad fling or a
 * line-mode delta cannot jump straight to the max. exp(0.6) ≈ 1.82×. */
const WHEEL_MAX_DELTA = 300;
/** Scales within this distance of 1 count as fit (pinch release noise). */
const FIT_EPSILON = 0.01;

/** The size `resizeMode="contain"` draws `image` at inside `viewport`. An
 * unknown image size (not loaded yet) falls back to the whole viewport. */
export function fitSize(image: ZoomSize | null | undefined, viewport: ZoomSize): ZoomSize {
  'worklet';
  if (viewport.width <= 0 || viewport.height <= 0) return { width: 0, height: 0 };
  if (!image || image.width <= 0 || image.height <= 0) {
    return { width: viewport.width, height: viewport.height };
  }
  const ratio = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}

export function clampScale(scale: number): number {
  'worklet';
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Clamps one axis' translation so the scaled content never leaves empty
 * space inside the viewport. Content narrower than the viewport is centred. */
export function clampTranslate(
  translate: number,
  scale: number,
  contentLength: number,
  viewportLength: number,
): number {
  'worklet';
  const overflow = (contentLength * scale - viewportLength) / 2;
  if (overflow <= 0) return 0;
  return Math.min(overflow, Math.max(-overflow, translate));
}

/** One axis: the translation that keeps the content point under `focal`
 * fixed while the scale goes from `fromScale` to `toScale`. */
export function zoomAround(
  focal: number,
  fromScale: number,
  toScale: number,
  translate: number,
): number {
  'worklet';
  if (fromScale <= 0) return translate;
  return focal - (toScale / fromScale) * (focal - translate);
}

export function isZoomed(scale: number): boolean {
  'worklet';
  return scale > MIN_SCALE + FIT_EPSILON;
}

/** Zooms `state` to `toScale` (clamped) around `focal`, clamped to the edges.
 * Landing on fit always yields exactly `FIT_STATE`. */
export function zoomTo(
  state: ZoomState,
  toScale: number,
  focal: ZoomPoint,
  content: ZoomSize,
  viewport: ZoomSize,
): ZoomState {
  'worklet';
  const scale = clampScale(toScale);
  if (!isZoomed(scale)) return { scale: 1, x: 0, y: 0 };
  return {
    scale,
    x: clampTranslate(zoomAround(focal.x, state.scale, scale, state.x), scale, content.width, viewport.width),
    y: clampTranslate(zoomAround(focal.y, state.scale, scale, state.y), scale, content.height, viewport.height),
  };
}

/** Double-tap / double-click: fit → `DOUBLE_TAP_SCALE` around the tap point,
 * anything zoomed → fit. */
export function toggleZoom(
  state: ZoomState,
  focal: ZoomPoint,
  content: ZoomSize,
  viewport: ZoomSize,
): ZoomState {
  'worklet';
  if (isZoomed(state.scale)) return { scale: 1, x: 0, y: 0 };
  return zoomTo(state, DOUBLE_TAP_SCALE, focal, content, viewport);
}

/** Moves a zoomed image by (dx, dy), clamped to the edges. At fit there is
 * nothing to pan, so the state comes back unchanged. */
export function panBy(
  state: ZoomState,
  dx: number,
  dy: number,
  content: ZoomSize,
  viewport: ZoomSize,
): ZoomState {
  'worklet';
  if (!isZoomed(state.scale)) return state;
  return {
    scale: state.scale,
    x: clampTranslate(state.x + dx, state.scale, content.width, viewport.width),
    y: clampTranslate(state.y + dy, state.scale, content.height, viewport.height),
  };
}

/** Multiplicative scale factor for one wheel event (negative deltaY = zoom in). */
export function wheelZoomFactor(deltaY: number): number {
  'worklet';
  const capped = Math.min(WHEEL_MAX_DELTA, Math.max(-WHEEL_MAX_DELTA, deltaY));
  return Math.exp(-capped * WHEEL_SENSITIVITY);
}

// ---------------------------------------------------------------------------
// Web tap arbitration. The web viewer detects a touch double-tap from pointer
// events itself (browsers do not reliably fire `dblclick` under
// `touch-action: none`), but Chrome Android and iOS Safari sometimes DO fire
// it too — handling both toggles the zoom in and straight back out. These
// decide which single path wins. Plain functions (web only, no worklet).

export interface TapRecord {
  /** ms timestamp */
  time: number;
  x: number;
  y: number;
}

/** Two taps further apart than this (ms) are not a double-tap. */
export const DOUBLE_TAP_MAX_MS = 300;
/** Movement (px) allowed within one tap and between the two taps. */
export const DOUBLE_TAP_SLOP_PX = 30;
/** A `dblclick` this soon (ms) after a touch-driven toggle is its echo. */
export const DBLCLICK_AFTER_TOUCH_SUPPRESS_MS = 500;

function distance(a: TapRecord, b: TapRecord): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A pointerup counts as a tap only when the pointer barely moved since its
 * pointerdown — the end of a drag must not start a double-tap. */
export function isTapRelease(down: TapRecord, up: TapRecord): boolean {
  return distance(down, up) <= DOUBLE_TAP_SLOP_PX;
}

/** Whether `current` completes a double-tap begun by `previous`. */
export function isDoubleTap(previous: TapRecord | null, current: TapRecord): boolean {
  if (!previous) return false;
  return (
    current.time - previous.time <= DOUBLE_TAP_MAX_MS &&
    distance(previous, current) <= DOUBLE_TAP_SLOP_PX
  );
}

/** Whether a `dblclick` should toggle the zoom. It must not when the browser
 * says it came from touch (`sourceCapabilities.firesTouchEvents`), or when a
 * touch double-tap toggled moments ago — touch has its own path. */
export function shouldHandleDoubleClick(
  now: number,
  lastTouchToggleAt: number | null,
  firesTouchEvents: boolean | undefined,
): boolean {
  if (firesTouchEvents) return false;
  if (lastTouchToggleAt !== null && now - lastTouchToggleAt <= DBLCLICK_AFTER_TOUCH_SUPPRESS_MS) {
    return false;
  }
  return true;
}
