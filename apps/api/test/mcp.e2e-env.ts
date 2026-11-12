/**
 * Environment for `mcp.e2e-spec.ts`. Imported FIRST by the spec, before `AppModule`.
 *
 * Unlike the public-api suite, a run without an explicit DATABASE_URL / REDIS_URL SKIPS this suite
 * with a message instead of failing, so `npm run test:e2e` on a machine without disposable
 * instances stays green. With both set, the public-api preamble applies unchanged — it still
 * refuses a database that does not look disposable, blanks every outbound integration and sets
 * PUBLIC_API_ENABLED — and MCP_ENABLED is switched on on top of it.
 */

export const MCP_E2E_SKIP_REASON: string | null =
  !process.env.DATABASE_URL || !process.env.REDIS_URL
    ? 'mcp e2e SKIPPED: set DATABASE_URL and REDIS_URL explicitly (disposable test instances) to run it'
    : null;

interface PublicApiE2eEnv {
  EMAIL_DOMAIN: string;
  RUN_ID: string;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const env: PublicApiE2eEnv | null = MCP_E2E_SKIP_REASON
  ? null
  : (require('./public-api.e2e-env') as PublicApiE2eEnv);

if (!MCP_E2E_SKIP_REASON) process.env.MCP_ENABLED = 'true';

export const EMAIL_DOMAIN = env
  ? env.EMAIL_DOMAIN.replace(/^pa-e2e-/, 'mcp-e2e-')
  : 'skipped.test.local';
export const RUN_ID = env?.RUN_ID ?? 'skipped';
