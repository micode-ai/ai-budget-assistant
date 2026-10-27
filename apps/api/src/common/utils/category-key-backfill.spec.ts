import { readFileSync } from 'fs';
import { join } from 'path';
import { buildBackfillValues } from '../../../scripts/generate-category-key-backfill';

const sql = readFileSync(
  join(__dirname, '../../../prisma/migrations/20261027000000_category_system_keys/migration.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('category system key backfill migration', () => {
  it('embeds exactly the VALUES list generated from the current catalog', () => {
    const start = sql.indexOf('-- BEGIN KEY MAP\n');
    const end = sql.indexOf('\n    -- END KEY MAP');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const embedded = sql.slice(start + '-- BEGIN KEY MAP\n'.length, end);
    expect(embedded).toBe(buildBackfillValues());
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
