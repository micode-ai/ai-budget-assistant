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
