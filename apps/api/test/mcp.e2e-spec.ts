/**
 * End-to-end test of the MCP connector against a REAL Postgres and Redis, with the whole AppModule
 * booted: discovery → dynamic client registration → consent approve with PKCE + resource → token →
 * resource binding → /mcp initialize + tools/call → refresh → revoke. The same flow as
 * `scripts/mcp-smoke.mjs`, which runs it against production (docs/ops/mcp.md).
 *
 * Run (disposable instances only; without both URLs the suite is skipped with a message):
 *   cd apps/api && DATABASE_URL=postgresql://.../budget_test REDIS_URL=redis://... npm run test:e2e -- mcp
 *
 * Users are created directly via Prisma under a per-run e-mail domain; teardown deletes them (their
 * accounts, grants and tokens cascade) and the DCR clients this run registered (those have no owner,
 * so nothing cascades to them). Registrations come from a per-run X-Forwarded-For address so the
 * 10-per-hour per-IP limit is never shared between runs.
 */
import { EMAIL_DOMAIN, MCP_E2E_SKIP_REASON } from './mcp.e2e-env';

import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { json, urlencoded } from 'express';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { GLOBAL_PREFIX_EXCLUDED_ROUTES } from '../src/global-prefix-exclusions';
import { PrismaService } from '../src/database/prisma.service';
import { AccountsService } from '../src/modules/accounts/accounts.service';
import { MailService } from '../src/modules/mail/mail.service';
import { MCP_PATH, mcpBodyLimit } from '../src/modules/mcp/mcp-body-limit';
import { DCR_REGISTER_PATH, registerBodyLimit } from '../src/modules/oauth/register-body-limit';
import { MCP_DEFAULT_SCOPES } from '../src/modules/oauth/mcp.config';

const REDIRECT_URI = 'http://127.0.0.1:53682/callback';
const PROTOCOL = '2025-06-18';
/** Per run: the per-IP registration window never carries over between runs (TEST-NET-2 range). */
const CLIENT_IP = `198.51.100.${randomInt(1, 255)}`;

interface TestUser {
  id: string;
  email: string;
  jwt: string;
}

