import { IsString, IsArray, ArrayNotEmpty, ArrayMaxSize, IsNotEmpty } from 'class-validator';

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
