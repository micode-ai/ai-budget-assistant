import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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
