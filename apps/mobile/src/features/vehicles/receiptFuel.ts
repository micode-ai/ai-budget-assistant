import type { FuelType, Vehicle } from '@budget/shared-types';

/** The `fuel` block of a scan response (server-validated; see `extractReceiptFuel`). */
export interface ScannedFuel {
  litres: number;
  pricePerLitre: number;
  fuelType: 'petrol' | 'diesel' | 'lpg' | 'other';
}

/** Session memory of the vehicle a fill-up was last logged for, per account. */
const lastUsed = new Map<string, string>();

export function rememberFuelVehicle(accountId: string, vehicleId: string): void {
  lastUsed.set(accountId, vehicleId);
}

/**
 * Which vehicle a scanned fill-up goes to: the account's only vehicle, else the
 * one last used, else the one whose fuel type matches the receipt's — and when
 * that is still ambiguous, none (a wrong guess would corrupt that car's
 * consumption, an empty card is harmless).
 */
export function pickFuelVehicle(vehicles: Vehicle[], accountId: string | null, fuel: ScannedFuel): Vehicle | null {
  if (vehicles.length === 0) return null;
  if (vehicles.length === 1) return vehicles[0];
  const last = accountId ? lastUsed.get(accountId) : undefined;
  const remembered = last ? vehicles.find((v) => v.id === last) : undefined;
  if (remembered) return remembered;
  const sameType = vehicles.filter((v) => v.fuelType === (fuel.fuelType as FuelType));
  return sameType.length === 1 ? sameType[0] : null;
}
