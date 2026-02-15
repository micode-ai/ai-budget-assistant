import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsIn,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SetupEncryptionDto {
  @IsString()
  @IsNotEmpty()
  pbkdf2Salt: string;

  @IsString()
  @IsNotEmpty()
  publicKeyX25519: string;

  @IsString()
  @IsNotEmpty()
  publicKeyEd25519: string;

  @IsString()
  @IsNotEmpty()
  wrappedPrivateKeyX25519: string;

  @IsString()
  @IsNotEmpty()
  wrappedPrivateKeyEd25519: string;
}

export class EnableAccountEncryptionDto {
  @IsIn([1, 2])
  tier: number;

  @IsString()
  @IsNotEmpty()
  wrappedAccountKey: string;
}

export class GrantKeyDto {
  @IsUUID()
  targetUserId: string;

  @IsString()
  @IsNotEmpty()
  wrappedAccountKey: string;

  @IsString()
  @IsNotEmpty()
  wrappingMethod: string;
}

class RotatedKeyEntry {
  @IsUUID()
  userId: string;

  @IsString()
  @IsNotEmpty()
  wrappedAccountKey: string;
}

export class RotateAccountKeyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RotatedKeyEntry)
  wrappedKeys: RotatedKeyEntry[];
}

export class SetupRecoveryDto {
  @IsString()
  @IsNotEmpty()
  recoveryKeyPlaintext: string;

  @IsString()
  @IsNotEmpty()
  wrappedMasterKeyByRecovery: string;
}

export class RecoverEncryptionDto {
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  recoveryKey: string;
}
