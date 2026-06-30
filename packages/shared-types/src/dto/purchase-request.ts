import type { ApprovalRule, VoteChoice } from '../entities/purchase-request';

export interface CreatePurchaseRequestDto {
  title: string;
  amount: number;
  currency: string;
  description?: string;
  categoryId?: string;
  merchant?: string;
  imageUrl?: string;
  expiresAt?: string;
}

export interface VotePurchaseRequestDto {
  vote: VoteChoice;
  comment?: string;
}

export interface UpdateApprovalRuleDto {
  rule: ApprovalRule;
}
