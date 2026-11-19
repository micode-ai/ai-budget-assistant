import { httpClient } from './http-client';
import type {
  Pet,
  PetCategoryRule,
  PetCostKind,
  PetCostLink,
  PetHistory,
  PetHistoryPeriod,
  PetRulesApplied,
  PetSpecies,
} from '@budget/shared-types';

/** What the pet form writes; dates are `YYYY-MM-DD` (never `toISOString()`), null clears one. */
export interface PetWrite {
  name?: string;
  species?: PetSpecies;
  birthday?: string | null;
  nextVaccinationDate?: string | null;
  nextParasiteTreatmentDate?: string | null;
  /** Replaces the pet's category rules and applies them at once (ABA-833). */
  categoryRules?: { categoryId: string; kind: PetCostKind }[];
}

/** A create/update that carried `categoryRules` says what it applied. */
export type PetWriteResult = Pet & { rulesApplied?: PetRulesApplied };

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
  createPet(data: PetWrite & { name: string }): Promise<PetWriteResult> {
    const body = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined));
    return httpClient.request<PetWriteResult>('/pets', { method: 'POST', body: JSON.stringify(body) });
  },

  updatePet(id: string, data: PetWrite): Promise<PetWriteResult> {
    return httpClient.request<PetWriteResult>(`/pets/${encodeURIComponent(id)}`, {
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

  /** The pet's rules with every spelling of each category (ABA-833). */
  getPetCategoryRules(petId: string): Promise<{ rules: PetCategoryRule[] }> {
    return httpClient.request(`/pets/${encodeURIComponent(petId)}/category-rules`);
  },

  /** The pet cost on one expense, or `{ cost: null }` (ABA-833). */
  getExpensePetCost(expenseId: string): Promise<{ cost: PetCostLink | null }> {
    return httpClient.request(`/pets/costs/${encodeURIComponent(expenseId)}`);
  },

  /** One expense as a cost of a pet, set by a person (the server writes `source: null`). */
  setPetCost(petId: string, expenseId: string, kind: PetCostKind): Promise<unknown> {
    return httpClient.request(`/pets/${encodeURIComponent(petId)}/costs/${encodeURIComponent(expenseId)}`, {
      method: 'PUT',
      body: JSON.stringify({ kind }),
    });
  },

  /** Takes the pet off an expense; the server leaves a tombstone when a category rule would re-add it. */
  removePetCost(expenseId: string): Promise<{ success: boolean }> {
    return httpClient.request(`/pets/costs/${encodeURIComponent(expenseId)}`, { method: 'DELETE' });
  },
};
