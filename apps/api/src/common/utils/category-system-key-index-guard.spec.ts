import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const dir = join(__dirname, '../../../prisma/migrations');
const OWNER = '20261027000000_category_system_keys';
const DROP_INDEX = /DROP\s+INDEX\s+(IF\s+EXISTS\s+)?[^;]*categories_account_system_key_type_live_key/i;

describe('partial unique index guard', () => {
  it('the pattern matches the statements Prisma would generate', () => {
    expect(DROP_INDEX.test('DROP INDEX "categories_account_system_key_type_live_key";')).toBe(true);
    expect(DROP_INDEX.test('DROP INDEX IF EXISTS "categories_account_system_key_type_live_key";')).toBe(true);
    expect(DROP_INDEX.test('DROP INDEX "categories_other_key";')).toBe(false);
  });

  it('no other migration drops the categories system_key live index', () => {
    // schema.prisma cannot express the partial index, so a generated migration
    // would propose dropping it. Fail loudly if one does.
    const offenders = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== OWNER)
      .filter((d) => DROP_INDEX.test(readFileSync(join(dir, d.name, 'migration.sql'), 'utf8')))
      .map((d) => d.name);
    expect(offenders).toEqual([]);
  });
});
