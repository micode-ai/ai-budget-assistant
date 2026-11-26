/** Credit-card statement cycle of one account (GET /card-cycles). Dates are `YYYY-MM-DD`. */
export interface CardCycleSummary {
  accountId: string;
  currencyCode: string;
  statementDay: number;
  dueDay: number;
  creditLimit: number | null;
  /** Current cycle; `cycleEnd` is the statement day. */
  cycleStart: string;
  cycleEnd: string;
  /** Spent in the current cycle (by transaction date), card currency only. */
  spent: number;
  /** spent / creditLimit, null without a limit. Can exceed 1. */
  utilisation: number | null;
  dueDate: string;
  daysToDue: number;
  /** The closed statement's amount; null when its due date has passed. */
  statementAmount: number | null;
}

/** PUT /card-cycles body. */
export interface UpsertCardCycleDto {
  statementDay: number;
  dueDay: number;
  creditLimit?: number;
  currencyCode: string;
}

/** One monthly merchant cap with this calendar month's progress (GET /merchant-caps). */
export interface MerchantSpendingCap {
  id: string;
  merchantNormalized: string;
  merchantLabel: string;
  amount: number;
  currencyCode: string;
  /** Spent at this merchant in the current calendar month, cap currency only. */
  spent: number;
  /** spent / amount * 100; can exceed 100. */
  percentUsed: number;
}

/** PUT /merchant-caps body. */
export interface UpsertMerchantCapDto {
  merchant: string;
  amount: number;
  currencyCode: string;
}
