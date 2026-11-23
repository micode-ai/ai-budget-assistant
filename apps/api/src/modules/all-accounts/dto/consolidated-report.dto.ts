import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

/** Body of `POST /all-accounts/reports`. Shape mirrors `ConsolidatedReportRequest` in shared-types. */
export class ConsolidatedReportBody {
  @IsEnum(['csv', 'pdf', 'excel'])
  format!: 'csv' | 'pdf' | 'excel';

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  includeIncomes?: boolean;

  @IsOptional()
  @IsBoolean()
  includeExpenses?: boolean;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  exclude?: string[];

  @IsOptional()
  @IsUUID('4')
  groupId?: string;
}
