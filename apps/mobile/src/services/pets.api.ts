import { httpClient } from './http-client';
import type { Pet, PetCostKind, PetHistory, PetHistoryPeriod, PetSpecies } from '@budget/shared-types';

/** What the pet form writes; dates are `YYYY-MM-DD` (never `toISOString()`), null clears one. */
export interface PetWrite {
  name?: string;
  species?: PetSpecies;
  birthday?: string | null;
  nextVaccinationDate?: string | null;
  nextParasiteTreatmentDate?: string | null;
}

/**
 * Pets and what they cost (`/pets`, ABA-828/831). Online only, like vehicles:
 * there is no SQLite mirror, so a call made offline rejects and the screen
 * shows a retry. Expense ids may be the device id — the server resolves PK or clientId.
 */
export const petsApi = {
  getPets(): Promise<Pet[]> {
    return httpClient.request<Pet[]>('/pets');
  },

  /** Create takes no null: an unset date is simply left out. */
  createPet(data: PetWrite & { name: string }): Promise<Pet> {
    const body = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined));
    return httpClient.request<Pet>('/pets', { method: 'POST', body: JSON.stringify(body) });
  },

  updatePet(id: string, data: PetWrite): Promise<Pet> {
    return httpClient.request<Pet>(`/pets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deletePet(id: string): Promise<{ success: boolean }> {
    return httpClient.request(`/pets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  /** One period by month and kind, in the display currency. */
  getPetHistory(id: string, months: PetHistoryPeriod): Promise<PetHistory> {
    return httpClient.request<PetHistory>(`/pets/${encodeURIComponent(id)}/history?months=${months}`);
  },

  /** Many expenses as one kind of cost of a pet, in one request (≤500 ids). */
  setPetCostsBulk(petId: string, expenseIds: string[], kind: PetCostKind): Promise<{ assigned: number; notFound: number }> {
    return httpClient.request(`/pets/${encodeURIComponent(petId)}/costs/bulk`, {
      method: 'POST',
      body: JSON.stringify({ expenseIds, kind }),
    });
  },

  removePetCost(expenseId: string): Promise<{ success: boolean }> {
    return httpClient.request(`/pets/costs/${encodeURIComponent(expenseId)}`, { method: 'DELETE' });
  },
};
