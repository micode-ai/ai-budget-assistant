/**
 * Restore Credentials are Android-only. These stubs exist so call sites need
 * no platform branching: `null` is the same answer a real Android device with
 * no stored credential gives, which is the overwhelmingly common case anyway.
 */

/**
 * Always `false` here: the orchestration layer checks this BEFORE making any
 * server call, so a platform with no restore-credential support never issues
 * `GET /auth/restore/*` at all — those endpoints generate WebAuthn options and
 * write a short-lived Redis key server-side per call, for a feature this
 * platform can never use.
 */
export function isRestoreCredentialAvailable(): boolean {
  return false;
}

export async function createRestoreCredential(_requestJson: string): Promise<string | null> {
  return null;
}

export async function getRestoreCredential(_requestJson: string): Promise<string | null> {
  return null;
}

export async function clearRestoreCredential(): Promise<void> {
  // Nothing to clear.
}
