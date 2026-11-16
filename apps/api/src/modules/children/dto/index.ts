import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { SUPPORTED_RATE_CURRENCIES } from '../../currency-exchange/exchange-rate.service';
import type {
  ChildStatementRequest,
  CreateChildRequest,
  SetExpenseChildrenRequest,
  UpdateChildRequest,
} from '@budget/shared-types';

/** Children store only a name (max 40), a colour and the archive mark — nothing else about a minor. */
export class CreateChildDto implements CreateChildRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  /** The device's local child id, so later ops can resolve it back to the server PK. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientId?: string;
}

export class UpdateChildDto implements UpdateChildRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  /** `true` sets `archivedAt`, `false` clears it. Children are archived, never hard-deleted. */
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class SetExpenseChildrenDto implements SetExpenseChildrenRequest {
  /** Server PKs or device clientIds; an empty list removes the whole-expense attribution. */
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  childIds: string[];

  /** One per `childIds` entry, summing to 1. Omitted → equal shares. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsNumber({}, { each: true })
  shares?: number[];
}

export class SetItemChildDto {
  /** A child id (PK or clientId), or explicit `null` to clear. Required — absent is rejected. */
  @ValidateIf((o: SetItemChildDto) => o.childId !== null)
  @IsString()
  @IsNotEmpty()
  childId: string | null;
}

export class ChildSuggestionsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  names: string[];
}

/**
 * `POST /children/:id/statement`. The path id wins over `childId`; the
 * statement currency is the caller's display currency from the session —
 * `currencyCode` is only a fallback when the user row carries none.
 */
export class ChildStatementDto implements Partial<ChildStatementRequest> {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  childId?: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;

  /** Only a currency the rate provider knows (the same list `ExchangeRateService` serves). */
  @IsOptional()
  @IsIn([...SUPPORTED_RATE_CURRENCIES])
  currencyCode?: string;
}

/** Move a child to another account the caller can edit (ABA-801). The client sends what the TARGET needs. */
export class MoveChildDto {
  @IsString()
  @IsNotEmpty()
  targetAccountId: string;

  /** Plaintext name — required when the target is not encrypted. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;

  /** Ciphertext under the TARGET's key — required when the target is encrypted. */
  @IsOptional()
  @IsString()
  encryptedPayload?: string;

  @IsOptional()
  @IsNumber()
  encryptionKeyVersion?: number;
}

/** A child's expense categories (ABA-802): category ids (server PK or the device's clientId). */
export class SetChildCategoriesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  categoryIds: string[];
}
