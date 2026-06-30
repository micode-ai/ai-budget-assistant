import { IsString, IsNumber, IsPositive, IsIn, IsOptional, MaxLength } from 'class-validator';

export class CreatePurchaseRequestApiDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @MaxLength(10)
  currency: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  merchant?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class VotePurchaseRequestApiDto {
  @IsIn(['APPROVE', 'REJECT', 'ABSTAIN'])
  vote: 'APPROVE' | 'REJECT' | 'ABSTAIN';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class UpdateApprovalRuleApiDto {
  @IsIn(['MAJORITY', 'UNANIMOUS', 'OWNER_ONLY'])
  rule: 'MAJORITY' | 'UNANIMOUS' | 'OWNER_ONLY';
}
