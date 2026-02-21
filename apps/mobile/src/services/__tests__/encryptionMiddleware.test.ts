/**
 * Encryption middleware tests.
 * Verifies that fields are correctly encrypted/decrypted per entity type and tier.
 */

import { webcrypto } from 'crypto';

if (!globalThis.crypto) {
  // @ts-ignore - polyfill for test environment
  globalThis.crypto = webcrypto;
}

jest.mock('tweetnacl-util', () => ({
  encodeBase64: (data: Uint8Array) => Buffer.from(data).toString('base64'),
  decodeBase64: (str: string) => new Uint8Array(Buffer.from(str, 'base64')),
  encodeUTF8: (data: Uint8Array) => Buffer.from(data).toString('utf8'),
  decodeUTF8: (str: string) => new Uint8Array(Buffer.from(str, 'utf8')),
}));

jest.mock('@budget/shared-utils', () => ({
  ENCRYPTION_CONFIG: {
    pbkdf2Iterations: 1000,
    aesKeyLengthBits: 256,
    ivLengthBytes: 12,
    saltLengthBytes: 32,
    recoveryKeyLengthBytes: 32,
    encryptionFormatVersion: 1,
  },
  ENCRYPTION_FIELDS: {
    expense: {
      tier1: ['description', 'notes', 'locationName'],
      tier2: ['amount', 'discountAmount'],
    },
    income: {
      tier1: ['description', 'notes'],
      tier2: ['amount'],
    },
    budget: {
      tier1: ['name'],
      tier2: ['amount'],
    },
    category: {
      tier1: ['name'],
      tier2: [],
    },
    tag: {
      tier1: ['name'],
      tier2: [],
    },
    project: {
      tier1: ['name', 'description'],
      tier2: ['budget'],
    },
    walletBalance: {
      tier1: [],
      tier2: ['initialAmount'],
    },
    currencyExchange: {
      tier1: ['notes'],
      tier2: ['fromAmount', 'toAmount', 'exchangeRate'],
    },
  },
}));

// eslint-disable-next-line import/first
import { getRandomBytes } from '../crypto.web';
// eslint-disable-next-line import/first
import { encryptForSync, decryptFromSync } from '../encryptionMiddleware';

describe('encryptionMiddleware', () => {
  const accountKey = getRandomBytes(32);

  describe('Tier 1 — text fields only', () => {
    test('encrypts expense description and notes, leaves amount plaintext', async () => {
      const data = {
        description: 'Coffee at Starbucks',
        notes: 'With milk',
        amount: 5.99,
        categoryId: 'cat-123',
      };

      const { plainPayload, encryptedPayload } = await encryptForSync('expense', data, accountKey, 1);

      // Encrypted fields should be nulled in plainPayload
      expect(plainPayload.description).toBeNull();
      expect(plainPayload.notes).toBeNull();
      // Non-encrypted fields remain
      expect(plainPayload.amount).toBe(5.99);
      expect(plainPayload.categoryId).toBe('cat-123');

      // encryptedPayload should exist
      expect(encryptedPayload).toBeTruthy();
      const parsed = JSON.parse(encryptedPayload!);
      expect(parsed.v).toBe(1);
      expect(parsed.fields.description).toBeTruthy();
      expect(parsed.fields.notes).toBeTruthy();
      expect(parsed.fields.amount).toBeUndefined(); // Not in tier 1
    });

    test('decrypts expense back to original', async () => {
      const original = {
        description: 'Grocery shopping',
        notes: 'Weekly groceries',
        amount: 85.50,
      };

      const { plainPayload, encryptedPayload } = await encryptForSync('expense', original, accountKey, 1);

      const decrypted = await decryptFromSync(
        'expense',
        { ...plainPayload, encryptedPayload },
        encryptedPayload!,
        accountKey,
      );

      expect(decrypted.description).toBe('Grocery shopping');
      expect(decrypted.notes).toBe('Weekly groceries');
      expect(decrypted.amount).toBe(85.50);
    });
  });

  describe('Tier 2 — all sensitive fields', () => {
    test('encrypts expense amount in addition to text', async () => {
      const data = {
        description: 'Rent payment',
        amount: 1200,
        discountAmount: 0,
      };

      const { plainPayload, encryptedPayload } = await encryptForSync('expense', data, accountKey, 2);

      // All encrypted fields nulled/zeroed
      expect(plainPayload.description).toBeNull();
      expect(plainPayload.amount).toBe(0);
      expect(plainPayload.discountAmount).toBe(0);

      const parsed = JSON.parse(encryptedPayload!);
      expect(parsed.fields.description).toBeTruthy();
      expect(parsed.fields.amount).toBeTruthy();
    });

    test('decrypts tier 2 expense correctly', async () => {
      const original = {
        description: 'Electric bill',
        amount: 150.75,
        discountAmount: 10,
        categoryId: 'cat-bills',
      };

      const { plainPayload, encryptedPayload } = await encryptForSync('expense', original, accountKey, 2);
      const decrypted = await decryptFromSync('expense', { ...plainPayload, encryptedPayload }, encryptedPayload!, accountKey);

      expect(decrypted.description).toBe('Electric bill');
      expect(decrypted.amount).toBe(150.75);
      expect(decrypted.discountAmount).toBe(10);
      expect(decrypted.categoryId).toBe('cat-bills');
    });
  });

  describe('Tier 0 — no encryption', () => {
    test('returns data unchanged', async () => {
      const data = { description: 'Test', amount: 10 };
      const { plainPayload, encryptedPayload } = await encryptForSync('expense', data, accountKey, 0);

      expect(plainPayload).toEqual(data);
      expect(encryptedPayload).toBeUndefined();
    });
  });

  describe('Entity-specific encryption', () => {
    test('category encrypts name only (tier 1)', async () => {
      const data = { name: 'Food', icon: 'restaurant', color: '#FF0000' };
      const { plainPayload, encryptedPayload } = await encryptForSync('category', data, accountKey, 1);

      expect(plainPayload.name).toBeNull();
      expect(plainPayload.icon).toBe('restaurant');
      expect(plainPayload.color).toBe('#FF0000');
      expect(encryptedPayload).toBeTruthy();
    });

    test('project encrypts name, description, and budget (tier 2)', async () => {
      const data = { name: 'Home Renovation', description: 'Kitchen remodel', budget: 15000 };
      const { plainPayload, encryptedPayload } = await encryptForSync('project', data, accountKey, 2);

      expect(plainPayload.name).toBeNull();
      expect(plainPayload.description).toBeNull();
      expect(plainPayload.budget).toBe(0);

      const decrypted = await decryptFromSync('project', { ...plainPayload, encryptedPayload }, encryptedPayload!, accountKey);
      expect(decrypted.name).toBe('Home Renovation');
      expect(decrypted.description).toBe('Kitchen remodel');
      expect(decrypted.budget).toBe(15000);
    });
  });
});
