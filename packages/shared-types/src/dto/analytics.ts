import type { DrillDownLevel, ChartConfig, AIInsightChart } from '../entities';

export interface AnalyticsSummary {
  period: {
    start: string;
    end: string;
  };
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  expensesByCategory: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
    count: number;
    vsAverage?: number | null;
  }>;
  topExpenses: Array<{
    id: string;
    description: string;
    amount: number;
    date: string;
    categoryName: string;
  }>;
  totalDiscountSavings: number;
  trends: {
    vsLastPeriod: number;
    vsAverage: number;
  };
}

export interface InsightsResponse {
  anomalies: Array<{
    categoryId: string;
    categoryName: string;
    currentAmount: number;
    averageAmount: number;
    percentageChange: number;
    period: string;
  }>;
  predictions: Array<{
    budgetId: string;
    budgetName: string;
    estimatedExhaustionDate?: string;
    dailyBurnRate: number;
    daysRemaining: number;
    projectedTotal: number;
    currencyCode: string;
  }>;
}

export interface DrillDownRequest {
  level: DrillDownLevel;
  parentId?: string;
  startDate: string;
  endDate: string;
  currencyCode?: string;
  locale?: string;
}

export interface DrillDownResponse {
  chart: ChartConfig;
  transactions?: Array<{
    id: string;
    description: string;
    amount: number;
    date: string;
    categoryName: string;
    currencyCode: string;
  }>;
  breadcrumb: Array<{
    level: DrillDownLevel;
    label: string;
    id?: string;
  }>;
}

export interface AIInsightsResponse {
  insights: AIInsightChart[];
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
}

/**
 * The two "money already accounted for on a receipt" figures Quick Insights
 * surfaces as a tappable stat row — discounts already applied, and returnable-
 * packaging deposits already paid. Mirrors the AI chat's `get_discount_total`/
 * `get_deposit_total` tools deliberately: same underlying `Expense.discountAmount`/
 * `depositAmount` columns, same pure `summariseDiscounts`/`summariseDeposits`
 * util, same FX-conversion rules — this is the plain-REST read of the exact
 * same computation, not a second one.
 */
export type SavingsKind = 'discount' | 'deposit';

export interface SavingsMerchantTotal {
  merchant: string;
  amount: number;
  receiptCount: number;
}

export interface SavingsReceipt {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Null when the receipt named neither a merchant nor a description. */
  merchant: string | null;
  amount: number;
  /**
   * The expense's server PK, for tapping through to `/expense/:id`. Always
   * present on a real response from `GET /analytics/savings-detail` — the
   * field is optional only because the pure `summariseDeposits`/
   * `summariseDiscounts` util is shared with the AI tool's own unit tests,
   * whose fixture rows don't carry one.
   */
  expenseId?: string;
}

export interface SavingsSummaryResponse {
  kind: SavingsKind;
  /**
   * True for a fully-encrypted (tier-2) account — every other field is a
   * placeholder (`0`/`[]`) in that case, never a real (wrong) figure. Check
   * this FIRST, same rule the AI tool's narration follows.
   */
  encryptionRestricted: boolean;
  /** In `baseCurrency`. Counts only rows that could be converted. */
  total: number;
  /** Receipts counted toward `total`. */
  receiptCount: number;
  byMerchant: SavingsMerchantTotal[];
  recent: SavingsReceipt[];
  /** Native per-currency totals over EVERY row, convertible or not. */
  totalsByCurrency: Record<string, number>;
  baseCurrency: string;
  /** True when at least one row needed a currency conversion. */
  fxConverted: boolean;
  /** True when at least one row could not be converted and was excluded from `total`. */
  fxApproximate: boolean;
  /** Rows dropped from `total` for want of an exchange rate. */
  unconvertedCount: number;
  /** The underlying row query hit its ceiling — the lists below are not exhaustive. */
  truncated: boolean;
  period: { startDate: string; endDate: string };
}
