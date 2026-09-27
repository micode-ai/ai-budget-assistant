/** COICOP 2018 divisions as published by Eurostat (`coicop18`); TOTAL = all items. */
export type CoicopDivision =
  | 'TOTAL' | 'CP01' | 'CP02' | 'CP03' | 'CP04' | 'CP05' | 'CP06' | 'CP07'
  | 'CP08' | 'CP09' | 'CP10' | 'CP11' | 'CP12' | 'CP13';

export type RealSalaryStatus =
  | 'ready'
  | 'no_salary_confirmed'
  | 'salary_history_short'
  | 'spend_under_3_months'
  | 'no_inflation_source'
  | 'encrypted';

export interface RealSalaryBreakdownRow {
  division: CoicopDivision;
  /** Share of spend, 0..1. */
  weight: number;
  /** Annual rate of change, percent. */
  ratePct: number;
  source: 'official' | 'receipts';
}

export interface RealSalaryResponse {
  status: RealSalaryStatus;
  baseCurrency: string;
  /** ISO 3166-1 alpha-2 in Eurostat's spelling (Greece = EL); null outside coverage. */
  country: string | null;
  /** True when `country` came from the timezone, not from the user's choice. */
  countryGuessed: boolean;
  /** 'YYYY-MM' of the official data used; null when receipts-only. */
  dataMonth: string | null;
  nominalChangePct: number | null;
  personalInflationPct: number | null;
  realChangePct: number | null;
  requiredRaisePct: number | null;
  breakdown: RealSalaryBreakdownRow[];
  /** Up to 3 divisions contributing most to inflation (weight × rate), highest first. */
  topDrivers: CoicopDivision[];
  fxApproximate: boolean;
  computedAt: string;
}

export interface SalaryCandidate {
  /** Opaque, stable: `${categoryId ?? ''}|${descriptionKey}|${currencyCode}`. */
  key: string;
  categoryId: string | null;
  categoryName: string | null;
  descriptionKey: string;
  currencyCode: string;
  /** Mean of the detected occurrences, in `currencyCode`. */
  typicalAmount: number;
  occurrences: number;
}

export interface SalaryProfileDto {
  salaryKey: string | null;
  /**
   * The monthly salary a year ago, typed by the user, in the salary's OWN
   * currency (the `currencyCode` of the confirmed candidate) — not the base
   * currency. Used only when the prior 12 months of salary history are thin.
   */
  manualPreviousMonthly: number | null;
}

export interface RealSalaryProfileResponse {
  profile: SalaryProfileDto;
  candidates: SalaryCandidate[];
}

export interface RealSalaryCategoryRow {
  id: string;
  name: string;
  icon: string | null;
  coicopDivision: CoicopDivision | null;
}
