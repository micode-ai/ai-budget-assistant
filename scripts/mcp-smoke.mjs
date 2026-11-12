#!/usr/bin/env node
/**
 * Production smoke test of the MCP connector and the public API OAuth flow.
 * Node 20+, no dependencies. Runbook: docs/ops/mcp.md.
 *
 *   BASE=https://api.ai-budget.pl APP_TOKEN=... ACCOUNT_ID=... node scripts/mcp-smoke.mjs           # MCP mode
 *   BASE=https://api.ai-budget.pl APP_TOKEN=... ACCOUNT_ID=... node scripts/mcp-smoke.mjs --public  # public API mode
 *
 * Environment (credentials are read ONLY from here, never from arguments):
 *   BASE        API origin, default https://api.ai-budget.pl
 *   APP_TOKEN   the TEST user's app JWT (Bearer for /api/v1). Used only for the consent backend's
 *               approve route and, in --public mode, to create and delete a throwaway developer app.
 *   ACCOUNT_ID  an account of that user where they are owner/editor, not E2E-encrypted (tier < 2).
 *
 * MCP mode: the three discovery documents -> dynamic client registration (public client, loopback
 * redirect) -> approve with PKCE + resource + the account -> code from the returned redirect ->
 * token -> the MCP token must be refused by /public/v1/account (401, resource binding) -> /mcp
 * without a token is 401 with the resource-metadata challenge -> initialize + tools/call
 * list_accounts -> refresh -> the refreshed token works on /mcp -> revoke -> /mcp is 401.
 *
 * --public mode: the same flow with NO resource against /public/v1/account — the public API's
 * end-to-end check. A registered assistant (DCR, source mcp_dcr) is refused without the MCP resource
 * (ruling R4), so this mode creates a throwaway public developer app with APP_TOKEN instead, and
 * deletes it at the end. Its token must be refused by /mcp (401, or 404 while MCP_ENABLED is off).
 *
 * Every step prints PASS/FAIL, the HTTP status and at most an RFC error code. Tokens, codes,
 * verifiers and secrets are never printed (and every output line is scrubbed of them anyway).
 * Cleanup: the grant is always revoked (also after a failure); its tokens are then purged by the
 * OAuthTokenCleanupCron. If the token exchange failed after approve (MCP mode) there is no token to
 * revoke with, so the grant is removed through Connected apps (DELETE /api/v1/connected-apps/:id)
 * with APP_TOKEN. Ctrl-C / SIGTERM run the same cleanup and exit 130. The DCR client cannot be
 * deleted by anyone but an admin and is left in place, inert (no live token); OAuthTokenCleanupCron
 * soft-deletes it 30 days after its last grant was revoked (R8), or 30 days after it registered if it
 * never got one. The script prints its client_id (public, not a secret); block it in admin, API apps,
 * to remove it sooner.
 * Side effect: each approve sends the test user the "app connected" e-mail.
 *
 * Exit code: 0 all PASS, 1 any FAIL (named), 2 usage error.
 */
import { createHash, randomBytes } from 'node:crypto';

