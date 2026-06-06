import type { BillingCycle } from './primitives';

export interface UserSubscription {
  id: string;
  accountId: string;
  name: string;
  amount: number;
  currencyCode: string;
  billingCycle: BillingCycle;
  nextRenewalDate: string;
  categoryId: string | null;
  notes: string | null;
  detectedFrom: string | null;
  isActive: boolean;
  monthlyEquivalent: number;
  daysUntilRenewal: number;
  createdAt: string;
  updatedAt: string;
}
