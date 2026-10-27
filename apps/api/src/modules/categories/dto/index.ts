import { IsString, IsOptional, IsIn, Allow } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsString()
  @IsIn(['expense', 'income'])
  type: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  // Server-owned: accepted so the global whitelist pipe does not 400 a client
  // that echoes a category back, then ignored by CategoriesService.
  @IsOptional()
  @Allow()
  systemKey?: string | null;

  @IsOptional()
  @Allow()
  nameCustomized?: boolean;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['expense', 'income'])
  type?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  // Server-owned: accepted so the global whitelist pipe does not 400 a client
  // that echoes a category back, then ignored by CategoriesService.
  @IsOptional()
  @Allow()
  systemKey?: string | null;

  @IsOptional()
  @Allow()
  nameCustomized?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['TOTAL', 'CP01', 'CP02', 'CP03', 'CP04', 'CP05', 'CP06', 'CP07', 'CP08', 'CP09', 'CP10', 'CP11', 'CP12', 'CP13'])
  coicopDivision?: string;
}
