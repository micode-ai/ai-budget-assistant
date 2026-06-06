export class CreateUserSubscriptionDto {
  name: string;
  amount: number;
  currencyCode: string;
  billingCycle: 'monthly' | 'yearly' | 'quarterly' | 'weekly';
  nextRenewalDate: string;
  categoryId?: string;
  notes?: string;
  detectedFrom?: string;
}

export class UpdateUserSubscriptionDto {
  name?: string;
  amount?: number;
  currencyCode?: string;
  billingCycle?: 'monthly' | 'yearly' | 'quarterly' | 'weekly';
  nextRenewalDate?: string;
  categoryId?: string | null;
  notes?: string | null;
  isActive?: boolean;
}
