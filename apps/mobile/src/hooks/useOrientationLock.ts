import { useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

const TABLET_MIN_WIDTH_DP = 600;

function isTablet(): boolean {
  const { width, height } = Dimensions.get('window');
  return Math.min(width, height) >= TABLET_MIN_WIDTH_DP;
}

export function useOrientationLock() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (isTablet()) {
      ScreenOrientation.unlockAsync().catch(() => {});
      return;
    }
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);
}
