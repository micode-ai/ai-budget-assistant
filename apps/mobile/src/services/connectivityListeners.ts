import { AppState } from 'react-native';

/** Native: re-probe when the app returns to the foreground. */
export function startPlatformListeners(recheck: () => void): void {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') recheck();
  });
}
