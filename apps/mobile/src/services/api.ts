import { httpClient } from './http-client';
import { authApi } from './auth.api';
import { usersApi } from './users.api';
import { expensesApi } from './expenses.api';
import { incomesApi } from './incomes.api';
import { budgetsApi } from './budgets.api';
import { categoriesApi } from './categories.api';
import { analyticsApi } from './analytics.api';
import { aiApi } from './ai.api';
import { accountsApi } from './accounts.api';
import { walletApi } from './wallet.api';
import { investmentsApi } from './investments.api';
import { encryptionApi } from './encryption.api';
import { reportsApi } from './reports.api';
import { subscriptionsApi } from './subscriptions.api';
import { importBankApi } from './import-bank.api';
import { userSubscriptionsApi } from './userSubscriptions.api';
import { alertsApi } from './alerts.api';
import { merchantRulesApi } from './merchantRules.api';

export const api = {
  setAccountIdGetter: (getter: () => string | null) => httpClient.setAccountIdGetter(getter),
  setLogoutHandler: (handler: () => void) => httpClient.setLogoutHandler(handler),
  ...authApi,
  ...usersApi,
  ...expensesApi,
  ...incomesApi,
  ...budgetsApi,
  ...categoriesApi,
  ...analyticsApi,
  ...aiApi,
  ...accountsApi,
  ...walletApi,
  ...investmentsApi,
  ...encryptionApi,
  ...reportsApi,
  ...subscriptionsApi,
  ...importBankApi,
  ...userSubscriptionsApi,
  ...alertsApi,
  ...merchantRulesApi,
};

export function getApiBaseUrl(): string {
  return httpClient.baseUrl;
}
