import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Prisma cannot model the partial unique indexes on oauth_grants. They live as raw SQL in migrations,
 * and a later `prisma migrate dev` will propose dropping them.
 */
const MIGRATIONS = join(__dirname, '../../../prisma/migrations');
const PHASE1 = '20261101000000_public_api_oauth';
const MULTI = '20261102000000_public_api_multi_account';

const dirs = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const sqlOf = (dir: string) => readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8');
const droppers = (index: string) =>
  dirs.filter((d) => sqlOf(d).includes('DROP INDEX') && sqlOf(d).includes(index));

describe('oauth_grants_active_key (phase 1, per account)', () => {
  const INDEX = 'oauth_grants_active_key';
  const creators = dirs.filter((d) => sqlOf(d).includes(`CREATE UNIQUE INDEX ${INDEX}`));

  it('is created by exactly one migration, as a partial index', () => {
    expect(creators).toEqual([PHASE1]);
    expect(sqlOf(creators[0])).toContain('WHERE revoked_at IS NULL');
  });

  it('is dropped only by the multi-account migration', () => {
    expect(droppers(INDEX)).toEqual([MULTI]);
  });
});

describe('oauth_grants_active_client_user_key partial unique index', () => {
  const INDEX = 'oauth_grants_active_client_user_key';
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

describe('multi-account migration scope merge', () => {
  it('keeps the survivor own scopes and never unions the scopes of merged grants', () => {
    const sql = sqlOf(MULTI);
    expect(sql).not.toMatch(/unnest/i);
    expect(sql).not.toMatch(/SET "scopes"/);
  });
});

describe('multi-account migration ordering', () => {
  it('copies grant accounts before dropping oauth_grants.account_id', () => {
    const sql = sqlOf(MULTI);
    const insert = sql.indexOf('INSERT INTO "oauth_grant_accounts"');
    const drop = sql.indexOf('DROP COLUMN "account_id"');
    expect(insert).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(-1);
    expect(insert).toBeLessThan(drop);
  });
});

describe('mcp_oauth data model', () => {
  const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
  const block = (name: string) => schema.split(`model ${name} {`)[1].split('\n}')[0];

  it('OAuthClient.ownerUserId and homepageUrl are optional; source defaults to manual; OAuthToken has resource', () => {
    const client = block('OAuthClient');
    expect(client).toMatch(/ownerUserId\s+String\?/);
    expect(client).toMatch(/homepageUrl\s+String\?/);
    expect(client).toMatch(/source\s+OAuthClientSource\s+@default\(manual\)/);
    expect(block('OAuthToken')).toMatch(/resource\s+String\?\s+@map\("resource"\)/);
  });

  it('the mcp_oauth migration drops nothing and backfills source as manual', () => {
    const sql = sqlOf('20261114000000_mcp_oauth');
    expect(sql).not.toMatch(/DROP (TABLE|INDEX|COLUMN)/);
    expect(sql).toContain("DEFAULT 'manual'");
  });
});
