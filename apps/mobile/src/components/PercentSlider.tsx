/**
 * Pure-JS percent slider using PanResponder.
 * Range: -100 to +100, step 5.
 * No native modules — works in any Expo/RN build without a native rebuild.
 */
import React, { useRef } from 'react';
import { View, PanResponder, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

interface PercentSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  trackColorFilled?: string;
  trackColorEmpty?: string;
  thumbColor?: string;
  /** Called when drag starts — use to disable parent ScrollView */
  onDragStart?: () => void;
  /** Called when drag ends */
  onDragEnd?: () => void;
}

const THUMB_SIZE = 22;
const TRACK_HEIGHT = 4;

export function PercentSlider({
  value,
  onValueChange,
  minimumValue = -100,
  maximumValue = 100,
  step = 5,
  trackColorFilled,
  trackColorEmpty,
  thumbColor,
  onDragStart,
  onDragEnd,
}: PercentSliderProps) {
  const theme = useTheme();

  // All mutable values go through refs so the PanResponder (created once) always reads fresh values
  const trackWidth = useRef(0);
  const gestureStartValue = useRef(value); // anchor at gesture start
  const dragging = useRef(false);

  // Props refs — updated every render so PanResponder always calls the latest callbacks
  const onValueChangeRef = useRef(onValueChange);
  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);
  const minRef = useRef(minimumValue);
  const maxRef = useRef(maximumValue);
  const stepRef = useRef(step);

  onValueChangeRef.current = onValueChange;
  onDragStartRef.current = onDragStart;
  onDragEndRef.current = onDragEnd;
  minRef.current = minimumValue;
  maxRef.current = maximumValue;
  stepRef.current = step;

  // Keep anchor in sync when value is reset externally (e.g. Reset All button)
  if (!dragging.current) {
    gestureStartValue.current = value;
  }

  function compute(startValue: number, dx: number): number {
    const min = minRef.current;
    const max = maxRef.current;
    const s = stepRef.current;
    const startRatio = (startValue - min) / (max - min);
    const deltaRatio = dx / (trackWidth.current || 1);
    const ratio = Math.max(0, Math.min(1, startRatio + deltaRatio));
    const raw = min + ratio * (max - min);
    const stepped = Math.round(raw / s) * s;
    return Math.max(min, Math.min(max, stepped));
  }

  const panResponder = useRef(
    PanResponder.create({
      // Claim only clearly horizontal gestures so vertical scroll still works
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 4,
      onMoveShouldSetPanResponderCapture: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 4,

      onPanResponderGrant: () => {
        // gestureStartValue is already kept current in the render phase (when not dragging)
        dragging.current = true;
        onDragStartRef.current?.();
      },

      onPanResponderMove: (_, gs) => {
        if (trackWidth.current === 0) return;
        onValueChangeRef.current(compute(gestureStartValue.current, gs.dx));
      },

      onPanResponderRelease: (_, gs) => {
        if (trackWidth.current === 0) return;
        const snapped = compute(gestureStartValue.current, gs.dx);
        gestureStartValue.current = snapped;
        onValueChangeRef.current(snapped);
        dragging.current = false;
        onDragEndRef.current?.();
      },

      onPanResponderTerminate: () => {
        dragging.current = false;
        onDragEndRef.current?.();
      },
    }),
  ).current;

  const filledColor = trackColorFilled ?? theme.colors.primary;
  const emptyColor = trackColorEmpty ?? theme.colors.border;
  const thumb = thumbColor ?? theme.colors.primary;

  const range = maximumValue - minimumValue;
  const ratio = range === 0 ? 0 : (value - minimumValue) / range;
  const pct = Math.max(0, Math.min(100, ratio * 100));
  const thumbPercent = `${pct}%` as `${number}%`;

  return (
    <View
      style={styles.container}
      onLayout={e => {
        trackWidth.current = e.nativeEvent.layout.width - THUMB_SIZE;
      }}
      {...panResponder.panHandlers}
    >
      {/* Track */}
      <View style={[styles.track, { backgroundColor: emptyColor }]}>
        <View style={[styles.filled, { width: thumbPercent, backgroundColor: filledColor }]} />
      </View>

      {/* Thumb */}
      <View
        style={[
          styles.thumb,
          { left: thumbPercent, backgroundColor: thumb } as ViewStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: THUMB_SIZE / 2,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  filled: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    top: '50%',
    marginTop: -THUMB_SIZE / 2,
    marginLeft: -THUMB_SIZE / 2,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
});
