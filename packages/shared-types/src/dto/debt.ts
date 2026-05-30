import type { DebtSummary } from '../entities';

export interface DebtSummaryResponse {
  lent: DebtSummary[];
  borrowed: DebtSummary[];
  totals: {
    totalLent: number;
    totalBorrowed: number;
    totalLentRemaining: number;
    totalBorrowedRemaining: number;
    currencyCode: string;
  };
}
