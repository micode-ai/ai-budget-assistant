import {
  IsString,
  IsArray,
  ArrayNotEmpty,
  ArrayMaxSize,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertAliasDto {
  @IsString()
  @IsNotEmpty()
  rawName: string;

  @IsString()
  @IsNotEmpty()
  canonicalName: string;
}

export class MergeProductsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  rawNames: string[];

  @IsString()
  @IsNotEmpty()
  canonicalName: string;
}

class BasketItemDto {
  @IsString()
  @IsNotEmpty()
  canonicalName: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class BasketCompareRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BasketItemDto)
  items: BasketItemDto[];

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}
