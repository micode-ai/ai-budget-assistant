export type FuelType = 'petrol' | 'diesel' | 'lpg' | 'electric' | 'hybrid' | 'other';

export interface Vehicle {
  id: string;
  accountId: string;
  name: string;
  fuelType: FuelType;
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
