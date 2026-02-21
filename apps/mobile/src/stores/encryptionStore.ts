import { create } from 'zustand';
import { secureStorage } from '../services/secureStorage';
import { api } from '../services/api';
import type { EncryptionTier } from '@budget/shared-types';
import * as encryptionRepo from '../db/encryptionRepository';
import {
  deriveKeyFromPassphrase,
  generateX25519KeyPair,
  generateEd25519KeyPair,
  computeSharedSecret,
  wrapKey,
  unwrapKey,
  generateRecoveryKey,
  getRandomBytes,
  toBase64,
  fromBase64,
} from '../services/crypto';
import { ENCRYPTION_CONFIG } from '@budget/shared-utils';
import { clearTierCache } from '../services/encryptionHelper';

interface EncryptionState {
  /** Whether the current user has set up E2EE at all */
  isSetUp: boolean;
  /** Whether the master key is currently unlocked in memory */
  isUnlocked: boolean;
  /** Loading state for async operations */
  isLoading: boolean;
  error: string | null;
  /** In-memory map of accountId → decrypted account key bytes */
  accountKeys: Map<string, { key: Uint8Array; keyVersion: number }>;

  // Actions
  initialize: () => Promise<void>;
  setupE2EE: (passphrase: string) => Promise<{ recoveryKey: string }>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  enableAccountEncryption: (accountId: string, tier: EncryptionTier) => Promise<void>;
  fetchAccountKey: (accountId: string) => Promise<void>;
  getAccountKey: (accountId: string) => { key: Uint8Array; keyVersion: number } | null;
  getAccountTier: (accountId: string) => Promise<EncryptionTier>;
  grantKeyToMember: (accountId: string, targetUserId: string) => Promise<void>;
  rotateAccountKey: (accountId: string) => Promise<void>;
  setupRecovery: (passphrase: string) => Promise<{ recoveryKey: string }>;
  recoverWithKey: (recoveryKey: string, newPassphrase: string) => Promise<void>;
  resetE2EE: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

// In-memory master key — never persisted to disk in plaintext
let masterKey: Uint8Array | null = null;
let identityKeyX25519: { publicKey: Uint8Array; secretKey: Uint8Array } | null = null;

export const useEncryptionStore = create<EncryptionState>()((set, get) => ({
  isSetUp: false,
  isUnlocked: false,
  isLoading: false,
  error: null,
  accountKeys: new Map(),

  initialize: async () => {
    try {
      // Always verify with server — local flag may be stale from incomplete setup
      const profile = await api.getEncryptionProfile();
      if (profile?.pbkdf2Salt && profile.recoveryConfigured) {
        await secureStorage.setItem('e2ee_setup', 'true');
        set({ isSetUp: true });
      } else {
        // Profile exists but incomplete — allow re-setup
        await secureStorage.removeItem('e2ee_setup');
        set({ isSetUp: false });
      }
    } catch {
      // No profile on server or not authenticated — check local flag as fallback
      try {
        const hasProfile = await secureStorage.getItem('e2ee_setup');
        set({ isSetUp: hasProfile === 'true' });
      } catch {
        // Storage error
      }
    }
  },

  setupE2EE: async (passphrase: string) => {
    set({ isLoading: true, error: null });
    try {
      // 1. Generate salt and derive master key
      const salt = getRandomBytes(ENCRYPTION_CONFIG.saltLengthBytes);
      const mk = await deriveKeyFromPassphrase(passphrase, salt);

      // 2. Generate identity key pairs
      const x25519 = generateX25519KeyPair();
      const ed25519 = generateEd25519KeyPair();

      // 3. Wrap private keys with master key
      const wrappedX25519 = await wrapKey(x25519.secretKey, mk);
      const wrappedEd25519 = await wrapKey(ed25519.secretKey, mk);

      // 4. Generate recovery key and wrap MK with it
      const recovery = generateRecoveryKey();
      const wrappedMkByRecovery = await wrapKey(mk, recovery.key);

      // 5. Send to server
      await api.setupEncryption({
        pbkdf2Salt: toBase64(salt),
        publicKeyX25519: toBase64(x25519.publicKey),
        publicKeyEd25519: toBase64(ed25519.publicKey),
        wrappedPrivateKeyX25519: wrappedX25519,
        wrappedPrivateKeyEd25519: wrappedEd25519,
      });

      // 6. Set up recovery on server (server hashes the key with bcrypt)
      await api.setupRecovery({
        recoveryKeyPlaintext: recovery.display,
        wrappedMasterKeyByRecovery: wrappedMkByRecovery,
      });

      // 7. Store master key in memory
      masterKey = mk;
      identityKeyX25519 = x25519;

      // 8. Mark as set up
      await secureStorage.setItem('e2ee_setup', 'true');

      set({ isSetUp: true, isUnlocked: true, isLoading: false });

      return { recoveryKey: recovery.display };
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'E2EE setup failed',
        isLoading: false,
      });
      throw error;
    }
  },

  unlock: async (passphrase: string) => {
    set({ isLoading: true, error: null });
    try {
      // 1. Fetch encryption profile from server
      const profile = await api.getEncryptionProfile();

      // 2. Derive master key from passphrase + stored salt
      const salt = fromBase64(profile.pbkdf2Salt);
      const mk = await deriveKeyFromPassphrase(passphrase, salt);

      // 3. Try to unwrap private keys to verify the passphrase is correct
      const x25519SecretKey = await unwrapKey(profile.wrappedPrivateKeyX25519, mk);
      const x25519PublicKey = fromBase64(profile.publicKeyX25519);

      // 4. Store in memory
      masterKey = mk;
      identityKeyX25519 = { publicKey: x25519PublicKey, secretKey: x25519SecretKey };

      // 5. Load cached account keys from local DB
      const cachedKeys = await encryptionRepo.getAllAccountKeys();
      const accountKeys = new Map<string, { key: Uint8Array; keyVersion: number }>();
      for (const cached of cachedKeys) {
        try {
          const decryptedKey = await unwrapKey(cached.accountKey, mk);
          accountKeys.set(cached.accountId, { key: decryptedKey, keyVersion: cached.keyVersion });
        } catch {
          // Key may be stale — will be re-fetched
        }
      }

      set({ isUnlocked: true, isLoading: false, accountKeys });
    } catch (error) {
      masterKey = null;
      identityKeyX25519 = null;
      set({
        error: error instanceof Error ? error.message : 'Failed to unlock encryption',
        isLoading: false,
      });
      throw error;
    }
  },

  lock: () => {
    masterKey = null;
    identityKeyX25519 = null;
    set({
      isUnlocked: false,
      accountKeys: new Map(),
    });
  },

  enableAccountEncryption: async (accountId: string, tier: EncryptionTier) => {
    set({ isLoading: true, error: null });
    try {
      if (!masterKey) throw new Error('Encryption is locked');
      if (tier === 0) throw new Error('Invalid tier');

      // 1. Generate a new account key
      const accountKey = getRandomBytes(ENCRYPTION_CONFIG.aesKeyLengthBits / 8);

      // 2. Wrap it with master key for storage
      const wrappedAccountKey = await wrapKey(accountKey, masterKey);

      // 3. Enable on server
      await api.enableAccountEncryption(accountId, { tier, wrappedAccountKey });

      // 4. Cache locally (wrapped with MK)
      await encryptionRepo.setAccountKey(accountId, wrappedAccountKey, 1);

      // 5. Store in memory
      const accountKeys = new Map(get().accountKeys);
      accountKeys.set(accountId, { key: accountKey, keyVersion: 1 });

      // 6. Clear tier cache so maybeEncrypt picks up the new tier immediately
      clearTierCache(accountId);

      set({ accountKeys, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to enable encryption',
        isLoading: false,
      });
      throw error;
    }
  },

  fetchAccountKey: async (accountId: string) => {
    try {
      if (!masterKey || !identityKeyX25519) throw new Error('Encryption is locked');

      // Already in memory
      if (get().accountKeys.has(accountId)) return;

      // Try to fetch from server
      const response = await api.getAccountEncryptionKey(accountId);

      let accountKey: Uint8Array;
      if (response.wrappingMethod === 'master_key') {
        // Wrapped with our master key
        accountKey = await unwrapKey(response.wrappedAccountKey, masterKey);
      } else {
        // Wrapped with ECDH shared secret — need to compute it
        const granterPublicKey = fromBase64(response.wrappedBy);
        const sharedSecret = computeSharedSecret(identityKeyX25519.secretKey, granterPublicKey);
        accountKey = await unwrapKey(response.wrappedAccountKey, sharedSecret);
      }

      // Cache locally (re-wrap with MK for local persistence)
      const wrappedForLocal = await wrapKey(accountKey, masterKey);
      await encryptionRepo.setAccountKey(accountId, wrappedForLocal, response.keyVersion);

      // Store in memory
      const accountKeys = new Map(get().accountKeys);
      accountKeys.set(accountId, { key: accountKey, keyVersion: response.keyVersion });
      set({ accountKeys });
    } catch (error) {
      console.error('Failed to fetch account key:', error);
    }
  },

  getAccountKey: (accountId: string) => {
    return get().accountKeys.get(accountId) ?? null;
  },

  getAccountTier: async (accountId: string): Promise<EncryptionTier> => {
    try {
      const status = await api.getAccountEncryptionStatus(accountId);
      return status.encryptionTier as EncryptionTier;
    } catch {
      return 0;
    }
  },

  grantKeyToMember: async (accountId: string, targetUserId: string) => {
    set({ isLoading: true, error: null });
    try {
      if (!identityKeyX25519) throw new Error('Encryption is locked');

      const accountKeyData = get().accountKeys.get(accountId);
      if (!accountKeyData) throw new Error('Account key not available');

      // 1. Fetch target member's public key
      const { members } = await api.getMemberPublicKeys(accountId);
      const target = members.find((m) => m.userId === targetUserId);
      if (!target) throw new Error('Member public key not found');

      // 2. Compute ECDH shared secret
      const targetPublicKey = fromBase64(target.publicKeyX25519);
      const sharedSecret = computeSharedSecret(identityKeyX25519.secretKey, targetPublicKey);

      // 3. Wrap account key with shared secret
      const wrappedAccountKey = await wrapKey(accountKeyData.key, sharedSecret);

      // 4. Send to server
      await api.grantEncryptionKey(accountId, {
        targetUserId,
        wrappedAccountKey,
        wrappingMethod: 'ecdh',
      });

      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to grant key',
        isLoading: false,
      });
      throw error;
    }
  },

  rotateAccountKey: async (accountId: string) => {
    set({ isLoading: true, error: null });
    try {
      if (!masterKey || !identityKeyX25519) throw new Error('Encryption is locked');

      // 1. Generate new account key
      const newAccountKey = getRandomBytes(ENCRYPTION_CONFIG.aesKeyLengthBits / 8);

      // 2. Get all members' public keys
      const { members } = await api.getMemberPublicKeys(accountId);

      // 3. Wrap new key for each member
      const newWrappedKeys = await Promise.all(
        members.map(async (member) => {
          const memberPublicKey = fromBase64(member.publicKeyX25519);
          const sharedSecret = computeSharedSecret(identityKeyX25519!.secretKey, memberPublicKey);
          const wrappedAccountKey = await wrapKey(newAccountKey, sharedSecret);
          return { userId: member.userId, wrappedAccountKey };
        }),
      );

      // 4. Send to server
      await api.rotateAccountKey(accountId, { newWrappedKeys });

      // 5. Update local cache
      const wrappedForLocal = await wrapKey(newAccountKey, masterKey);
      const oldKeyData = get().accountKeys.get(accountId);
      const newKeyVersion = (oldKeyData?.keyVersion ?? 0) + 1;
      await encryptionRepo.setAccountKey(accountId, wrappedForLocal, newKeyVersion);

      const accountKeys = new Map(get().accountKeys);
      accountKeys.set(accountId, { key: newAccountKey, keyVersion: newKeyVersion });
      set({ accountKeys, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to rotate key',
        isLoading: false,
      });
      throw error;
    }
  },

  setupRecovery: async (passphrase: string) => {
    set({ isLoading: true, error: null });
    try {
      if (!masterKey) throw new Error('Encryption is locked');

      const recovery = generateRecoveryKey();
      const wrappedMkByRecovery = await wrapKey(masterKey, recovery.key);

      await api.setupRecovery({
        recoveryKeyPlaintext: recovery.display,
        wrappedMasterKeyByRecovery: wrappedMkByRecovery,
      });

      set({ isLoading: false });
      return { recoveryKey: recovery.display };
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to setup recovery',
        isLoading: false,
      });
      throw error;
    }
  },

  recoverWithKey: async (recoveryKeyDisplay: string, newPassphrase: string) => {
    set({ isLoading: true, error: null });
    try {
      // 1. Parse the recovery key from display format
      const hexStr = recoveryKeyDisplay.replace(/-/g, '').toLowerCase();
      const recoveryKeyBytes = new Uint8Array(
        hexStr.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
      );

      // 2. Send recovery key to server for verification and get wrapped MK
      const response = await api.recoverEncryption(recoveryKeyDisplay);

      // 3. Unwrap master key using recovery key
      const mk = await unwrapKey(response.wrappedMasterKeyByRecovery, recoveryKeyBytes);

      // 4. Derive new master key from new passphrase
      const newSalt = getRandomBytes(ENCRYPTION_CONFIG.saltLengthBytes);
      const newMk = await deriveKeyFromPassphrase(newPassphrase, newSalt);

      // 5. Re-wrap private keys with new master key
      const oldX25519Secret = await unwrapKey(response.wrappedPrivateKeyX25519, mk);
      const oldEd25519Secret = await unwrapKey(response.wrappedPrivateKeyEd25519, mk);

      const newWrappedX25519 = await wrapKey(oldX25519Secret, newMk);
      const newWrappedEd25519 = await wrapKey(oldEd25519Secret, newMk);

      // 6. Update profile on server with new salt and wrapped keys
      await api.setupEncryption({
        pbkdf2Salt: toBase64(newSalt),
        publicKeyX25519: response.publicKeyX25519,
        publicKeyEd25519: response.publicKeyEd25519,
        wrappedPrivateKeyX25519: newWrappedX25519,
        wrappedPrivateKeyEd25519: newWrappedEd25519,
      });

      // 7. Generate new recovery key
      const recovery = generateRecoveryKey();
      const wrappedMkByRecovery = await wrapKey(newMk, recovery.key);

      await api.setupRecovery({
        recoveryKeyPlaintext: recovery.display,
        wrappedMasterKeyByRecovery: wrappedMkByRecovery,
      });

      // 8. Set new master key in memory
      masterKey = newMk;
      identityKeyX25519 = {
        publicKey: fromBase64(response.publicKeyX25519),
        secretKey: oldX25519Secret,
      };

      await secureStorage.setItem('e2ee_setup', 'true');
      set({ isSetUp: true, isUnlocked: true, isLoading: false });

      // Note: caller should show the new recovery key to the user
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Recovery failed',
        isLoading: false,
      });
      throw error;
    }
  },

  resetE2EE: async () => {
    set({ isLoading: true, error: null });
    try {
      await api.resetEncryptionProfile();
      await secureStorage.removeItem('e2ee_setup');
      masterKey = null;
      identityKeyX25519 = null;
      set({
        isSetUp: false,
        isUnlocked: false,
        isLoading: false,
        error: null,
        accountKeys: new Map(),
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to reset encryption',
        isLoading: false,
      });
      throw error;
    }
  },

  clearError: () => set({ error: null }),

  reset: () => {
    masterKey = null;
    identityKeyX25519 = null;
    set({
      isSetUp: false,
      isUnlocked: false,
      isLoading: false,
      error: null,
      accountKeys: new Map(),
    });
  },
}));
