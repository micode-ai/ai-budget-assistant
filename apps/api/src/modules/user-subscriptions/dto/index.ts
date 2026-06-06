import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsIn,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';

const BILLING_CYCLES = ['monthly', 'yearly', 'quarterly', 'weekly'] as const;
type BillingCycle = (typeof BILLING_CYCLES)[number];

export class CreateUserSubscriptionDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @MaxLength(10)
  currencyCode: string;

  @IsIn(BILLING_CYCLES)
  billingCycle: BillingCycle;

  @IsDateString()
  nextRenewalDate: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  detectedFrom?: string;
}

export class UpdateUserSubscriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currencyCode?: string;

  @IsOptional()
  @IsIn(BILLING_CYCLES)
  billingCycle?: BillingCycle;

  @IsOptional()
  @IsDateString()
  nextRenewalDate?: string;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
