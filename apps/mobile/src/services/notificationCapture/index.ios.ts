/**
 * iOS no-op stub for NotificationCapture.
 * iOS does not expose notification listener access to third-party apps.
 * The settings screen shows an "Android only" note on iOS.
 *
 * A future iOS option (not built here): a Share-Sheet extension to forward a bank-app screenshot
 * into the existing OCR receipt path (see spec §4 iOS note).
 */

export interface BankNotificationPayload {
  packageName: string;
  title: string;
  text: string;
  postedAt: number;
}

export async function isPermissionGranted(): Promise<boolean> {
  return false;
}

export async function openPermissionSettings(): Promise<void> {
  // No-op on iOS
}

export async function setEnabled(_enabled: boolean): Promise<void> {
  // No-op on iOS
}

export async function isEnabled(): Promise<boolean> {
  return false;
}

export function addBankNotificationListener(
  _handler: (payload: BankNotificationPayload) => void,
): () => void {
  // No-op — return empty cleanup function
  return () => {};
}

export const BANK_PACKAGES_DISPLAY: Array<{ packageName: string; label: string }> = [];
