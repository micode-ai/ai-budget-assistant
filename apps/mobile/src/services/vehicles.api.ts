import { httpClient } from './http-client';
import type {
  FuelLog,
  FuelLogWithExpense,
  FuelType,
  UpsertFuelLogRequest,
  Vehicle,
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

  updateVehicle(id: string, data: { name?: string; fuelType?: FuelType }): Promise<Vehicle> {
    return httpClient.request<Vehicle>(`/vehicles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteVehicle(id: string): Promise<{ success: boolean }> {
    return httpClient.request(`/vehicles/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  getVehicleStats(id: string): Promise<VehicleStats> {
    return httpClient.request<VehicleStats>(`/vehicles/${encodeURIComponent(id)}/stats`);
  },

  getVehicleFuelLogs(id: string): Promise<FuelLogWithExpense[]> {
    return httpClient.request<FuelLogWithExpense[]>(`/vehicles/${encodeURIComponent(id)}/fuel-logs`);
  },

  getExpenseFuelLog(expenseId: string): Promise<{ fuelLog: FuelLog | null }> {
    return httpClient.request<{ fuelLog: FuelLog | null }>(`/vehicles/fuel-logs/${encodeURIComponent(expenseId)}`);
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
