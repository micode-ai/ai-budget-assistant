import type { EncryptionTier, KeyWrappingMethod, PendingKeyGrant } from '../entities';

export interface SetupEncryptionDto {
  pbkdf2Salt: string;
  publicKeyX25519: string;
  publicKeyEd25519: string;
  wrappedPrivateKeyX25519: string;
  wrappedPrivateKeyEd25519: string;
}

export interface EncryptionProfileResponse {
  pbkdf2Salt: string;
  publicKeyX25519: string;
  publicKeyEd25519: string;
  wrappedPrivateKeyX25519: string;
  wrappedPrivateKeyEd25519: string;
  keyVersion: number;
  recoveryConfigured: boolean;
}

export interface EnableAccountEncryptionDto {
  tier: 1 | 2;
  wrappedAccountKey: string;
}

export interface AccountEncryptionKeyResponse {
  wrappedAccountKey: string;
  wrappedBy: string;
  wrappingMethod: KeyWrappingMethod;
  keyVersion: number;
}

export interface GrantKeyDto {
  targetUserId: string;
  wrappedAccountKey: string;
  wrappingMethod: KeyWrappingMethod;
}

export interface PendingKeyGrantsResponse {
  pending: PendingKeyGrant[];
}

export interface RotateAccountKeyDto {
  newWrappedKeys: Array<{
    userId: string;
    wrappedAccountKey: string;
  }>;
}

export interface SetupRecoveryDto {
  recoveryKeyPlaintext: string;
  wrappedMasterKeyByRecovery: string;
}

export interface RecoverEncryptionDto {
  recoveryKey: string;
}

export interface RecoverEncryptionResponse {
  wrappedMasterKeyByRecovery: string;
  pbkdf2Salt: string;
  publicKeyX25519: string;
  publicKeyEd25519: string;
  wrappedPrivateKeyX25519: string;
  wrappedPrivateKeyEd25519: string;
}

export interface MemberPublicKeyResponse {
  members: Array<{
    userId: string;
    publicKeyX25519: string;
  }>;
}

export interface AccountEncryptionStatusResponse {
  encryptionEnabled: boolean;
  encryptionTier: EncryptionTier;
  keyVersion: number;
  keyRotationNeeded: boolean;
}
