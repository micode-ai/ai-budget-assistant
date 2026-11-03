import {
  ANALYTICS_BY_CATEGORY_TIER1_ENCRYPTED_FIELDS,
  CATEGORY_TIER1_ENCRYPTED_FIELDS,
  EXPENSE_TIER1_ENCRYPTED_FIELDS,
  BUDGET_TIER1_ENCRYPTED_FIELDS,
  INCOME_TIER1_ENCRYPTED_FIELDS,
  PUBLIC_TIER1_FIELDS,
} from './public-encryption-fields';

/**
 * Drift guard against the app's source of truth. Loading the shared constant inside a SPEC is fine:
 * the no-runtime-import rule protects the API's production code, which never loads this file.
 * Relative path to the constants module (not the `@budget/shared-utils` barrel).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { ENCRYPTION_FIELDS } = require('../../../../../packages/shared-utils/src/constants') as {
  ENCRYPTION_FIELDS: Record<string, { tier1: string[]; tier2: string[] }>;
};

const ENTITIES = ['expense', 'expense_item', 'income', 'budget', 'tag', 'project', 'category'] as const;

describe('PUBLIC_TIER1_FIELDS vs shared-utils ENCRYPTION_FIELDS', () => {
  it.each(ENTITIES)('%s: every shared tier-1 field is either nulled by the API or not exposed at all', (entity) => {
    const shared = ENCRYPTION_FIELDS[entity];
    expect(shared).toBeDefined();
    const local = PUBLIC_TIER1_FIELDS[entity];
    const covered = new Set<string>([...Object.keys(local.nulled), ...local.notExposed]);
    // A failure means the app started encrypting a field the public API may still serve in
    // plaintext at tier 1: add it to `nulled` (and null it in the mapper/controller), or to
    // `notExposed` if no public field carries it.
    expect(shared.tier1.filter((f) => !covered.has(f))).toEqual([]);
  });

  it.each(ENTITIES)('%s: the API copy names no field the app does not encrypt at tier 1 (stale copy)', (entity) => {
    const shared = new Set(ENCRYPTION_FIELDS[entity].tier1);
    const local = PUBLIC_TIER1_FIELDS[entity];
    expect([...Object.keys(local.nulled), ...local.notExposed].filter((f) => !shared.has(f))).toEqual([]);
  });

  it('derives the public encrypted_fields lists', () => {
    expect(EXPENSE_TIER1_ENCRYPTED_FIELDS).toEqual([
      'description',
      'notes',
      'merchant',
      'location.name',
      'items.description',
      'tags.name',
      'project.name',
    ]);
    expect(CATEGORY_TIER1_ENCRYPTED_FIELDS).toEqual(['name']);
    expect(INCOME_TIER1_ENCRYPTED_FIELDS).toEqual(['description', 'notes', 'category.name', 'tags.name', 'project.name']);
    expect(BUDGET_TIER1_ENCRYPTED_FIELDS).toEqual(['name', 'allocations.category_name']);
    expect(ANALYTICS_BY_CATEGORY_TIER1_ENCRYPTED_FIELDS).toEqual(['category_name']);
  });
});
