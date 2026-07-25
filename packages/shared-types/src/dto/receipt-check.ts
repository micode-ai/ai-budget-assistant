/**
 * One receipt line that costs measurably more than the user's usual price for
 * that product in that store. Presented as "more expensive than usual — check
 * the receipt"; it is NOT a claim that anyone was overcharged.
 */
export interface ReceiptCheckFinding {
  canonicalName: string;
  merchant: string;
  currencyCode: string;
  paidUnitPrice: number;
  /** Median of the user's prior prices for this product in this store. */
  baselineUnitPrice: number;
  quantity: number;
  /** Percent above the baseline, 1 decimal. */
  changePct: number;
  /** (paid − baseline) × quantity, 2 decimals, in currencyCode. */
  overpaidAmount: number;
  source: 'personal' | 'community';
  /** 'high' when backed by 3+ prior purchases, 'low' when backed by exactly 2. */
  confidence: 'high' | 'low';
}

/**
 * How much the price check has FOUND above the user's usual prices — deliberately
 * "found", not "saved": nothing here proves the user acted on a finding.
 * Totals are per currency; this feature never converts between currencies.
 */
export interface PriceCheckSummary {
  totalsByCurrency: Record<string, number>;
  alertCount: number;
  /** ISO date the window starts at. */
  since: string;
}
