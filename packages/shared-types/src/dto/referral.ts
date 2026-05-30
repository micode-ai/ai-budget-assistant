export interface ReferralStatsDto {
  referralCode: string;
  totalReferrals: number;
  qualifiedReferrals: number;
  pendingReferrals: number;
  bonusAiRequests: number;
  nextMilestone: { count: number; reward: string } | null;
}

export interface ReferralListItemDto {
  id: string;
  referredName: string;
  status: 'pending' | 'qualified' | 'expired';
  createdAt: string;
  qualifiedAt: string | null;
}