interface TokenPair {
  access_token: string;
  refresh_token: string;
  scope: string;
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

if (MCP_E2E_SKIP_REASON) {
  // eslint-disable-next-line no-console
  console.warn(MCP_E2E_SKIP_REASON);
}
const suite = MCP_E2E_SKIP_REASON ? describe.skip : describe;

suite('MCP connector (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accounts: AccountsService;
  let jwtService: JwtService;
  let config: ConfigService;

  let owner: TestUser;
  let accountA: string;
  /** Resource identifier read from the protected-resource document, as a real client does. */
  let resource: string;
  /** DCR client ids registered by this run (no owner, so teardown deletes them by id). */
  const dcrClientIds: string[] = [];

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const mailStub: Record<string, jest.Mock> = {};
    for (const key of Object.getOwnPropertyNames(MailService.prototype)) {
      if (key !== 'constructor') mailStub[key] = jest.fn().mockResolvedValue(true);
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mailStub)
      .compile();

    // Mirror main.ts: trust one proxy hop (req.ip from X-Forwarded-For), the per-route parsers of
    // /oauth/register and /mcp mounted BEFORE the app-wide ones, the prefix exclusions, the pipe.
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    app.use(DCR_REGISTER_PATH, registerBodyLimit());
    app.use(MCP_PATH, mcpBodyLimit());
    app.use(json({ limit: '50mb' }));
    app.use(urlencoded({ extended: true }));
    app.setGlobalPrefix('api/v1', { exclude: GLOBAL_PREFIX_EXCLUDED_ROUTES });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      })
    );
    await app.init();

    prisma = moduleRef.get(PrismaService);
    accounts = moduleRef.get(AccountsService);
    jwtService = moduleRef.get(JwtService);
    config = moduleRef.get(ConfigService);

    const email = `owner@${EMAIL_DOMAIN}`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'x',
        name: 'MCP owner',
        currencyCode: 'PLN',
        isVerified: true,
        isActive: true,
      },
    });
    owner = {
      id: user.id,
      email,
      jwt: await jwtService.signAsync(
        { sub: user.id, email },
        { secret: config.get<string>('JWT_SECRET'), expiresIn: '1h' }
      ),
    };
    accountA = (await accounts.createDefaultAccount(owner.id, 'PLN', 'en')).id;
  }, 120_000);

  afterAll(async () => {
    process.env.MCP_ENABLED = 'true';
    if (prisma) {
      if (dcrClientIds.length > 0)
        await prisma.oAuthClient.deleteMany({ where: { clientId: { in: dcrClientIds } } });
      await prisma.account.deleteMany({
        where: { owner: { email: { endsWith: `@${EMAIL_DOMAIN}` } } },
      });
      await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
    }
    if (app) await app.close();
  });

  // ── helpers ──────────────────────────────────────────────────────────────

  async function registerDcr(): Promise<string> {
    const res = await http()
      .post('/oauth/register')
      .set('X-Forwarded-For', CLIENT_IP)
      .send({ client_name: `MCP e2e ${randomUUID().slice(0, 8)}`, redirect_uris: [REDIRECT_URI] });
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      token_endpoint_auth_method: 'none',
      redirect_uris: [REDIRECT_URI],
    });
    expect(res.body.client_secret).toBeUndefined();
    dcrClientIds.push(res.body.client_id);
    return res.body.client_id as string;
  }

  function approve(clientId: string, challenge: string, extra: Record<string, unknown>) {
    return http()
      .post('/api/v1/oauth/authorize/approve')
      .set('Authorization', `Bearer ${owner.jwt}`)
      .send({
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'st-1',
        account_id: accountA,
        decision: 'allow',
        ...extra,
      });
  }

  /** Approve → code from the redirect → token (public client: no secret). */
  async function connect(
    clientId: string,
    extra: Record<string, unknown>,
    tokenExtra: Record<string, string> = {}
  ): Promise<TokenPair> {
    const { verifier, challenge } = pkce();
    const approved = await approve(clientId, challenge, extra);
    expect(approved.status).toBe(200);
    const url = new URL(approved.body.redirectTo);
    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT_URI);
    expect(url.searchParams.get('state')).toBe('st-1');
    const code = url.searchParams.get('code');
    expect(code).toMatch(/^aba_ac_/);
    const res = await http()
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: code!,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
        ...tokenExtra,
      });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toMatch(/^aba_at_/);
    expect(res.body.refresh_token).toMatch(/^aba_rt_/);
    return res.body as TokenPair;
  }

  function rpc(body: unknown, bearer?: string) {
    const req = http()
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('mcp-protocol-version', PROTOCOL)
      .send(body as object);
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  }

  async function listAccounts(bearer: string) {
    const init = await rpc(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL,
          capabilities: {},
          clientInfo: { name: 'e2e', version: '1.0.0' },
        },
      },
      bearer
    );
    expect(init.status).toBe(200);
    expect(init.body.result.capabilities.tools).toBeDefined();
    const res = await rpc(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'list_accounts', arguments: {} },
      },
      bearer
    );
    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBeFalsy();
    return res.body.result.structuredContent.data as Array<{ id: string; active: boolean }>;
  }

  const publicAccount = (bearer: string) =>
    http().get('/public/v1/account').set('Authorization', `Bearer ${bearer}`);

  // ── scenarios ────────────────────────────────────────────────────────────

  it('(m1) discovery documents', async () => {
    const as = await http().get('/.well-known/oauth-authorization-server');
    expect(as.status).toBe(200);
    expect(as.body.code_challenge_methods_supported).toEqual(['S256']);
    expect(as.body.token_endpoint_auth_methods_supported).toContain('none');
    expect(as.body.registration_endpoint).toBe(`${as.body.issuer}/oauth/register`);
    expect(as.body.token_endpoint).toBe(`${as.body.issuer}/oauth/token`);

    const pr = await http().get('/.well-known/oauth-protected-resource/mcp');
    expect(pr.status).toBe(200);
    expect(pr.body.authorization_servers).toEqual([as.body.issuer]);
    expect([...pr.body.scopes_supported].sort()).toEqual([...MCP_DEFAULT_SCOPES].sort());
    resource = pr.body.resource;
    expect(resource).toMatch(/^https?:\/\/.+\/mcp$/);

    const root = await http().get('/.well-known/oauth-protected-resource');
    expect(root.status).toBe(200);
    expect(root.body.resource).toBe(resource);
  });

  it('(m2) DCR → approve with resource → token → binding → initialize + list_accounts → refresh → revoke', async () => {
    if (!resource)
      resource = (await http().get('/.well-known/oauth-protected-resource/mcp')).body.resource;
    const clientId = await registerDcr();

    // No scope: the five default read scopes.
    const pair = await connect(clientId, { resource }, { resource });
    expect(pair.scope.split(' ').sort()).toEqual([...MCP_DEFAULT_SCOPES].sort());

    // Resource binding: the MCP token is not a public API token.
    expect((await publicAccount(pair.access_token)).status).toBe(401);

    // No token: 401 with the resource-metadata challenge and no error code.
    const anon = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(anon.status).toBe(401);
    expect(anon.headers['www-authenticate']).toMatch(
      /^Bearer resource_metadata=".+\/\.well-known\/oauth-protected-resource\/mcp"$/
    );

    const data = await listAccounts(pair.access_token);
    expect(data).toEqual([expect.objectContaining({ id: accountA, active: true })]);

    // Refresh keeps the binding: the new token works on /mcp and still not on /public/v1.
    const refreshed = await http()
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: pair.refresh_token,
      });
    expect(refreshed.status).toBe(200);
    const pair2 = refreshed.body as TokenPair;
    expect(pair2.refresh_token).not.toBe(pair.refresh_token);
    expect((await listAccounts(pair2.access_token)).map((a) => a.id)).toEqual([accountA]);
    expect((await publicAccount(pair2.access_token)).status).toBe(401);

    const revoked = await http()
      .post('/oauth/revoke')
      .type('form')
      .send({ client_id: clientId, token: pair2.refresh_token });
    expect(revoked.status).toBe(200);

    const after = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, pair2.access_token);
    expect(after.status).toBe(401);
    expect(after.headers['www-authenticate']).toContain('error="invalid_token"');
  });

  it('(m3) a registered assistant is refused without the MCP resource, with a foreign resource, and with a write scope', async () => {
    if (!resource)
      resource = (await http().get('/.well-known/oauth-protected-resource/mcp')).body.resource;
    const clientId = await registerDcr();
    const { challenge } = pkce();

    const noResource = await approve(clientId, challenge, {});
    expect(noResource.status).toBe(400);
    expect(noResource.body.error).toBe('invalid_target');

    const foreign = await approve(clientId, challenge, {
      resource: 'https://evil.example.com/mcp',
    });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error).toBe('invalid_target');

    const write = await approve(clientId, challenge, {
      resource,
      scope: 'expenses:read expenses:write',
    });
    expect(write.status).toBe(400);
    expect(write.body.error).toBe('invalid_scope');

    const receipts = await approve(clientId, challenge, { resource, scope: 'receipts:read' });
    expect(receipts.status).toBe(400);
    expect(receipts.body.error).toBe('invalid_scope');
  });

  it('(m4) public API flow (no resource, manual public client): /public/v1 works, /mcp refuses the token', async () => {
    const created = await http()
      .post('/api/v1/developer/apps')
      .set('Authorization', `Bearer ${owner.jwt}`)
      .send({
        name: `MCP e2e public ${randomUUID().slice(0, 8)}`,
        homepageUrl: 'https://client.example.com',
        redirectUris: [REDIRECT_URI],
        isConfidential: false,
      });
    expect(created.status).toBe(201);
    const clientId: string = created.body.app.clientId;

    const pair = await connect(clientId, { scope: 'expenses:read categories:read' });
    const account = await publicAccount(pair.access_token);
    expect(account.status).toBe(200);
    expect(account.body.id).toBe(accountA);

    const mcp = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, pair.access_token);
    expect(mcp.status).toBe(401);
    expect(mcp.headers['www-authenticate']).toContain('error="invalid_token"');

    const revoked = await http()
      .post('/oauth/revoke')
      .type('form')
      .send({ client_id: clientId, token: pair.refresh_token });
    expect(revoked.status).toBe(200);
    expect((await publicAccount(pair.access_token)).status).toBe(401);
  });

  it('(m5) a JSON-RPC batch is refused before authentication', async () => {
    const res = await rpc([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(-32600);
  });

  it('(m6) with MCP_ENABLED off, discovery, registration and /mcp do not exist (404); the public API is unchanged', async () => {
    process.env.MCP_ENABLED = 'false';
    try {
      expect((await http().get('/.well-known/oauth-authorization-server')).status).toBe(404);
      expect((await http().get('/.well-known/oauth-protected-resource/mcp')).status).toBe(404);
      expect(
        (
          await http()
            .post('/oauth/register')
            .set('X-Forwarded-For', CLIENT_IP)
            .send({ client_name: 'x', redirect_uris: [REDIRECT_URI] })
        ).status
      ).toBe(404);
      expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).status).toBe(404);
      // The public API still answers (401 without a token, not 404).
      expect((await http().get('/public/v1/account')).status).toBe(401);
    } finally {
      process.env.MCP_ENABLED = 'true';
    }
  });
});
