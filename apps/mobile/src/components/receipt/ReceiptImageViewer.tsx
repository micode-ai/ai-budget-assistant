import { useCallback } from 'react';
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  type LayoutChangeEvent,
  type ImageLoadEventData,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  clampScale,
  clampTranslate,
  fitSize,
  isZoomed,
  panBy,
  toggleZoom,
  zoomAround,
} from '@/features/receipt/receiptZoom';

export interface ReceiptImageViewerProps {
  visible: boolean;
  /** A FILE uri (materialized receipt / downscaled scan copy) — never a
   * `data:` URL, see docs/wiki/features/receipt-image-memory.md. */
  uri: string | null;
  onClose: () => void;
}

const ZOOM_ANIMATION = { duration: 220 };

/**
 * Full-screen receipt viewer with pinch-zoom, double-tap zoom and clamped
 * pan (phone). The web path is `ReceiptImageViewer.web.tsx` (wheel, drag,
 * double-click, +/−/fit buttons). All the math is in
 * `features/receipt/receiptZoom.ts`, which carries the tests.
 */
export function ReceiptImageViewer({ visible, uri, onClose }: ReceiptImageViewerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* Gestures inside an RN Modal need their own root on Android — the
          app-level GestureHandlerRootView does not reach the modal window. */}
      <GestureHandlerRootView style={styles.overlay}>
        {/* Mounted only while visible and keyed on the uri: every open, and
            every image change, starts from fit with fresh zoom state. */}
        {visible && uri ? <ZoomableImage key={uri} uri={uri} /> : null}
        <TouchableOpacity
          style={[styles.close, { top: insets.top + 12, right: insets.right + 16 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('receiptViewer.close')}
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={36} color="#fff" />
        </TouchableOpacity>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ZoomableImage({ uri }: { uri: string }) {
  const insets = useSafeAreaInsets();

  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const viewportW = useSharedValue(0);
  const viewportH = useSharedValue(0);
  const imageW = useSharedValue(0);
  const imageH = useSharedValue(0);

  // Start-of-gesture snapshots. Pinch and pan keep separate ones so a
  // simultaneous pair never overwrites the other's baseline.
  const pinchScale = useSharedValue(1);
  const pinchX = useSharedValue(0);
  const pinchY = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);
  const pinching = useSharedValue(false);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewportW.value = e.nativeEvent.layout.width;
      viewportH.value = e.nativeEvent.layout.height;
    },
    [viewportW, viewportH],
  );

  const onLoad = useCallback(
    (e: NativeSyntheticEvent<ImageLoadEventData>) => {
      const source = e.nativeEvent?.source;
      if (source && source.width > 0 && source.height > 0) {
        imageW.value = source.width;
        imageH.value = source.height;
      }
    },
    [imageW, imageH],
  );

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      pinching.value = true;
      pinchScale.value = scale.value;
      pinchX.value = x.value;
      pinchY.value = y.value;
      pinchFocalX.value = e.focalX - viewportW.value / 2;
      pinchFocalY.value = e.focalY - viewportH.value / 2;
    })
    .onUpdate((e) => {
      const viewport = { width: viewportW.value, height: viewportH.value };
      const content = fitSize({ width: imageW.value, height: imageH.value }, viewport);
      const next = clampScale(pinchScale.value * e.scale);
      const fx = e.focalX - viewport.width / 2;
      const fy = e.focalY - viewport.height / 2;
      // Keep the content point under the starting focal point under the
      // fingers, following the fingers as they move.
      const nx = zoomAround(pinchFocalX.value, pinchScale.value, next, pinchX.value) + (fx - pinchFocalX.value);
      const ny = zoomAround(pinchFocalY.value, pinchScale.value, next, pinchY.value) + (fy - pinchFocalY.value);
      scale.value = next;
      x.value = clampTranslate(nx, next, content.width, viewport.width);
      y.value = clampTranslate(ny, next, content.height, viewport.height);
    })
    .onEnd(() => {
      if (!isZoomed(scale.value)) {
        scale.value = withTiming(1, ZOOM_ANIMATION);
        x.value = withTiming(0, ZOOM_ANIMATION);
        y.value = withTiming(0, ZOOM_ANIMATION);
      }
    })
    .onFinalize(() => {
      pinching.value = false;
    });

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      panX.value = x.value;
      panY.value = y.value;
    })
    .onUpdate((e) => {
      if (pinching.value) return;
      const viewport = { width: viewportW.value, height: viewportH.value };
      const content = fitSize({ width: imageW.value, height: imageH.value }, viewport);
      const next = panBy(
        { scale: scale.value, x: panX.value, y: panY.value },
        e.translationX,
        e.translationY,
        content,
        viewport,
      );
      x.value = next.x;
      y.value = next.y;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e, success) => {
      if (!success) return;
      const viewport = { width: viewportW.value, height: viewportH.value };
      const content = fitSize({ width: imageW.value, height: imageH.value }, viewport);
      const next = toggleZoom(
        { scale: scale.value, x: x.value, y: y.value },
        { x: e.x - viewport.width / 2, y: e.y - viewport.height / 2 },
        content,
        viewport,
      );
      scale.value = withTiming(next.scale, ZOOM_ANIMATION);
      x.value = withTiming(next.x, ZOOM_ANIMATION);
      y.value = withTiming(next.y, ZOOM_ANIMATION);
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[
          styles.viewport,
          {
            marginTop: insets.top,
            marginBottom: insets.bottom,
            marginLeft: insets.left,
            marginRight: insets.right,
          },
        ]}
        onLayout={onLayout}
        collapsable={false}
      >
        {/* Laid out at the viewport size with "contain", as the static
            viewer did; zoom is a transform, so no larger bitmap is decoded. */}
        <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
          <Image source={{ uri }} style={styles.image} resizeMode="contain" onLoad={onLoad} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  close: {
    position: 'absolute',
    zIndex: 10,
  },
});

export default ReceiptImageViewer;
