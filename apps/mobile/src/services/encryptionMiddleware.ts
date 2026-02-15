import { ENCRYPTION_FIELDS, ENCRYPTION_CONFIG } from '@budget/shared-utils';
import type { EncryptionTier, EncryptedPayload, EncryptedFieldValue } from '@budget/shared-types';

import { encryptField, decryptField } from './crypto';

/**
 * Get the list of fields that should be encrypted for a given entity type and tier.
 *
 * Tier 0 = no encryption, tier 1 = sensitive text fields, tier 2 = tier 1 + numeric fields.
 */
export function getEncryptedFields(entityType: string, tier: EncryptionTier): string[] {
  const config = ENCRYPTION_FIELDS[entityType];
  if (!config || tier === 0) {
    return [];
  }

  if (tier === 1) {
    return [...config.tier1];
  }

  // tier 2 includes both tier1 and tier2 fields
  return [...config.tier1, ...config.tier2];
}

/**
 * Encrypt entity data before pushing to the server.
 *
 * Returns the cleaned plain payload (sensitive fields removed) and the encrypted
 * payload string to attach to the sync request. If no fields need encryption,
 * `encryptedPayload` will be `undefined`.
 */
export async function encryptForSync(
  entityType: string,
  data: Record<string, any>,
  accountKey: Uint8Array,
  tier: EncryptionTier,
  keyVersion: number = 1,
): Promise<{ plainPayload: Record<string, any>; encryptedPayload: string | undefined }> {
  const fields = getEncryptedFields(entityType, tier);

  if (fields.length === 0) {
    return { plainPayload: { ...data }, encryptedPayload: undefined };
  }

  const plainPayload: Record<string, any> = { ...data };
  const encryptedFields: Record<string, EncryptedFieldValue> = {};

  for (const field of fields) {
    const value = plainPayload[field];
    if (value === undefined || value === null) {
      continue;
    }

    // Convert numeric values to string for encryption
    const stringValue = typeof value === 'number' ? String(value) : String(value);

    try {
      encryptedFields[field] = await encryptField(stringValue, accountKey);
    } catch (error) {
      throw new Error(`Failed to encrypt field "${field}"`);
    }

    // Null/zero the sensitive field in the plain payload
    plainPayload[field] = typeof value === 'number' ? 0 : null;
  }

  // If no fields were actually encrypted (all were null/undefined), skip payload
  if (Object.keys(encryptedFields).length === 0) {
    return { plainPayload: { ...data }, encryptedPayload: undefined };
  }

  const payload: EncryptedPayload = {
    v: ENCRYPTION_CONFIG.encryptionFormatVersion,
    kv: keyVersion,
    fields: encryptedFields,
  };

  return {
    plainPayload,
    encryptedPayload: JSON.stringify(payload),
  };
}

/**
 * Decrypt entity data after pulling from the server.
 *
 * Parses the encrypted payload, decrypts each field, and merges the decrypted
 * values back into the data object. If there is no encrypted payload, the data
 * is returned unchanged.
 */
export async function decryptFromSync(
  entityType: string,
  data: Record<string, any>,
  encryptedPayloadStr: string | undefined,
  accountKey: Uint8Array,
): Promise<Record<string, any>> {
  if (!encryptedPayloadStr) {
    return { ...data };
  }

  let payload: EncryptedPayload;
  try {
    payload = JSON.parse(encryptedPayloadStr);
  } catch (error) {
    throw new Error('Invalid encrypted payload format');
  }

  if (!payload.fields || typeof payload.fields !== 'object') {
    return { ...data };
  }

  const result: Record<string, any> = { ...data };

  // Determine which fields are numeric so we can parse them back after decryption
  const config = ENCRYPTION_FIELDS[entityType];
  const numericFields = new Set<string>(config?.tier2 ?? []);

  for (const [field, encrypted] of Object.entries(payload.fields)) {
    if (!encrypted || !encrypted.iv || !encrypted.ct || !encrypted.tag) {
      continue;
    }

    try {
      const decryptedValue = await decryptField(encrypted, accountKey);

      // Restore numeric fields to their original type
      if (numericFields.has(field)) {
        const parsed = Number(decryptedValue);
        result[field] = Number.isNaN(parsed) ? decryptedValue : parsed;
      } else {
        result[field] = decryptedValue;
      }
    } catch (error) {
      throw new Error(`Failed to decrypt field "${field}"`);
    }
  }

  return result;
}
