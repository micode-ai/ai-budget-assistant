import { Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';

/**
 * Thin wrapper over Google Play's in-app review flow (and the App Store's, if a
 * native iOS build ever ships).
 *
 * Never throws and never reports success: the platform deliberately gives no
 * signal about whether the sheet was shown, skipped for quota, or acted on, so
 * a caller can only know that a request was dispatched. Failures are
 * `console.warn`, never `console.error` — a rating prompt not appearing is an
 * expected outcome on plenty of devices (no Play Services, sideloaded build,
 * quota already spent), not an exceptional one (ABA-157 convention).
 */
export async function requestStoreReview(): Promise<void> {
  // Web has no store to review in — the Expo module stubs out there, but
  // guarding here keeps the intent explicit rather than relying on the stub.
  if (Platform.OS === 'web') return;

  try {
    if (!(await StoreReview.isAvailableAsync())) return;
    // False on a build with no store URL configured (e.g. a bare dev client).
    if (!StoreReview.hasAction()) return;
    await StoreReview.requestReview();
  } catch (error) {
    console.warn('[storeReview] request failed', error);
  }
}
