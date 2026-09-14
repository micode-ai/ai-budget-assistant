import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateListDto {
  @IsString() clientId: string;
  @IsString() @IsNotEmpty() name: string;
}
export class UpdateListDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() isArchived?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}
export class CreateItemDto {
  @IsString() clientId: string;
  @IsOptional() @IsString() canonicalName?: string | null;
  @IsString() @IsNotEmpty() rawLabel: string;
  @IsOptional() @IsNumber() @Min(0.001) quantity?: number;
  @IsOptional() @IsString() note?: string;
}
export class UpdateItemDto {
  @IsOptional() @IsBoolean() isChecked?: boolean;
  @IsOptional() @IsNumber() @Min(0.001) quantity?: number;
  @IsOptional() @IsString() rawLabel?: string;
  @IsOptional() @IsString() note?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
}

// --- "my weekly staples" templates ---

export class CreateTemplateItemDto {
  @IsOptional() @IsString() canonicalName?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(120) rawLabel: string;
}

export class CreateTemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateTemplateItemDto)
  items: CreateTemplateItemDto[];
}

export class UpdateTemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;
}

export class ApplyTemplateDto {
  @IsString() @IsNotEmpty() listId: string;
}
