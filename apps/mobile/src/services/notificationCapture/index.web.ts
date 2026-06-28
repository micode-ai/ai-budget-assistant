/**
 * Web no-op stub for NotificationCapture.
 * Notification listener access is not available on web.
 * All exports are no-ops so that captureService.ts can be safely imported
 * in the web bundle without pulling in any native-only code.
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
  // No-op on web
}

export async function setEnabled(_enabled: boolean): Promise<void> {
  // No-op on web
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
