export interface UpdatePushTokenDto {
  pushToken: string | null;
}

export interface UpdateNotificationPreferencesDto {
  budgetAlerts?: boolean;
  sharedAccountActivity?: boolean;
  debtReminders?: boolean;
  recurringExpenses?: boolean;
  subscriptionRenewals?: boolean;
  anomalyAlerts?: boolean;
  trackingGap?: boolean;
  purchaseRequests?: boolean;
  tripSettleUp?: boolean;
  shoppingReminders?: boolean;
  shoppingDeals?: boolean;
  inflationShield?: boolean;
  monthlyWrapped?: boolean;
  groupActivity?: boolean;
  groupReminders?: boolean;
  /** Gazetka match community promo push. */
  leafletPromos?: boolean;
}

export interface NotificationPreferencesResponse {
  budgetAlerts: boolean;
  sharedAccountActivity: boolean;
  debtReminders: boolean;
  recurringExpenses: boolean;
  subscriptionRenewals: boolean;
  anomalyAlerts: boolean;
  trackingGap: boolean;
  purchaseRequests: boolean;
  tripSettleUp: boolean;
  shoppingReminders: boolean;
  shoppingDeals: boolean;
  inflationShield: boolean;
  monthlyWrapped: boolean;
  groupActivity: boolean;
  groupReminders: boolean;
  leafletPromos: boolean;
}
