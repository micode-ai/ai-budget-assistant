import { readFileSync } from 'fs';
import { join } from 'path';
import { buildBackfillValues } from './category-key-backfill';
import { CATEGORY_CATALOG, type CatalogLocale } from './category-catalog';

const sql = readFileSync(
  join(__dirname, '../../../prisma/migrations/20261027000000_category_system_keys/migration.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

/**
 * The migration is applied and frozen; it was generated when the catalog had these nine locales.
 * A locale added later (pt, br) had no categories to backfill, and editing an applied migration
 * breaks its checksum, so rows that ONLY a later locale contributes are left out of the comparison.
 */
const MIGRATION_LOCALES: readonly CatalogLocale[] = ['en', 'de', 'es', 'fr', 'pl', 'ru', 'ua', 'be', 'nl'];
const LATER_LOCALES: readonly CatalogLocale[] = ['pt', 'br'];

function valuesAsShipped(): string {
  const norm = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase().replace(/'/g, "''");
  const shipped = new Set<string>();
  const later = new Set<string>();
  for (const e of CATEGORY_CATALOG) {
    for (const l of MIGRATION_LOCALES) shipped.add(`('${e.type}', '${norm(e.names[l])}',`);
    for (const l of LATER_LOCALES) later.add(`('${e.type}', '${norm(e.names[l])}',`);
  }
  return buildBackfillValues()
    .split(',\n')
    .filter((row) => {
      const head = row.trim().slice(0, row.trim().lastIndexOf(', ') + 1);
      return shipped.has(head) || !later.has(head);
    })
    .join(',\n');
}

describe('category system key backfill migration', () => {
  it('embeds exactly the VALUES list generated from the catalog it shipped with', () => {
    const start = sql.indexOf('-- BEGIN KEY MAP\n');
    const end = sql.indexOf('\n    -- END KEY MAP');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const embedded = sql.slice(start + '-- BEGIN KEY MAP\n'.length, end);
    expect(embedded).toBe(valuesAsShipped());
  });

  it('bumps updated_at and ranks income by incomes', () => {
    expect(sql).toMatch(/"updated_at" = now\(\)/);
    expect(sql).toContain('FROM "incomes" i');
  });

  it('creates the partial unique index and never touches name or name_customized values', () => {
    expect(sql).toContain('categories_account_system_key_type_live_key');
    expect(sql).toContain('WHERE "system_key" IS NOT NULL AND "is_deleted" = false');
    expect(sql).toMatch(/rn = 1/);
    expect(sql).not.toMatch(/SET[^;]*"name"\s*=/);
  });
});
