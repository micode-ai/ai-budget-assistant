export type PurchaseRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PURCHASED' | 'EXPIRED';
export type ApprovalRule = 'MAJORITY' | 'UNANIMOUS' | 'OWNER_ONLY';
export type VoteChoice = 'APPROVE' | 'REJECT' | 'ABSTAIN';

export interface PurchaseRequestVote {
  id: string;
  requestId: string;
  userId: string;
  userName: string;
  vote: VoteChoice;
  comment?: string;
  createdAt: string;
}

export interface PurchaseRequest {
  id: string;
  accountId: string;
  createdByUserId: string;
  createdByUserName?: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  categoryId?: string;
  merchant?: string;
  imageUrl?: string;
  status: PurchaseRequestStatus;
  approvalRule: ApprovalRule;
  plannedExpenseId?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  votes?: PurchaseRequestVote[];
}
