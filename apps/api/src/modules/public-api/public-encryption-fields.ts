/**
 * Tier-1 (text) end-to-end encryption, as the public API applies it (Ruling 15).
 *
 * API-local COPY of the `tier1` lists of `ENCRYPTION_FIELDS` in
 * `packages/shared-utils/src/constants/index.ts` for every entity the public API exposes — the API
 * must never runtime-import `@budget/shared-utils` (no build step; ABA-252/253). Each internal field
 * is either `nulled` (exposed publicly → returned `null` at tier 1 under that public name) or
 * `notExposed` (no public field carries it). `public-encryption-fields.spec.ts` reads the shared
 * constant and fails when a shared tier-1 field lands in neither bucket, so a field the app starts
 * encrypting cannot leak through the API unnoticed.
 *
 * At tier 1 the whole field class is withheld, row by row or not: rows written by bots, imports
 * or OCR are plaintext on the server (it cannot encrypt), and the account promised its owner these
 * fields are end-to-end encrypted.
 */
export const PUBLIC_TIER1_FIELDS = {
  expense: {
    nulled: { description: 'description', notes: 'notes', merchant: 'merchant', locationName: 'location.name' },
    // receiptImageBase64: the bytes are not in PublicExpense (Task 9's receipt endpoint owns them).
    notExposed: ['receiptUrl', 'receiptImageBase64', 'debtContactName'],
  },
  income: {
    nulled: { description: 'description', notes: 'notes' },
    notExposed: ['debtContactName'],
  },
  budget: {
    nulled: { name: 'name' },
    notExposed: [],
  },
  expense_item: {
    nulled: { description: 'items.description' },
    notExposed: [],
  },
  tag: {
    nulled: { name: 'tags.name' },
    notExposed: [],
  },
  project: {
    nulled: { name: 'project.name' },
    notExposed: ['description'],
  },
  category: {
    nulled: { name: 'name' },
    notExposed: [],
  },
} as const satisfies Record<string, { nulled: Record<string, string>; notExposed: readonly string[] }>;

/**
 * `encrypted_fields` of every `PublicExpense` at tier 1 — the same list on list, detail and feed
 * rows (it describes the account, not the row; `items.description` is listed even where `items`
 * is absent).
 */
export const EXPENSE_TIER1_ENCRYPTED_FIELDS: readonly string[] = [
  ...Object.values(PUBLIC_TIER1_FIELDS.expense.nulled),
  ...Object.values(PUBLIC_TIER1_FIELDS.expense_item.nulled),
  ...Object.values(PUBLIC_TIER1_FIELDS.tag.nulled),
  ...Object.values(PUBLIC_TIER1_FIELDS.project.nulled),
];

/** `encrypted_fields` of every `PublicCategory` at tier 1. */
export const CATEGORY_TIER1_ENCRYPTED_FIELDS: readonly string[] = Object.values(PUBLIC_TIER1_FIELDS.category.nulled);

/**
 * `encrypted_fields` of every `PublicIncome` at tier 1. The embedded category name is withheld too
 * (`category.name`), unlike the expense, which exposes only a bare `category_id`.
 */
export const INCOME_TIER1_ENCRYPTED_FIELDS: readonly string[] = [
  ...Object.values(PUBLIC_TIER1_FIELDS.income.nulled),
  'category.name',
  ...Object.values(PUBLIC_TIER1_FIELDS.tag.nulled),
  ...Object.values(PUBLIC_TIER1_FIELDS.project.nulled),
];

/**
 * `encrypted_fields` of every `PublicBudget` at tier 1. The allocations' embedded category names
 * are withheld too (`allocations.category_name`), because the category name is itself tier-1.
 */
export const BUDGET_TIER1_ENCRYPTED_FIELDS: readonly string[] = [
  ...Object.values(PUBLIC_TIER1_FIELDS.budget.nulled),
  'allocations.category_name',
];

/**
 * `encrypted_fields` of `PublicAnalyticsByCategory` at tier 1: the category's encrypted `name`,
 * under its public name there (`category_name`). Amounts are plaintext on the server and served.
 */
export const ANALYTICS_BY_CATEGORY_TIER1_ENCRYPTED_FIELDS: readonly string[] = Object.values(
  PUBLIC_TIER1_FIELDS.category.nulled,
).map((field) => `category_${field}`);
