import { IsString, IsBoolean, IsOptional, IsArray } from 'class-validator';

export class CreateBackupDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includeEntities?: string[];
}

export class RestoreBackupDto {
  @IsString()
  data: string;

  @IsBoolean()
  overwrite: boolean;
}
