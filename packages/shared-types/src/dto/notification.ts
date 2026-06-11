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
}

export interface NotificationPreferencesResponse {
  budgetAlerts: boolean;
  sharedAccountActivity: boolean;
  debtReminders: boolean;
  recurringExpenses: boolean;
  subscriptionRenewals: boolean;
  anomalyAlerts: boolean;
}
