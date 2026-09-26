/**
 * Android implementation of the share-to-capture bridge. Wraps the legacy
 * (Old-Arch) NativeModule registered by ShareIntakePackage — no TurboModule spec
 * (Windows MAX_PATH / codegen constraint). Every call resolves; failures are
 * logged with console.warn and read as "nothing shared".
 */
import { NativeModules, DeviceEventEmitter } from 'react-native';
import type { SharedFile } from '@/features/share-intake/shareIntakeQueue';

export interface SharePayload {
  files: SharedFile[];
  droppedCount: number;
}

const { ShareIntakeModule } = NativeModules;

if (!ShareIntakeModule && __DEV__) {
  console.warn(
    '[ShareIntake] NativeModule "ShareIntakeModule" not found. Ensure ShareIntakePackage is ' +
      'registered in MainApplication.kt and the app was rebuilt (not just Metro-restarted).',
  );
}

function normalise(raw: unknown): SharePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { files?: unknown; droppedCount?: unknown };
  const files = Array.isArray(r.files)
    ? r.files.filter(
        (f): f is SharedFile =>
          !!f && typeof f.uri === 'string' && typeof f.mimeType === 'string' && typeof f.name === 'string',
      )
    : [];
  const droppedCount = typeof r.droppedCount === 'number' ? r.droppedCount : 0;
  if (files.length === 0 && droppedCount === 0) return null;
  return { files, droppedCount };
}

export async function getInitialShare(): Promise<SharePayload | null> {
  if (!ShareIntakeModule) return null;
  try {
    return normalise(await ShareIntakeModule.getInitialShare());
  } catch (e) {
    console.warn('[ShareIntake] getInitialShare failed:', e);
    return null;
  }
}

export function subscribeToShares(cb: (p: SharePayload) => void): () => void {
  const sub = DeviceEventEmitter.addListener('ShareIntakeReceived', (raw) => {
    const p = normalise(raw);
    if (p) cb(p);
  });
  return () => sub.remove();
}

export async function deleteSharedFile(uri: string): Promise<void> {
  if (!ShareIntakeModule) return;
  try {
    await ShareIntakeModule.deleteFile(uri);
  } catch (e) {
    console.warn('[ShareIntake] deleteFile failed:', e);
  }
}

export async function purgeStaleSharedFiles(maxAgeMs: number): Promise<void> {
  if (!ShareIntakeModule) return;
  try {
    await ShareIntakeModule.purgeStale(maxAgeMs);
  } catch (e) {
    console.warn('[ShareIntake] purgeStale failed:', e);
  }
}
