import { httpClient } from './http-client';
import type { UserSubscription } from '@budget/shared-types';

interface CreateUserSubscriptionInput {
  name: string;
  amount: number;
  currencyCode: string;
  billingCycle: 'monthly' | 'yearly' | 'quarterly' | 'weekly';
  nextRenewalDate: string;
  categoryId?: string;
  notes?: string;
  detectedFrom?: string;
}

interface UpdateUserSubscriptionInput {
  name?: string;
  amount?: number;
  currencyCode?: string;
  billingCycle?: 'monthly' | 'yearly' | 'quarterly' | 'weekly';
  nextRenewalDate?: string;
  categoryId?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export const userSubscriptionsApi = {
  list() {
    return httpClient.request<UserSubscription[]>('/user-subscriptions');
  },

  create(dto: CreateUserSubscriptionInput) {
    return httpClient.request<UserSubscription>('/user-subscriptions', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  update(id: string, dto: UpdateUserSubscriptionInput) {
    return httpClient.request<UserSubscription>(`/user-subscriptions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  remove(id: string) {
    return httpClient.request<void>(`/user-subscriptions/${id}`, { method: 'DELETE' });
  },
};
