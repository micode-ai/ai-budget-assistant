import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  BUTTON_ZOOM_STEP,
  FIT_STATE,
  MAX_SCALE,
  fitSize,
  isDoubleTap,
  isTapRelease,
  isZoomed,
  panBy,
  shouldHandleDoubleClick,
  toggleZoom,
  wheelZoomFactor,
  zoomTo,
  type TapRecord,
  type ZoomPoint,
  type ZoomSize,
  type ZoomState,
} from '@/features/receipt/receiptZoom';
import type { ReceiptImageViewerProps } from './ReceiptImageViewer';

/** Line-mode wheel deltas (Firefox) are in lines, not pixels. */
const WHEEL_LINE_PX = 16;

/**
 * Web path of the receipt viewer: wheel zooms around the cursor, drag pans
 * when zoomed, double-click (or a touch double-tap) toggles fit / 2.5×,
 * two-finger touch pinches, and corner buttons zoom in / out / fit. Pointer
 * and wheel events go straight to the DOM — RNGH has no wheel support and a
 * passive React wheel listener cannot `preventDefault` the page zoom/scroll.
 * Math shared with the phone path in `features/receipt/receiptZoom.ts`.
 */
export function ReceiptImageViewer({ visible, uri, onClose }: ReceiptImageViewerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ZoomState>(FIT_STATE);
  const [zoomApi, setZoomApi] = useState<ZoomApi | null>(null);
  const zoomApiRef = useRef<ZoomApi | null>(null);
  zoomApiRef.current = zoomApi;

  // The wheel is captured on the WHOLE overlay — image, close button and
  // corner controls alike — so the page behind never scrolls while the viewer
  // is open. A callback ref, because RN-web's Modal may mount its children a
  // render after `visible` flips, which a `[visible]` effect would miss.
  const wheelCleanupRef = useRef<(() => void) | null>(null);
  const overlayRef = useCallback((node: HTMLDivElement | null) => {
    wheelCleanupRef.current?.();
    wheelCleanupRef.current = null;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomApiRef.current?.wheel(e);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    wheelCleanupRef.current = () => node.removeEventListener('wheel', onWheel);
  }, []);

  // Mirrors the native viewer: closing or swapping the image starts at fit.
  useEffect(() => {
    if (!visible) setState(FIT_STATE);
  }, [visible]);
  useEffect(() => {
    setState(FIT_STATE);
  }, [uri]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <div ref={overlayRef} style={overlayStyle}>
        {visible && uri ? (
          <ZoomSurface
            key={uri}
            uri={uri}
            state={state}
            setState={setState}
            onApi={setZoomApi}
            insets={insets}
          />
        ) : null}
        <TouchableOpacity
          style={[styles.close, { top: insets.top + 12, right: insets.right + 16 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('receiptViewer.close')}
        >
          <Ionicons name="close-circle" size={36} color="#fff" />
        </TouchableOpacity>
        <View style={[styles.controls, { bottom: insets.bottom + 16, right: insets.right + 16 }]}>
          <ControlButton
            icon="add"
            label={t('receiptViewer.zoomIn')}
            disabled={state.scale >= MAX_SCALE}
            onPress={() => zoomApi?.zoomBy(BUTTON_ZOOM_STEP)}
          />
          <ControlButton
            icon="remove"
            label={t('receiptViewer.zoomOut')}
            disabled={!isZoomed(state.scale)}
            onPress={() => zoomApi?.zoomBy(1 / BUTTON_ZOOM_STEP)}
          />
          <ControlButton
            icon="contract-outline"
            label={t('receiptViewer.fit')}
            disabled={!isZoomed(state.scale)}
            onPress={() => zoomApi?.fit()}
          />
        </View>
      </div>
    </Modal>
  );
}

function ControlButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.controlButton, disabled && styles.controlButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Ionicons name={icon} size={22} color="#fff" />
    </TouchableOpacity>
  );
}

interface ZoomApi {
  /** Zooms by `factor` around the viewport centre (the +/− buttons). */
  zoomBy: (factor: number) => void;
  /** Animated return to fit (the fit button). */
  fit: () => void;
  /** Wheel zoom around the cursor; the overlay owns the listener. */
  wheel: (e: WheelEvent) => void;
}

interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function ZoomSurface({
  uri,
  state,
  setState,
  onApi,
  insets,
}: {
  uri: string;
  state: ZoomState;
  setState: (next: ZoomState | ((prev: ZoomState) => ZoomState)) => void;
  onApi: (api: ZoomApi | null) => void;
  insets: Insets;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<ZoomSize | null>(null);
  const naturalRef = useRef<ZoomSize | null>(null);
  naturalRef.current = natural;
  // DOM handlers read the latest state synchronously (several pointer events
  // can arrive before React re-renders), so they go through this ref.
  const stateRef = useRef(state);
  stateRef.current = state;
  const apply = useCallback(
    (next: ZoomState) => {
      stateRef.current = next;
      setState(next);
    },
    [setState],
  );
  // Animate discrete jumps (double-click, buttons, fit); follow the pointer
  // 1:1 while it drags or pinches.
  const [animate, setAnimate] = useState(true);

  /** Viewport size plus a converter from client coordinates to the
   * centre-relative space the zoom math works in. */
  const measure = useCallback(() => {
    const el = surfaceRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const viewport = { width: rect.width, height: rect.height };
    return {
      viewport,
      content: fitSize(naturalRef.current, viewport),
      toFocal: (clientX: number, clientY: number): ZoomPoint => ({
        x: clientX - rect.left - rect.width / 2,
        y: clientY - rect.top - rect.height / 2,
      }),
    };
  }, []);

  useEffect(() => {
    onApi({
      zoomBy: (factor) => {
        const m = measure();
        if (!m) return;
        setAnimate(true);
        const prev = stateRef.current;
        apply(zoomTo(prev, prev.scale * factor, { x: 0, y: 0 }, m.content, m.viewport));
      },
      fit: () => {
        // A wheel or drag leaves `animate` off; turn it on first so fit glides.
        setAnimate(true);
        apply(FIT_STATE);
      },
      wheel: (e) => {
        const m = measure();
        if (!m) return;
        setAnimate(false);
        const delta = e.deltaMode === 1 ? e.deltaY * WHEEL_LINE_PX : e.deltaY;
        const focal = m.toFocal(e.clientX, e.clientY);
        const prev = stateRef.current;
        apply(zoomTo(prev, prev.scale * wheelZoomFactor(delta), focal, m.content, m.viewport));
      },
    });
    return () => onApi(null);
  }, [measure, onApi, apply]);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;

    const pointers = new Map<number, { x: number; y: number }>();
    /** Where and when each live pointer went down — a drag is not a tap. */
    const downs = new Map<number, TapRecord>();
    let pinchStart: { distance: number; focal: ZoomPoint; state: ZoomState } | null = null;
    let lastTap: TapRecord | null = null;
    let lastTouchToggleAt: number | null = null;
    /** Set once a second finger lands; cleared when every pointer is up, so
     * neither finger of a pinch is ever read as a tap. */
    let gestureHadPinch = false;

    const pinchGeometry = () => {
      const [a, b] = Array.from(pointers.values());
      return {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      // Only the primary mouse button pans; touch and pen always do.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      downs.set(e.pointerId, { time: Date.now(), x: e.clientX, y: e.clientY });
      setAnimate(false);
      if (pointers.size === 2) {
        gestureHadPinch = true;
        const m = measure();
        if (!m) return;
        const g = pinchGeometry();
        pinchStart = { distance: g.distance, focal: m.toFocal(g.midX, g.midY), state: stateRef.current };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const previous = pointers.get(e.pointerId);
      if (!previous) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const m = measure();
      if (!m) return;
      if (pointers.size >= 2 && pinchStart && pinchStart.distance > 0) {
        const g = pinchGeometry();
        const focal = m.toFocal(g.midX, g.midY);
        const zoomed = zoomTo(
          pinchStart.state,
          pinchStart.state.scale * (g.distance / pinchStart.distance),
          pinchStart.focal,
          m.content,
          m.viewport,
        );
        apply(panBy(zoomed, focal.x - pinchStart.focal.x, focal.y - pinchStart.focal.y, m.content, m.viewport));
      } else if (pointers.size === 1) {
        apply(panBy(stateRef.current, e.clientX - previous.x, e.clientY - previous.y, m.content, m.viewport));
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const down = downs.get(e.pointerId);
      const wasPinch = gestureHadPinch;
      pointers.delete(e.pointerId);
      downs.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (pointers.size === 0) gestureHadPinch = false;
      if (e.type !== 'pointerup' || e.pointerType !== 'touch') return;
      // A touch double-tap: browsers do not reliably synthesise `dblclick`
      // when `touch-action: none` is set, so detect it here (and the
      // dblclick handler below ignores the echo when they do).
      const up: TapRecord = { time: Date.now(), x: e.clientX, y: e.clientY };
      if (wasPinch || !down || !isTapRelease(down, up)) {
        lastTap = null;
        return;
      }
      if (isDoubleTap(lastTap, up)) {
        lastTap = null;
        lastTouchToggleAt = up.time;
        handleDoubleTap(up.x, up.y);
      } else {
        lastTap = up;
      }
    };

    const handleDoubleTap = (clientX: number, clientY: number) => {
      const m = measure();
      if (!m) return;
      setAnimate(true);
      apply(toggleZoom(stateRef.current, m.toFocal(clientX, clientY), m.content, m.viewport));
    };

    const onDoubleClick = (e: MouseEvent) => {
      e.preventDefault();
      const firesTouchEvents = (e as MouseEvent & {
        sourceCapabilities?: { firesTouchEvents?: boolean } | null;
      }).sourceCapabilities?.firesTouchEvents;
      if (!shouldHandleDoubleClick(Date.now(), lastTouchToggleAt, firesTouchEvents)) return;
      handleDoubleTap(e.clientX, e.clientY);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('dblclick', onDoubleClick);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('dblclick', onDoubleClick);
    };
  }, [measure, apply]);

  const zoomed = isZoomed(state.scale);
  const surfaceStyle: CSSProperties = {
    position: 'absolute',
    top: insets.top,
    bottom: insets.bottom,
    left: insets.left,
    right: insets.right,
    overflow: 'hidden',
    touchAction: 'none',
    userSelect: 'none',
    cursor: zoomed ? 'grab' : 'zoom-in',
  };
  const imageStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
    transformOrigin: '50% 50%',
    transform: `translate(${state.x}px, ${state.y}px) scale(${state.scale})`,
    transition: animate ? 'transform 200ms ease-out' : 'none',
    pointerEvents: 'none',
  };

  return (
    <div ref={surfaceRef} style={surfaceStyle}>
      <img
        src={uri}
        alt=""
        draggable={false}
        style={imageStyle}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            setNatural({ width: img.naturalWidth, height: img.naturalHeight });
          }
        }}
      />
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  backgroundColor: 'rgba(0,0,0,0.92)',
  overscrollBehavior: 'contain',
};

const styles = StyleSheet.create({
  close: {
    position: 'absolute',
    zIndex: 10,
  },
  controls: {
    position: 'absolute',
    zIndex: 10,
    flexDirection: 'row',
    gap: 8,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  controlButtonDisabled: {
    opacity: 0.4,
  },
});

export default ReceiptImageViewer;
