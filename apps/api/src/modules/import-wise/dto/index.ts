import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { WiseImportRowKind } from '@budget/shared-types';

export class WiseImportRowDto {
  @IsNumber()
  idx: number;

  @IsString()
  kind: WiseImportRowKind;

  @IsString()
  date: string;

  @IsNumber()
  amount: number;

  @IsString()
  currencyCode: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsString()
  externalRef: string;

  @IsOptional()
  @IsString()
  suggestedCategoryName?: string;

  @IsBoolean()
  alreadyImported: boolean;

  @IsOptional()
  @IsString()
  fxFromCurrency?: string;

  @IsOptional()
  @IsNumber()
  fxFromAmount?: number;

  @IsOptional()
  @IsString()
  fxToCurrency?: string;

  @IsOptional()
  @IsNumber()
  fxToAmount?: number;

  @IsOptional()
  @IsNumber()
  fxRate?: number;
}

export class WiseImportCommitDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WiseImportRowDto)
  rows: WiseImportRowDto[];
}
