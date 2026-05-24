import {
  IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { ImportRowKind, ColumnMapping } from '@budget/shared-types';

export class ImportRowDto {
  @IsNumber()
  idx: number;

  @IsString()
  kind: ImportRowKind;

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

export class SaveMappingDto {
  @IsString()
  name: string;
}

export class BankImportCommitBodyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows: ImportRowDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SaveMappingDto)
  saveMapping?: SaveMappingDto;

  @IsOptional()
  @IsIn(['mbank', 'pko', 'ing', 'millennium', 'pekao', 'erste', 'universal'])
  bankId?: string;

  @IsOptional()
  @IsString()
  headerFingerprint?: string;

  @IsOptional()
  @IsObject()
  mapping?: ColumnMapping;

  @IsOptional()
  @IsString()
  delimiter?: string;

  @IsOptional()
  @IsString()
  encoding?: string;

  @IsOptional()
  @IsIn(['polish', 'standard'])
  amountFormat?: 'polish' | 'standard';

  @IsOptional()
  @IsIn(['auto', 'DD.MM.YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD'])
  dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
}

export class CreateMappingBodyDto {
  @IsString()
  name: string;

  @IsString()
  headerFingerprint: string;

  @IsOptional()
  @IsString()
  bankId?: string;

  @IsObject()
  mapping: ColumnMapping;

  @IsOptional()
  @IsString()
  delimiter?: string;

  @IsOptional()
  @IsString()
  encoding?: string;

  @IsOptional()
  @IsIn(['polish', 'standard'])
  amountFormat?: 'polish' | 'standard';

  @IsOptional()
  @IsIn(['auto', 'DD.MM.YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD'])
  dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
}
