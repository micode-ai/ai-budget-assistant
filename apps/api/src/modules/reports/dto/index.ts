import { IsString, IsOptional, IsArray, IsBoolean, IsEnum, IsDateString, IsUUID, IsInt, Min, Max } from 'class-validator';

export class GenerateReportDto {
  @IsEnum(['csv', 'pdf', 'excel'])
  format: 'csv' | 'pdf' | 'excel';

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  projectIds?: string[];

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsBoolean()
  includeIncomes?: boolean;

  @IsOptional()
  @IsBoolean()
  includeExpenses?: boolean;
}

export class UpdateReportPreferencesDto {
  @IsOptional()
  @IsBoolean()
  weeklyEmailEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weeklyEmailDay?: number;

  @IsOptional()
  @IsBoolean()
  monthlyDigestEnabled?: boolean;
}
