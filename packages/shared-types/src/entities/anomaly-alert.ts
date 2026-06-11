export type AnomalyAlertType =
  | 'category_spike'
  | 'price_increase'
  | 'duplicate_charge'
  | 'recurring_suggestion';

export interface AnomalyAlert {
  id: string;
  accountId: string;
  userId: string;
  type: AnomalyAlertType;
  params: Record<string, unknown>;
  expenseId: string | null;
  categoryId: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

export interface AnomalyAlertListResponse {
  alerts: AnomalyAlert[];
  unreadCount: number;
}
