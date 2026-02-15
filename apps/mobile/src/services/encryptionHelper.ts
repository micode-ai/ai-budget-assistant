/**
 * Convenience wrappers around encryptionMiddleware + encryptionStore
 * for use in data stores. These helpers check whether E2EE is enabled
 * for the current account and encrypt/decrypt accordingly.
 */
import type { EncryptionTier } from '@budget/shared-types';
import { encryptForSync, decryptFromSync } from './encryptionMiddleware';

// Lazy imports to avoid circular dependency with stores
function getEncryptionStore() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../stores/encryptionStore').useEncryptionStore;
}

/** Encryption tier cache to avoid repeated API calls */
const tierCache = new Map<string, { tier: EncryptionTier; ts: number }>();
const TIER_CACHE_TTL = 60_000; // 1 minute

export async function getAccountEncryptionTier(accountId: string): Promise<EncryptionTier> {
  const cached = tierCache.get(accountId);
  if (cached && Date.now() - cached.ts < TIER_CACHE_TTL) {
    return cached.tier;
  }
  const store = getEncryptionStore();
  const tier = await store.getState().getAccountTier(accountId);
  tierCache.set(accountId, { tier, ts: Date.now() });
  return tier;
}

export function clearTierCache(accountId?: string) {
  if (accountId) {
    tierCache.delete(accountId);
  } else {
    tierCache.clear();
  }
}

/**
 * Encrypt entity data before sending to the server.
 * Returns the original data unchanged if E2EE is not enabled for the account.
 */
export async function maybeEncrypt(
  entityType: string,
  data: Record<string, any>,
  accountId: string,
): Promise<{ payload: Record<string, any>; encryptedPayload?: string; encryptionKeyVersion?: number }> {
  const store = getEncryptionStore();
  const state = store.getState();

  if (!state.isUnlocked) {
    return { payload: data };
  }

  const keyData = state.getAccountKey(accountId);
  if (!keyData) {
    return { payload: data };
  }

  const tier = await getAccountEncryptionTier(accountId);
  if (tier === 0) {
    return { payload: data };
  }

  const { plainPayload, encryptedPayload } = await encryptForSync(
    entityType,
    data,
    keyData.key,
    tier,
    keyData.keyVersion,
  );

  return {
    payload: plainPayload,
    encryptedPayload,
    encryptionKeyVersion: encryptedPayload ? keyData.keyVersion : undefined,
  };
}

/**
 * Decrypt entity data received from the server.
 * Returns the data unchanged if there is no encrypted payload.
 */
export async function maybeDecrypt(
  entityType: string,
  data: Record<string, any>,
  accountId: string,
): Promise<Record<string, any>> {
  const encryptedPayloadStr = data.encryptedPayload;
  if (!encryptedPayloadStr) {
    return data;
  }

  const store = getEncryptionStore();
  const state = store.getState();

  if (!state.isUnlocked) {
    // Cannot decrypt — return data as-is (fields will be null/missing)
    return data;
  }

  let keyData = state.getAccountKey(accountId);
  if (!keyData) {
    // Try fetching key
    await state.fetchAccountKey(accountId);
    keyData = store.getState().getAccountKey(accountId);
  }

  if (!keyData) {
    // Still no key — return data as-is
    return data;
  }

  return decryptFromSync(entityType, data, encryptedPayloadStr, keyData.key);
}
