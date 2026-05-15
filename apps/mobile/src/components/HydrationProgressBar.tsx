import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Platform } from 'react-native';
import { useHydrationStore } from '@/stores/hydrateTransactions';
import { useTheme } from '@/theme';

// Thin sliding bar shown at the very top of the screen while a hydrate cycle
// runs (DatabaseProvider boot, authStore session restore, account switch,
// pull-to-refresh). Indeterminate animation — communicates "loading" without
// claiming a specific progress.
export function HydrationProgressBar() {
  const isHydrating = useHydrationStore((s) => s.isHydrating);
  const theme = useTheme();
  const slide = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isHydrating) {
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      slide.setValue(0);
      loopRef.current = Animated.loop(
        Animated.timing(slide, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      );
      loopRef.current.start();
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        loopRef.current?.stop();
        loopRef.current = null;
      });
    }
    return () => loopRef.current?.stop();
  }, [isHydrating, slide, opacity]);

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [-180, 360] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          opacity,
          backgroundColor: theme.colors.primaryLight,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.primary,
            transform: [{ translateX }],
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 0 : 0,
    left: 0,
    right: 0,
    height: 2.5,
    overflow: 'hidden',
    zIndex: 9999,
    elevation: 9999,
  },
  bar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 140,
  },
});
