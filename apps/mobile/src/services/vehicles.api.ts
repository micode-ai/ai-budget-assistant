import { httpClient } from './http-client';
import type {
  FuelLog,
  FuelLogWithExpense,
  FuelType,
  UpsertFuelLogRequest,
  Vehicle,
  VehicleCategoryRule,
  VehicleCostKind,
  VehicleCostLink,
  VehicleHistory,
  VehicleHistoryPeriod,
  VehicleStats,
} from '@budget/shared-types';

/**
 * Vehicles and their fuel log (`/vehicles`). Online only: there is no SQLite
 * mirror, so a call made offline rejects and the screen shows a retry.
 * Expense ids may be the device id — the server resolves PK or clientId.
 */
export const vehiclesApi = {
  getVehicles(): Promise<Vehicle[]> {
    return httpClient.request<Vehicle[]>('/vehicles');
  },

  createVehicle(data: { name: string; fuelType?: FuelType }): Promise<Vehicle> {
    return httpClient.request<Vehicle>('/vehicles', { method: 'POST', body: JSON.stringify(data) });
  },

  /** Renewal dates are `YYYY-MM-DD`; `null` clears one, an omitted field keeps it (ABA-829). */
  updateVehicle(
    id: string,
    data: {
      name?: string;
      fuelType?: FuelType;
      nextInsuranceDate?: string | null;
      nextInspectionDate?: string | null;
      nextServiceDate?: string | null;
      nextServiceOdometer?: number | null;
    },
  ): Promise<Vehicle> {
    return httpClient.request<Vehicle>(`/vehicles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** To another account the caller can edit; only a vehicle with no fill-ups (ABA-801). */
  moveVehicle(id: string, targetAccountId: string): Promise<Vehicle> {
    return httpClient.request<Vehicle>(`/vehicles/${encodeURIComponent(id)}/move`, {
      method: 'POST',
      body: JSON.stringify({ targetAccountId }),
    });
  },

  deleteVehicle(id: string): Promise<{ success: boolean }> {
    return httpClient.request(`/vehicles/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  getVehicleStats(id: string): Promise<VehicleStats> {
    return httpClient.request<VehicleStats>(`/vehicles/${encodeURIComponent(id)}/stats`);
  },

  /** The vehicle screen (ABA-811): one period by month and kind, in the display currency. */
  getVehicleHistory(id: string, months: VehicleHistoryPeriod): Promise<VehicleHistory> {
    return httpClient.request<VehicleHistory>(`/vehicles/${encodeURIComponent(id)}/history?months=${months}`);
  },

  getVehicleFuelLogs(id: string): Promise<FuelLogWithExpense[]> {
    return httpClient.request<FuelLogWithExpense[]>(`/vehicles/${encodeURIComponent(id)}/fuel-logs`);
  },

  /** The fill-up or the other car cost on one expense (ABA-803), either may be null. */
  getExpenseFuelLog(expenseId: string): Promise<{ fuelLog: FuelLog | null; cost?: VehicleCostLink | null }> {
    return httpClient.request(`/vehicles/fuel-logs/${encodeURIComponent(expenseId)}`);
  },

  setVehicleCost(vehicleId: string, expenseId: string, kind: VehicleCostKind): Promise<unknown> {
    return httpClient.request(`/vehicles/${encodeURIComponent(vehicleId)}/costs/${encodeURIComponent(expenseId)}`, {
      method: 'PUT',
      body: JSON.stringify({ kind }),
    });
  },

  /** Many expenses as one kind of cost, in one request (ABA-805). */
  setVehicleCostsBulk(
    vehicleId: string,
    expenseIds: string[],
    kind: VehicleCostKind,
  ): Promise<{ assigned: number; skipped: number; notFound: number }> {
    return httpClient.request(`/vehicles/${encodeURIComponent(vehicleId)}/costs/bulk`, {
      method: 'POST',
      body: JSON.stringify({ expenseIds, kind }),
    });
  },

  removeVehicleCost(expenseId: string): Promise<{ success: boolean }> {
    return httpClient.request(`/vehicles/costs/${encodeURIComponent(expenseId)}`, { method: 'DELETE' });
  },

  getVehicleCategoryRules(vehicleId: string): Promise<{ rules: VehicleCategoryRule[] }> {
    return httpClient.request(`/vehicles/${encodeURIComponent(vehicleId)}/category-rules`);
  },

  setVehicleCategoryRules(
    vehicleId: string,
    rules: VehicleCategoryRule[],
  ): Promise<{ rules: VehicleCategoryRule[]; attributed: number; released: number }> {
    return httpClient.request(`/vehicles/${encodeURIComponent(vehicleId)}/category-rules`, {
      method: 'PUT',
      body: JSON.stringify({ rules }),
    });
  },

  upsertFuelLog(vehicleId: string, expenseId: string, data: UpsertFuelLogRequest): Promise<FuelLog> {
    return httpClient.request<FuelLog>(
      `/vehicles/${encodeURIComponent(vehicleId)}/fuel-logs/${encodeURIComponent(expenseId)}`,
      { method: 'PUT', body: JSON.stringify(data) },
    );
  },

  removeFuelLog(expenseId: string): Promise<{ success: boolean }> {
    return httpClient.request(`/vehicles/fuel-logs/${encodeURIComponent(expenseId)}`, { method: 'DELETE' });
  },
};