const USAGE = `Usage: node scripts/mcp-smoke.mjs [--public] [--help]

Env: BASE (default https://api.ai-budget.pl), APP_TOKEN (test user's app JWT), ACCOUNT_ID.
  (default)  MCP flow: discovery, DCR, consent approve with resource, token, /mcp, refresh, revoke.
  --public   Public API flow without resource against /public/v1/account (throwaway developer app).
Never prints tokens. Exit 0 = all PASS, 1 = a step failed, 2 = usage error.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const unknown = args.filter((a) => a !== '--public');
if (unknown.length > 0) {
  console.error(`Unknown argument(s): ${unknown.join(' ')}\n\n${USAGE}`);
  process.exit(2);
}
const PUBLIC_MODE = args.includes('--public');

const BASE = (process.env.BASE || 'https://api.ai-budget.pl').replace(/\/+$/, '');
const APP_TOKEN = process.env.APP_TOKEN || '';
const ACCOUNT_ID = process.env.ACCOUNT_ID || '';
if (!APP_TOKEN || !ACCOUNT_ID) {
  console.error(`APP_TOKEN and ACCOUNT_ID must be set in the environment.\n\n${USAGE}`);
  process.exit(2);
}
let baseUrl;
try {
  baseUrl = new URL(BASE);
  if (baseUrl.protocol !== 'https:' && baseUrl.protocol !== 'http:') throw new Error('scheme');
} catch {
  console.error('BASE must be an absolute http(s) URL.');
  process.exit(2);
}
// The run sends a real user's JWT: refuse to do it over plain HTTP or unverified TLS to anything
// but this machine.
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname);
if (!LOOPBACK && baseUrl.protocol !== 'https:') {
  console.error('BASE must be https:// unless it is a loopback host.');
  process.exit(2);
}
if (!LOOPBACK && process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  console.error(
    'NODE_TLS_REJECT_UNAUTHORIZED=0 disables certificate checks; unset it for this run (NODE_TLS_REJECT_UNAUTHORIZED= node ...).'
  );
  process.exit(2);
}

// Loopback redirect: the code never leaves this process (nothing listens there; we read it from
// the approve response, as the consent SPA would before navigating).
const REDIRECT_URI = 'http://127.0.0.1:53682/callback';
const MCP_PROTOCOL_VERSION = '2025-06-18';
const TIMEOUT_MS = 20_000;
const UA = 'mcp-smoke/1';

// ── redaction ───────────────────────────────────────────────────────────────

/** Every secret value this run has seen; scrubbed from every printed line. */
const secrets = new Set([APP_TOKEN]);
const remember = (v) => {
  if (typeof v === 'string' && v.length >= 8) secrets.add(v);
  return v;
};
function scrub(text) {
  let out = String(text);
  for (const s of secrets) out = out.split(s).join('[redacted]');
  // Belt and braces: anything shaped like one of our tokens or a JWT.
  return out
    .replace(/aba_(at|rt|ac|cs)_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[redacted]');
}
const log = (line) => console.log(scrub(line));

/** Only a short RFC-style error code is ever echoed from a response body. */
function errorCode(body) {
  const raw = body && typeof body === 'object' ? (body.error?.code ?? body.error) : undefined;
  return typeof raw === 'string' && /^[a-z_]{1,40}$/.test(raw) ? raw : undefined;
}

// ── steps ───────────────────────────────────────────────────────────────────

class StepFailure extends Error {}
const results = [];
let failed = false;

async function step(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true });
    log(`PASS  ${name}${note ? `  (${note})` : ''}`);
    return true;
  } catch (e) {
    failed = true;
    results.push({ name, ok: false });
    const why =
      e instanceof StepFailure
        ? e.message
        : `${e?.name ?? 'Error'}${e?.cause?.code ? ` ${e.cause.code}` : ''}`;
    log(`FAIL  ${name}  (${why})`);
    return false;
  }
}

function expect(cond, message) {
  if (!cond) throw new StepFailure(message);
}

/** A request; returns { status, headers, body } with the body parsed as JSON when it is JSON. */
async function call(method, path, { bearer, json, form, headers = {} } = {}) {
  const h = { 'User-Agent': UA, Accept: 'application/json', ...headers };
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  let body;
  if (json !== undefined) {
    h['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    h['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: res.status, headers: res.headers, body: parsed };
}

function status(res, expected) {
  const list = Array.isArray(expected) ? expected : [expected];
  const code = errorCode(res.body);
  expect(
    list.includes(res.status),
    `HTTP ${res.status}, expected ${list.join('/')}${code ? `, error=${code}` : ''}`
  );
  return `HTTP ${res.status}`;
}

function mcpRpc(bearer, id, method, params) {
  return call('POST', '/mcp', {
    bearer,
    json: { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) },
    headers: {
      Accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    },
  });
}

function pkce() {
  const verifier = remember(randomBytes(32).toString('base64url'));
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// ── the flow ────────────────────────────────────────────────────────────────

/** Live credentials, kept for cleanup. Never printed. */
const state = {
  clientId: null,
  devAppId: null,
  resource: null,
  access: null,
  refresh: null,
  grantRevoked: false,
  /** Approve succeeded, so a grant exists for this run's client (with or without a token). */
  approved: false,
};

/** When this run started (our grant's server-side `connectedAt` is after it, give or take skew). */
const RUN_STARTED_AT = Date.now();
const DCR_CLIENT_NAME = 'MCP smoke test';

async function discover() {
  let ok = await step('metadata: /.well-known/oauth-authorization-server', async () => {
    const res = await call('GET', '/.well-known/oauth-authorization-server');
    const note = status(res, 200);
    const m = res.body ?? {};
    for (const k of [
      'issuer',
      'authorization_endpoint',
      'token_endpoint',
      'registration_endpoint',
      'revocation_endpoint',
    ]) {
      expect(typeof m[k] === 'string' && m[k].length > 0, `missing ${k}`);
    }
    expect(
      Array.isArray(m.code_challenge_methods_supported) &&
        m.code_challenge_methods_supported.includes('S256'),
      'S256 not advertised'
    );
    expect(
      Array.isArray(m.token_endpoint_auth_methods_supported) &&
        m.token_endpoint_auth_methods_supported.includes('none'),
      'auth method none not advertised'
    );
    return `${note}, issuer ${m.issuer}`;
  });
  ok =
    (await step('metadata: /.well-known/oauth-protected-resource/mcp', async () => {
      const res = await call('GET', '/.well-known/oauth-protected-resource/mcp');
      const note = status(res, 200);
      const m = res.body ?? {};
      expect(typeof m.resource === 'string' && /^https?:\/\//.test(m.resource), 'missing resource');
      expect(
        Array.isArray(m.authorization_servers) && m.authorization_servers.length > 0,
        'missing authorization_servers'
      );
      state.resource = m.resource;
      return `${note}, resource ${m.resource}`;
    })) && ok;
  ok =
    (await step('metadata: /.well-known/oauth-protected-resource', async () => {
      const res = await call('GET', '/.well-known/oauth-protected-resource');
      const note = status(res, 200);
      expect(res.body?.resource === state.resource, 'resource differs from the /mcp document');
      return note;
    })) && ok;
  return ok && state.resource !== null;
}

async function registerDcrClient() {
  return step('DCR: POST /oauth/register', async () => {
    const res = await call('POST', '/oauth/register', {
      json: {
        client_name: DCR_CLIENT_NAME,
        redirect_uris: [REDIRECT_URI],
        grant_types: ['authorization_code', 'refresh_token'],
      },
    });
    const note = status(res, 201);
    expect(typeof res.body?.client_id === 'string', 'no client_id');
    expect(res.body.token_endpoint_auth_method === 'none', 'not a public client');
    expect(res.body.client_secret === undefined, 'a client_secret was issued');
    state.clientId = res.body.client_id; // public by design (not a secret)
    return `${note}, client ${state.clientId}`;
  });
}

async function createDeveloperApp() {
  return step('developer app: POST /api/v1/developer/apps (public client)', async () => {
    const res = await call('POST', '/api/v1/developer/apps', {
      bearer: APP_TOKEN,
      json: {
        name: `Smoke test ${new Date().toISOString().slice(0, 16)}`,
        homepageUrl: 'https://example.com',
        redirectUris: [REDIRECT_URI],
        isConfidential: false,
      },
    });
    const note = status(res, 201);
    expect(
      typeof res.body?.app?.clientId === 'string' && typeof res.body?.app?.id === 'string',
      'no app in response'
    );
    state.devAppId = res.body.app.id;
    state.clientId = res.body.app.clientId;
    return note;
  });
}

async function approveAndExchange() {
  const { verifier, challenge } = pkce();
  const stateParam = randomBytes(8).toString('hex');
  let code = null;

  const approved = await step(
    `approve: POST /api/v1/oauth/authorize/approve${PUBLIC_MODE ? ' (no resource)' : ' (resource)'}`,
    async () => {
      const res = await call('POST', '/api/v1/oauth/authorize/approve', {
        bearer: APP_TOKEN,
        json: {
          client_id: state.clientId,
          redirect_uri: REDIRECT_URI,
          // MCP: no scope, so the five default read scopes apply. Public: one harmless read scope.
          ...(PUBLIC_MODE
            ? { scope: 'expenses:read categories:read' }
            : { resource: state.resource }),
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state: stateParam,
          account_id: ACCOUNT_ID,
          decision: 'allow',
        },
      });
      const note = status(res, 200);
      expect(typeof res.body?.redirectTo === 'string', 'no redirectTo');
      const url = new URL(res.body.redirectTo);
      expect(
        `${url.origin}${url.pathname}` === REDIRECT_URI,
        'redirect target differs from the registered URI'
      );
      const err = url.searchParams.get('error');
      expect(!err, `redirect carries error=${/^[a-z_]{1,40}$/.test(err ?? '') ? err : '?'}`);
      expect(url.searchParams.get('state') === stateParam, 'state not echoed');
      code = remember(url.searchParams.get('code'));
      expect(typeof code === 'string' && code.length > 0, 'no code in redirect');
      state.approved = true;
      return note;
    }
  );
  if (!approved) return false;

  return step('token: POST /oauth/token (authorization_code)', async () => {
    const res = await call('POST', '/oauth/token', {
      form: {
        grant_type: 'authorization_code',
        client_id: state.clientId,
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
        ...(PUBLIC_MODE ? {} : { resource: state.resource }),
      },
    });
    const note = status(res, 200);
    expect(
      typeof res.body?.access_token === 'string' && typeof res.body?.refresh_token === 'string',
      'no token pair'
    );
    state.access = remember(res.body.access_token);
    state.refresh = remember(res.body.refresh_token);
    const scope = typeof res.body.scope === 'string' ? res.body.scope : '';
    if (!PUBLIC_MODE) {
      // Only an assistant's (MCP) token is held to read-only; the --public app asked for its own scopes.
      expect(!/:write\b|receipts:read/.test(scope), 'MCP token carries a write or receipt scope');
    }
    return `${note}, scope "${scope}"`;
  });
}

async function mcpCall(label, bearer) {
  return step(label, async () => {
    const init = await mcpRpc(bearer, 1, 'initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: UA, version: '1.0.0' },
    });
    status(init, 200);
    expect(init.body?.result?.capabilities?.tools !== undefined, 'initialize: no tools capability');
    const res = await mcpRpc(bearer, 2, 'tools/call', { name: 'list_accounts', arguments: {} });
    const note = status(res, 200);
    const result = res.body?.result;
    expect(
      result && !result.isError,
      `list_accounts returned a tool error${errorCode(res.body) ? ` (${errorCode(res.body)})` : ''}`
    );
    const data = result.structuredContent?.data;
    expect(
      Array.isArray(data) && data.some((a) => a?.id === ACCOUNT_ID),
      'list_accounts does not include ACCOUNT_ID'
    );
    return `initialize + list_accounts ${note}, ${data.length} account(s)`;
  });
}

async function refreshPair() {
  return step('token: POST /oauth/token (refresh_token)', async () => {
    const res = await call('POST', '/oauth/token', {
      form: {
        grant_type: 'refresh_token',
        client_id: state.clientId,
        refresh_token: state.refresh,
      },
    });
    const note = status(res, 200);
    expect(
      typeof res.body?.access_token === 'string' && typeof res.body?.refresh_token === 'string',
      'no token pair'
    );
    expect(res.body.refresh_token !== state.refresh, 'refresh token was not rotated');
    state.access = remember(res.body.access_token);
    state.refresh = remember(res.body.refresh_token);
    return note;
  });
}

async function revokeGrant(label = 'revoke: POST /oauth/revoke (refresh token)') {
  return step(label, async () => {
    const res = await call('POST', '/oauth/revoke', {
      form: { client_id: state.clientId, token: state.refresh },
    });
    const note = status(res, 200);
    state.grantRevoked = true;
    return note;
  });
}

async function runMcp() {
  if (!(await discover())) return;
  if (!(await registerDcrClient())) return;
  if (!(await approveAndExchange())) return;

  await step('binding: MCP token on GET /public/v1/account is refused', async () =>
    status(await call('GET', '/public/v1/account', { bearer: state.access }), 401)
  );
  await step('challenge: POST /mcp without a token', async () => {
    const res = await mcpRpc(undefined, 1, 'tools/list');
    const note = status(res, 401);
    const www = res.headers.get('www-authenticate') ?? '';
    expect(
      /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/mcp"/.test(www),
      'WWW-Authenticate lacks resource_metadata'
    );
    return note;
  });
  if (!(await mcpCall('MCP: initialize + tools/call list_accounts', state.access))) return;
  if (!(await refreshPair())) return;
  await mcpCall('MCP: list_accounts with the refreshed token', state.access);
  if (!(await revokeGrant())) return;
  await step('after revoke: POST /mcp is refused', async () => {
    const res = await mcpRpc(state.access, 3, 'tools/list');
    const note = status(res, 401);
    expect(
      /error="invalid_token"/.test(res.headers.get('www-authenticate') ?? ''),
      'no invalid_token in WWW-Authenticate'
    );
    return note;
  });
}

async function runPublic() {
  if (!(await createDeveloperApp())) return;
  if (!(await approveAndExchange())) return;

  await step('public API: GET /public/v1/account', async () => {
    const res = await call('GET', '/public/v1/account', { bearer: state.access });
    const note = status(res, 200);
    expect(res.body?.id === ACCOUNT_ID, 'account id differs from ACCOUNT_ID');
    return note;
  });
  await step('binding: public token on POST /mcp is refused (404 while MCP is off)', async () =>
    status(await mcpRpc(state.access, 1, 'tools/list'), [401, 404])
  );
  if (!(await refreshPair())) return;
  await step('public API: GET /public/v1/account with the refreshed token', async () =>
    status(await call('GET', '/public/v1/account', { bearer: state.access }), 200)
  );
  if (!(await revokeGrant())) return;
  await step('after revoke: GET /public/v1/account is refused', async () =>
    status(await call('GET', '/public/v1/account', { bearer: state.access }), 401)
  );
}

/**
 * MCP mode, approve succeeded but no token came back: the grant exists and /oauth/revoke has nothing
 * to revoke it with. Find it in the test user's Connected apps (our client's name, granted by us on
 * ACCOUNT_ID during this run) and disconnect it with APP_TOKEN.
 */
async function disconnectOrphanGrant() {
  return step('cleanup: DELETE /api/v1/connected-apps/:grantId (token exchange failed)', async () => {
    const list = await call('GET', '/api/v1/connected-apps', { bearer: APP_TOKEN });
    status(list, 200);
    expect(Array.isArray(list.body), 'connected apps list is not an array');
    const since = RUN_STARTED_AT - 5 * 60_000; // tolerate clock skew between this machine and the API
    const mine = list.body
      .filter(
        (g) =>
          g?.isGrantor === true &&
          g?.app?.name === DCR_CLIENT_NAME &&
          Array.isArray(g.accounts) &&
          g.accounts.some((a) => a?.id === ACCOUNT_ID) &&
          Date.parse(g.connectedAt) >= since
      )
      .sort((a, b) => Date.parse(b.connectedAt) - Date.parse(a.connectedAt));
    expect(mine.length > 0, 'no grant of this run found in Connected apps');
    const res = await call('DELETE', `/api/v1/connected-apps/${encodeURIComponent(mine[0].grantId)}`, {
      bearer: APP_TOKEN,
    });
    const note = status(res, [200, 204]);
    state.grantRevoked = true;
    return note;
  });
}

async function cleanupOnce() {
  if (state.refresh && !state.grantRevoked) {
    await revokeGrant('cleanup: revoke the grant');
  } else if (state.approved && !state.refresh && !state.grantRevoked && !PUBLIC_MODE) {
    await disconnectOrphanGrant();
  }
  if (state.devAppId) {
    await step('cleanup: DELETE /api/v1/developer/apps/:id', async () =>
      status(
        await call('DELETE', `/api/v1/developer/apps/${encodeURIComponent(state.devAppId)}`, {
          bearer: APP_TOKEN,
        }),
        [200, 204]
      )
    );
  } else if (state.clientId && !PUBLIC_MODE) {
    log(
      `note  DCR client ${state.clientId} is left in place (no live token). The cleanup cron soft-deletes it 30 days ` +
        'after its last grant was revoked (or after registration if it never got one); block it in admin, API apps, to remove it sooner'
    );
  }
}

/** Runs once, whether reached from the normal end or from a signal. */
let cleanupPromise = null;
function cleanup() {
  cleanupPromise ??= cleanupOnce();
  return cleanupPromise;
}

// Ctrl-C / SIGTERM mid-run must not leave a live grant behind: clean up, then exit 130.
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (interrupted) process.exit(130); // a second Ctrl-C does not wait for cleanup
    interrupted = true;
    log(`\n${signal}: cleaning up before exit`);
    cleanup()
      .catch(() => undefined)
      .finally(() => process.exit(130));
  });
}

log(`mcp-smoke: ${PUBLIC_MODE ? 'public API' : 'MCP'} mode against ${BASE}`);
try {
  await (PUBLIC_MODE ? runPublic() : runMcp());
} finally {
  await cleanup();
}
const failedSteps = results.filter((r) => !r.ok).map((r) => r.name);
if (failed) {
  log(
    `\nRESULT: FAIL (${failedSteps.length} of ${results.length} steps): ${failedSteps.join('; ')}`
  );
  process.exit(1);
}
log(`\nRESULT: PASS (${results.length} steps)`);
