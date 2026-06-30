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

export interface UpdatePurchaseRequestDto {
  title?: string;
  amount?: number;
  currency?: string;
  description?: string;
  merchant?: string;
  imageUrl?: string;
}

export interface VotePurchaseRequestDto {
  vote: VoteChoice;
  comment?: string;
}

export interface UpdateApprovalRuleDto {
  rule: ApprovalRule;
}
