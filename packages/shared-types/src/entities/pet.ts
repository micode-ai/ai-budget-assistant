export type PetSpecies = 'dog' | 'cat' | 'other';
export type PetCostKind = 'food' | 'vet' | 'grooming' | 'supplies' | 'insurance' | 'other';
/** The pet screen's period chips, in months; 0 = everything ever recorded. */
export type PetHistoryPeriod = 3 | 6 | 12 | 24 | 0;

export interface Pet {
  id: string;
  accountId: string;
  name: string;
  species: PetSpecies;
  /** `YYYY-MM-DD`. */
  birthday?: string | null;
  nextVaccinationDate?: string | null;
  nextParasiteTreatmentDate?: string | null;
  /** Server PKs of the claimed expense categories; read `GET /pets/:id/category-rules` for every spelling (ABA-833). */
  categoryRules?: PetCategoryRule[];
  createdAt: string;
  updatedAt: string;
}

export interface PetHistory {
  months: number;
  from: string | null;
  total: number;
  perMonth: number;
  /** Current calendar year, in the display currency. */
  yearTotal: number;
  byKind: Record<string, number>;
  monthly: { month: string; total: number; byKind: Record<string, number> }[];
  items: PetHistoryItem[];
  currencyCode: string;
  fxApproximate: boolean;
}

/** One cost of a pet in a period, newest first. `amountBase` null = no exchange rate. */
export interface PetHistoryItem {
  expenseId: string;
  clientId: string | null;
  date: string;
  kind: PetCostKind;
  amount: number;
  currencyCode: string;
  amountBase: number | null;
  merchant: string | null;
  description: string | null;
}

/** An expense category whose expenses are this pet's cost of `kind` (ABA-833). */
export interface PetCategoryRule {
  categoryId: string;
  kind: PetCostKind;
  /** In responses: every spelling of the category (server PK and the device's clientId). */
  ids?: string[];
}

/** The pet cost on one expense (`GET /pets/costs/:expenseId`, ABA-833). */
export interface PetCostLink {
  petId: string;
  kind: PetCostKind;
  /** null = set by a person; 'category' = by the pet's category rule. */
  source: string | null;
}

/** What a create/update that carried `categoryRules` applied at once. */
export interface PetRulesApplied {
  attributed: number;
  released: number;
}
