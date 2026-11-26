/** Utility bill readings (docs/contracts/utility-bill-readings.md). */
export type UtilityKind = 'electricity' | 'gas' | 'water' | 'heating';
export type UtilityUnit = 'kwh' | 'm3' | 'gj';

export interface UtilityReading {
  id: string;
  accountId: string;
  expenseId: string;
  kind: UtilityKind;
  consumption: number;
  unit: UtilityUnit;
  propertyLabel: string | null;
  /** Expense amount / consumption, in the expense's own currency. */
  unitPrice: number;
  createdAt: string;
}

export interface UpsertUtilityReadingRequest {
  kind: UtilityKind;
  consumption: number;
  unit: UtilityUnit;
  propertyLabel?: string | null;
}

export interface UtilityMonthPoint {
  /** `YYYY-MM` */
  month: string;
  consumption: number;
  cost: number;
  unitPrice: number | null;
}

export interface UtilityYearOverYear {
  month: string;
  previousMonth: string;
  unitPriceChangePct: number | null;
  consumptionChangePct: number | null;
}

export interface UtilityPriceNudge {
  month: string;
  unitPrice: number;
  baseline: number;
  risePct: number;
}

export interface UtilityKindStats {
  kind: UtilityKind;
  unit: UtilityUnit;
  months: UtilityMonthPoint[];
  yearOverYear: UtilityYearOverYear | null;
  priceNudge: UtilityPriceNudge | null;
}

export interface UtilitySummary {
  currencyCode: string;
  fxApproximate: boolean;
  kinds: UtilityKindStats[];
  properties: string[];
}
