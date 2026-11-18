export type FuelType = 'petrol' | 'diesel' | 'lpg' | 'electric' | 'hybrid' | 'other';

export interface Vehicle {
  id: string;
  accountId: string;
  name: string;
  fuelType: FuelType;
  /** Renewal reminders (ABA-827), `YYYY-MM-DD`. */
  nextInsuranceDate?: string | null;
  nextInspectionDate?: string | null;
  nextServiceDate?: string | null;
  nextServiceOdometer?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface FuelLog {
  id: string;
  vehicleId: string;
  expenseId: string;
  liters: number;
  odometerKm: number;
  isFullTank: boolean;
}

export interface VehicleStats {
  consumptionLPer100Km: number | null;
  costPerKm: number | null;
  costPer100Km: number | null;
  totalKm: number;
  lastPricePerLiter: number | null;
  fillUps: number;
  series: { date: string; lPer100Km: number; costPer100Km: number }[];
  /** The caller's display currency; every cost figure is in it (ABA-796). */
  currencyCode?: string;
  /** A fill-up had no known exchange rate and was left out of the cost. */
  fxApproximate?: boolean;
  /** Last 12 months of every cost, fuel included (ABA-803). */
  ownership?: VehicleOwnership;
}

/** Car cost kinds (ABA-803). `fuel` without litres/odometer (ABA-804); a full fill-up is a FuelLog. */
export type VehicleCostKind = 'fuel' | 'service' | 'insurance' | 'parking' | 'tax' | 'other';

export interface VehicleOwnership {
  months: number;
  total: number;
  perMonth: number;
  /** `fuel` plus each VehicleCostKind, in the display currency. */
  byKind: Record<string, number>;
  kmLast12Months: number;
  costPerKm: number | null;
}

export interface VehicleCostLink {
  vehicleId: string;
  kind: VehicleCostKind;
  /** null = set by a person; 'category' = by the vehicle's category rule. */
  source: string | null;
}

export interface VehicleCategoryRule {
  categoryId: string;
  kind: VehicleCostKind;
  /** In responses: every spelling of the category (server PK and the device's clientId). */
  ids?: string[];
}

/** A fill-up as `GET /vehicles/:id/fuel-logs` returns it: the log plus its expense (ABA-796). */
export interface FuelLogWithExpense extends FuelLog {
  expense: {
    id: string;
    clientId: string | null;
    amount: number | string;
    currencyCode: string;
    date: string;
    merchant: string | null;
    description: string | null;
  };
}

export interface UpsertFuelLogRequest {
  liters: number;
  odometerKm: number;
  isFullTank?: boolean;
}

/** The vehicle screen's periods in months (ABA-811); 0 = all time. */
export type VehicleHistoryPeriod = 3 | 6 | 12 | 24 | 0;

/** A fill-up (`kind: 'fuel'` with litres) or another car cost, as `GET /vehicles/:id/history` lists it. */
export interface VehicleHistoryItem {
  expenseId: string;
  clientId: string | null;
  date: string;
  kind: VehicleCostKind;
  amount: number;
  currencyCode: string;
  /** In the display currency; null when the rate is unknown (left out of every total). */
  amountBase: number | null;
  merchant: string | null;
  description: string | null;
  liters?: number;
  odometerKm?: number;
  isFullTank?: boolean;
}

/** `GET /vehicles/:id/history?months=` (ABA-811), every amount in `currencyCode`. */
export interface VehicleHistory {
  months: number;
  from: string | null;
  currencyCode: string;
  fxApproximate: boolean;
  total: number;
  perMonth: number;
  byKind: Record<string, number>;
  km: number;
  costPerKm: number | null;
  consumptionLPer100Km: number | null;
  monthly: { month: string; total: number; byKind: Record<string, number> }[];
  consumption: { date: string; lPer100Km: number; costPer100Km: number }[];
  items: VehicleHistoryItem[];
}
