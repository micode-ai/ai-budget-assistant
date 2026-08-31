/**
 * Android implementation of the RestoreCredential bridge.
 * Wraps the legacy (Old-Arch) NativeModule registered by RestoreCredentialPackage.
 * No TurboModule spec — avoids Windows MAX_PATH / Fabric codegen (CLAUDE.md constraint).
 *
 * Every function resolves. A rejection from the native side means "no credential
 * available" far more often than it means "something broke", and the caller
 * cannot act on the difference, so it is flattened to null here.
 */
import { NativeModules } from 'react-native';

const { RestoreCredentialModule } = NativeModules;

if (!RestoreCredentialModule && __DEV__) {
  console.warn(
    '[RestoreCredentials] NativeModule "RestoreCredentialModule" not found. ' +
      'Ensure RestoreCredentialPackage is registered in MainApplication.kt and the ' +
      'app was rebuilt (not just Metro-restarted).',
  );
}

/**
 * Cheap, synchronous probe the orchestration layer (`features/auth/restoreCredential.ts`)
 * checks BEFORE making any server call. Real on Android only when the native module
 * actually registered — an Android build that forgot to register
 * `RestoreCredentialPackage` reports unavailable here too, the same way iOS/web do,
 * instead of going on to hit the server for a feature that can never work.
 */
export function isRestoreCredentialAvailable(): boolean {
  return !!RestoreCredentialModule;
}

export async function createRestoreCredential(requestJson: string): Promise<string | null> {
  if (!RestoreCredentialModule) return null;
  try {
    return await RestoreCredentialModule.createCredential(requestJson);
  } catch (e) {
    console.warn('[RestoreCredentials] create failed:', e);
    return null;
  }
}

export async function getRestoreCredential(requestJson: string): Promise<string | null> {
  if (!RestoreCredentialModule) return null;
  try {
    return await RestoreCredentialModule.getCredential(requestJson);
  } catch {
    // Silent: on every device that has never been restored this is the normal
    // outcome, and it happens on each cold start. Logging it would be noise.
    return null;
  }
}

export async function clearRestoreCredential(): Promise<void> {
  if (!RestoreCredentialModule) return;
  try {
    await RestoreCredentialModule.clearCredential();
  } catch (e) {
    console.warn('[RestoreCredentials] clear failed:', e);
  }
}
