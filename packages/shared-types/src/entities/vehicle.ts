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
}
