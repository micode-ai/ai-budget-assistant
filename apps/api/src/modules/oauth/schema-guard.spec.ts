import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Prisma cannot model the partial unique index "one active grant per
 * (client, user, account)". It lives as raw SQL in the public_api_oauth
 * migration, and a later `prisma migrate dev` will propose dropping it.
 */
const MIGRATIONS = join(__dirname, '../../../prisma/migrations');
const INDEX = 'oauth_grants_active_key';

const dirs = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const sqlOf = (dir: string) => readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8');

describe('oauth_grants_active_key partial unique index', () => {
  const creators = dirs.filter((d) => sqlOf(d).includes(`CREATE UNIQUE INDEX ${INDEX}`));

  it('is created by exactly one migration, as a partial index', () => {
    expect(creators).toHaveLength(1);
    expect(sqlOf(creators[0])).toContain('WHERE revoked_at IS NULL');
  });

  it('is never dropped by a later migration', () => {
    const later = dirs.slice(dirs.indexOf(creators[0]) + 1);
    for (const d of later) {
      const sql = sqlOf(d);
      expect(sql.includes('DROP INDEX') && sql.includes(INDEX)).toBe(false);
    }
  });
});
