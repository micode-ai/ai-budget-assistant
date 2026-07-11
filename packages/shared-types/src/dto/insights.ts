export interface SafeToSpendBreakdown {
  walletBalance: number;          // Σ converted current balances
  expectedIncome: number;         // 0 if not inferred
  upcomingSubscriptions: number;
  upcomingRecurring: number;
  goalContributions: number;
  buffer: number;
}

export interface SafeToSpendResponse {
  baseCurrency: string;           // user.currencyCode
  safeToSpendToday: number;
  projectedAvailable: number;
  daysRemaining: number;
  horizonDate: string;            // ISO date, end-of-month or next income date
  incomeInferred: boolean;
  fxApproximate: boolean;         // true if any amount was FX-converted
  breakdown: SafeToSpendBreakdown;
  computedAt: string;             // ISO datetime
}

export interface AffordabilityVerdict {
  affordable: boolean;
  amount: number;
  currencyCode: string;
  safeToSpendToday: number;       // in base currency
  amountInBase: number;
  reasonCode:
    | 'within_safe'               // amount <= safeToSpendToday
    | 'within_available_tight'    // <= projectedAvailable but eats most of it
    | 'over_available'            // exceeds projectedAvailable
    | 'delays_goal'               // affordable but pushes a goal off-track
    | 'wait_until_income';        // affordable only after next inferred income
  goalImpact?: { goalName: string; slipDays: number };
  suggestedDate?: string;         // ISO date, for wait_until_income
  baseCurrency: string;
}

// ── Financial Wrapped (ABA-336) ──────────────────────────────
// A Spotify-Wrapped-style year-in-review assembled entirely from existing data.
// Server returns numeric facts only; the mobile client narrates + composes the
// share text from its own i18n so all 9 locales stay the source of truth.

export type WrappedCardType =
  | 'intro'
  | 'total_tracked'
  | 'top_merchant'
  | 'biggest_month'
  | 'top_category'
  | 'category_mix'
  | 'receipts_scanned'
  | 'savings'
  | 'personal_inflation'
  | 'streak'
  | 'outro';

export interface WrappedIntroCard {
  type: 'intro';
  year: number;
  baseCurrency: string;
}

export interface WrappedTotalTrackedCard {
  type: 'total_tracked';
  totalExpenses: number;          // Σ converted into baseCurrency
  totalIncome: number;
  transactionCount: number;       // expenses + incomes rows tracked in the year
  baseCurrency: string;
  fxApproximate: boolean;
}

export interface WrappedTopMerchantCard {
  type: 'top_merchant';
  name: string;
  visits: number;                 // number of expenses at this merchant
  totalSpent: number;             // in baseCurrency
  baseCurrency: string;
  fxApproximate: boolean;
}

export interface WrappedBiggestMonthCard {
  type: 'biggest_month';
  month: string;                  // 'YYYY-MM'
  monthIndex: number;             // 0-11, for client localized month name
  amount: number;                 // in baseCurrency
  baseCurrency: string;
  fxApproximate: boolean;
}

export interface WrappedTopCategoryCard {
  type: 'top_category';
  categoryId: string | null;
  name: string;                   // server name; client re-localizes 'Uncategorized'
  amount: number;                 // in baseCurrency
  percentage: number;             // share of total expenses
  color: string | null;
  baseCurrency: string;
}

export interface WrappedCategoryMixItem {
  categoryId: string | null;
  name: string;
  amount: number;
  percentage: number;
  color: string | null;
}

export interface WrappedCategoryMixCard {
  type: 'category_mix';
  categories: WrappedCategoryMixItem[]; // top N, descending
  baseCurrency: string;
}

export interface WrappedReceiptsScannedCard {
  type: 'receipts_scanned';
  count: number;                  // expenses with source 'ocr'/'notification' this year
}

export interface WrappedSavingsCard {
  type: 'savings';
  netSavings: number;             // income - expenses, in baseCurrency
  savingsRate: number | null;     // netSavings / income, null when no income
  savedVsLastYear: number | null; // netSavings(year) - netSavings(year-1), null when no prior data
  baseCurrency: string;
  fxApproximate: boolean;
}

export interface WrappedPersonalInflationCard {
  type: 'personal_inflation';
  indexPct: number | null;        // Laspeyres personal inflation for the year, null when < 3 products
}

export interface WrappedStreakCard {
  type: 'streak';
  longestStreak: number;          // longest daily-tracking streak (days)
  currentStreak: number;
}

export interface WrappedOutroCard {
  type: 'outro';
  year: number;
}

export type WrappedCard =
  | WrappedIntroCard
  | WrappedTotalTrackedCard
  | WrappedTopMerchantCard
  | WrappedBiggestMonthCard
  | WrappedTopCategoryCard
  | WrappedCategoryMixCard
  | WrappedReceiptsScannedCard
  | WrappedSavingsCard
  | WrappedPersonalInflationCard
  | WrappedStreakCard
  | WrappedOutroCard;

export interface WrappedResponse {
  year: number;
  baseCurrency: string;
  generatedAt: string;            // ISO datetime
  hasEnoughData: boolean;         // false → client shows a friendly "not enough yet" state
  fxApproximate: boolean;         // true if any card required FX conversion
  cards: WrappedCard[];           // ordered; only cards that have data are included
}
