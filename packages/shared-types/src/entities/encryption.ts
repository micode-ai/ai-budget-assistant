import type { EncryptionTier, KeyWrappingMethod } from './primitives';

export interface EncryptedFieldValue {
  iv: string;
  ct: string;
  tag: string;
}

export interface EncryptedPayload {
  v: number;
  kv: number;
  fields: Record<string, EncryptedFieldValue>;
}

export interface UserEncryptionProfile {
  id: string;
  userId: string;
  pbkdf2Salt: string;
  publicKeyX25519: string;
  publicKeyEd25519: string;
  wrappedPrivateKeyX25519: string;
  wrappedPrivateKeyEd25519: string;
  recoveryKeyHash?: string;
  wrappedMasterKeyByRecovery?: string;
  keyVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountEncryptionKey {
  id: string;
  accountId: string;
  userId: string;
  wrappedAccountKey: string;
  wrappedBy: string;
  wrappingMethod: KeyWrappingMethod;
  keyVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingKeyGrant {
  userId: string;
  userName: string;
  publicKeyX25519: string;
}
