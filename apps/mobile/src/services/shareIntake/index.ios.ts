/** No-op: share-to-capture is Android-only (spec). Same surface as index.android.ts. */
import type { SharedFile } from '@/features/share-intake/shareIntakeQueue';

export interface SharePayload {
  files: SharedFile[];
  droppedCount: number;
}

export async function getInitialShare(): Promise<SharePayload | null> {
  return null;
}

export function subscribeToShares(_cb: (p: SharePayload) => void): () => void {
  return () => {};
}

export async function deleteSharedFile(_uri: string): Promise<void> {}

export async function purgeStaleSharedFiles(_maxAgeMs: number): Promise<void> {}
