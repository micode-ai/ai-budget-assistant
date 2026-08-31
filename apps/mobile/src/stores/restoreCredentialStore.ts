import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'restore-credential' });

const key = (userId: string) => `synced:${userId}`;

/** Pure so the default can be tested without mocking MMKV. */
export function resolveSynced(read: (k: string) => string | undefined, userId: string): boolean {
  return read(key(userId)) === 'true';
}

/**
 * Keyed by user id, not a bare boolean: signing into a second account on the
 * same device must register that account too, and a shared flag would make the
 * second account silently never get a credential.
 */
export const restoreCredentialFlag = {
  hasSynced: (userId: string) => resolveSynced((k) => mmkv.getString(k), userId),
  markSynced: (userId: string) => mmkv.set(key(userId), 'true'),
};
