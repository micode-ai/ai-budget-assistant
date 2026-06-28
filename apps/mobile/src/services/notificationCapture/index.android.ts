/**
 * Android implementation of the NotificationCapture bridge.
 * Wraps the legacy (Old-Arch) NativeModule registered by NotificationCapturePackage.
 * No TurboModule spec — avoids Windows MAX_PATH / Fabric codegen (CLAUDE.md constraint).
 */
import { NativeModules, DeviceEventEmitter } from 'react-native';

const { NotificationCaptureModule } = NativeModules;

if (!NotificationCaptureModule) {
  // This can happen in tests or if the Gradle build didn't pick up the Kotlin file.
  // Fail loudly in dev so the engineer notices immediately.
  if (__DEV__) {
    console.warn(
      '[NotificationCapture] NativeModule "NotificationCaptureModule" not found. ' +
        'Ensure NotificationCapturePackage is registered in MainApplication.kt and the ' +
        'app was rebuilt (not just Metro-restarted).',
    );
  }
}

/** Payload emitted by BankNotificationListenerService via DeviceEventEmitter. */
export interface BankNotificationPayload {
  packageName: string;
  title: string;
  text: string;
  /** Unix timestamp (ms) from StatusBarNotification.postTime */
  postedAt: number;
}

/** Check whether the OS-level notification listener permission is granted. */
export async function isPermissionGranted(): Promise<boolean> {
  if (!NotificationCaptureModule) return false;
  return NotificationCaptureModule.isPermissionGranted();
}

/** Open the OS Notification Listener Settings screen so the user can grant the permission. */
export async function openPermissionSettings(): Promise<void> {
  if (!NotificationCaptureModule) return;
  return NotificationCaptureModule.openPermissionSettings();
}

/**
 * Set whether the native service should forward notification events to JS.
 * Persisted across app restarts via SharedPreferences.
 */
export async function setEnabled(enabled: boolean): Promise<void> {
  if (!NotificationCaptureModule) return;
  return NotificationCaptureModule.setEnabled(enabled);
}

/** Read the persisted enabled flag (for restoring toggle state). */
export async function isEnabled(): Promise<boolean> {
  if (!NotificationCaptureModule) return false;
  return NotificationCaptureModule.isEnabled();
}

/**
 * Subscribe to bank notification events forwarded by BankNotificationListenerService.
 * Returns an unsubscribe function — call it from a cleanup effect.
 */
export function addBankNotificationListener(
  handler: (payload: BankNotificationPayload) => void,
): () => void {
  const sub = DeviceEventEmitter.addListener('onBankNotification', handler);
  return () => sub.remove();
}

export const BANK_PACKAGES_DISPLAY = [
  { packageName: 'pl.pkobp.iko', label: 'PKO BP' },
  { packageName: 'pl.mbank', label: 'mBank' },
  { packageName: 'eu.eleader.mobilebanking.pekao', label: 'Pekao' },
  { packageName: 'com.revolut.revolut', label: 'Revolut' },
  { packageName: 'pl.ing.mojeing', label: 'ING' },
  { packageName: 'wit.android.bcpBankingApp.millenniumPL', label: 'Millennium' },
  { packageName: 'pl.bzwbk.bzwbk24', label: 'Santander' },
  { packageName: 'pl.aliorbank.aib', label: 'Alior Bank' },
  { packageName: 'com.finanteq.finance.bgz', label: 'BNP Paribas' },
  { packageName: 'pl.ca.mobile', label: 'Credit Agricole' },
  { packageName: 'pl.nestbank.nestbank', label: 'Nest Bank' },
] as const;
