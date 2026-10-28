import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { MMKV } from 'react-native-mmkv';
import { useLocationSettingsStore } from '@/stores/locationSettingsStore';

export interface CapturedLocation {
  lat: number;
  lng: number;
}

const CAPTURE_TIMEOUT_MS = 4000;

// The capture toggle is ON by default, so the OS permission may never have been
// asked. A foreground add-expense screen asks it once per install; after that
// the user's answer stands (Android would otherwise re-prompt after one denial).
const promptStore = new MMKV({ id: 'location-settings' });
const ASKED_KEY = 'permissionAsked';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Ask the OS for foreground location permission. Used when the user flips the
 * settings toggle ON and by the manual pin screen's "My location" button.
 */
export async function requestLocationPermission(): Promise<boolean> {
  // On web the actual permission prompt is shown by navigator.geolocation on
  // first use, so just report whether the browser exposes the API.
  if (Platform.OS === 'web') {
    return !!(globalThis as any)?.navigator?.geolocation;
  }
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    console.warn('[locationCapture] permission request failed:', e);
    return false;
  }
}

/**
 * Best-effort current position. Gated on the capture toggle (unless `force`,
 * used by the manual pin screen). NEVER throws and never takes longer than
 * ~4s once permission is settled — an expense save must not block on GPS.
 * `askPermission` (foreground add-expense screens only, never a background
 * capture) asks for an undetermined permission, once per install.
 */
export async function captureCurrentLocation(
  opts?: { force?: boolean; askPermission?: boolean },
): Promise<CapturedLocation | null> {
  if (!opts?.force && !useLocationSettingsStore.getState().captureEnabled) return null;

  // Web has no expo-location native module; use the browser Geolocation API.
  // getCurrentPosition shows its own one-time permission prompt on first use.
  if (Platform.OS === 'web') return captureWebLocation();

  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'undetermined' && opts?.askPermission && !promptStore.getBoolean(ASKED_KEY)) {
      promptStore.set(ASKED_KEY, true);
      ({ status } = await Location.requestForegroundPermissionsAsync());
    }
    if (status !== 'granted') return null;

    const pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      CAPTURE_TIMEOUT_MS,
    );
    if (!pos) return null;
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (e) {
    console.warn('[locationCapture] capture failed:', e);
    return null;
  }
}

/**
 * Browser Geolocation wrapper (web only). Never throws; resolves null on error,
 * denial, an unsupported browser, or the ~4s timeout.
 */
function captureWebLocation(): Promise<CapturedLocation | null> {
  const geo = (globalThis as any)?.navigator?.geolocation;
  if (!geo) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: CapturedLocation | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS);
    geo.getCurrentPosition(
      (pos: { coords: { latitude: number; longitude: number } }) => {
        clearTimeout(timer);
        finish({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: false, timeout: CAPTURE_TIMEOUT_MS, maximumAge: 60000 },
    );
  });
}
