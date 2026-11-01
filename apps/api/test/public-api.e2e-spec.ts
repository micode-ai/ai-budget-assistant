/**
 * End-to-end tests of the Public API (phase 1): the OAuth authorization-code flow with PKCE, the
 * `/public/v1` expenses surface, and the ways a grant stops working — against a REAL Postgres and
 * Redis, with the whole AppModule booted.
 *
 * Run (disposable instances only — the env preamble refuses to fall back to .env):
 *   cd apps/api && DATABASE_URL=postgresql://... REDIS_URL=redis://... PUBLIC_API_ENABLED=true \
 *     npm run test:e2e -- public-api
 *
 * Users are created directly via Prisma (as in import-bank.e2e-spec.ts), under a per-run e-mail
 * domain; teardown deletes them and everything cascades (accounts, grants, tokens, apps, expenses).
 * MailService is stubbed: nothing is sent, and the "app connected" e-mail is asserted as requested.
 */
import { ADMIN_EMAIL, EMAIL_DOMAIN } from './public-api.e2e-env';

import { createHash, randomBytes, randomUUID } from 'crypto';
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
import { ExpensesService } from '../src/modules/expenses/expenses.service';
import { MailService } from '../src/modules/mail/mail.service';

const REDIRECT_URI = 'https://client.example.com/callback';
const ALL_SCOPES = 'expenses:read expenses:write receipts:read categories:read';

interface TestUser {
  id: string;
  email: string;
  jwt: string;
}

interface RegisteredApp {
  dbId: string;
  clientId: string;
  clientSecret: string;
}

interface TokenPair {
  access_token: string;
  refresh_token: string;
  scope: string;
  account_id: string;
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url'); // 43 chars, RFC 7636 alphabet
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

describe('Public API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accounts: AccountsService;
  let expenses: ExpensesService;
  let jwtService: JwtService;
  let config: ConfigService;
  const sendAppConnectedEmail = jest.fn().mockResolvedValue(true);

  let owner: TestUser;
  let admin: TestUser;
  /** Owner's default personal account — the one every main-flow grant is bound to. */
  let accountA: string;
  /** Second account of the SAME owner, never granted — the isolation target. */
  let accountB: string;
  /** Third account of the owner, tier-1 (text) end-to-end encrypted. */
  let accountEnc: string;

  const http = () => request(app.getHttpServer());

  // ── setup ────────────────────────────────────────────────────────────────

  async function createUser(label: string): Promise<TestUser> {
    const email = `${label}@${EMAIL_DOMAIN}`;
    const user = await prisma.user.create({
      data: { email, passwordHash: 'x', name: `PA ${label}`, currencyCode: 'PLN', isVerified: true, isActive: true },
    });
    const jwt = await jwtService.signAsync(
      { sub: user.id, email },
      { secret: config.get<string>('JWT_SECRET'), expiresIn: '1h' },
    );
    return { id: user.id, email, jwt };
  }

  async function createExtraAccount(ownerId: string, name: string, encryptionTier = 0): Promise<string> {
    const account = await prisma.account.create({
      data: {
        name,
        type: 'personal',
        currencyCode: 'PLN',
        ownerId,
        encryptionTier,
        encryptionEnabled: encryptionTier > 0,
        members: { create: { userId: ownerId, role: 'owner' } },
      },
    });
    return account.id;
  }

  beforeAll(async () => {
    const mailStub: Record<string, jest.Mock> = {};
    for (const key of Object.getOwnPropertyNames(MailService.prototype)) {
      if (key !== 'constructor') mailStub[key] = jest.fn().mockResolvedValue(true);
    }
    mailStub.sendAppConnectedEmail = sendAppConnectedEmail;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mailStub)
      .compile();

    // Mirror main.ts: both body parsers (OAuth clients send form bodies), the prefix exclusions,
    // the validation pipe.
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.use(json({ limit: '50mb' }));
    app.use(urlencoded({ extended: true }));
    app.setGlobalPrefix('api/v1', { exclude: GLOBAL_PREFIX_EXCLUDED_ROUTES });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    // Not mirrored: main.ts's boot-time `setupPublicDocs` (Swagger UI at /public/docs/{lang}). Those
    // are plain Express routes registered only when the flag is on AT BOOT, so they cannot follow
    // a runtime flip; scenario (e) checks the flag on the Nest-guarded GET /public/docs instead.
    await app.init();

    prisma = moduleRef.get(PrismaService);
    accounts = moduleRef.get(AccountsService);
    expenses = moduleRef.get(ExpensesService);
    jwtService = moduleRef.get(JwtService);
    config = moduleRef.get(ConfigService);

    owner = await createUser('owner');
    admin = await createUser('admin');
    expect(admin.email).toBe(ADMIN_EMAIL);
    accountA = (await accounts.createDefaultAccount(owner.id, 'PLN', 'en')).id;
    accountB = await createExtraAccount(owner.id, 'Account B');
    accountEnc = await createExtraAccount(owner.id, 'Encrypted', 1);
  }, 120_000);

  afterAll(async () => {
    process.env.PUBLIC_API_ENABLED = 'true';
    if (prisma) {
      // Accounts, members, grants, tokens, apps and expenses all cascade from the users.
      await prisma.account.deleteMany({ where: { owner: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
      await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
    }
    if (app) await app.close();
  });

  // ── flow helpers ─────────────────────────────────────────────────────────

  /** An expense written the app's own way (not through the public API). */
  async function seedExpense(
    accountId: string,
    userId: string,
    dto: Parameters<ExpensesService['create']>[2],
  ): Promise<{ id: string }> {
    const { expense } = await expenses.create(accountId, userId, dto);
    return { id: expense.id as string };
  }

  async function registerApp(dev: TestUser, isConfidential = true): Promise<RegisteredApp> {
    const res = await http()
      .post('/api/v1/developer/apps')
      .set('Authorization', `Bearer ${dev.jwt}`)
      .send({ name: `E2E app ${randomUUID().slice(0, 8)}`, homepageUrl: 'https://client.example.com', redirectUris: [REDIRECT_URI], isConfidential });
    expect(res.status).toBe(201);
    expect(res.body.app.clientId).toMatch(/^aba_ci_/);
    if (isConfidential) expect(res.body.clientSecret).toMatch(/^aba_cs_/);
    return { dbId: res.body.app.id, clientId: res.body.app.clientId, clientSecret: res.body.clientSecret };
  }

  function authorizeQuery(client: RegisteredApp, challenge: string) {
    return {
      client_id: client.clientId,
      redirect_uri: REDIRECT_URI,
      scope: ALL_SCOPES,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    };
  }

  function approve(user: TestUser, client: RegisteredApp, accountId: string, challenge: string) {
    return http()
      .post('/api/v1/oauth/authorize/approve')
      .set('Authorization', `Bearer ${user.jwt}`)
      .send({ ...authorizeQuery(client, challenge), state: 'st-1', account_id: accountId, decision: 'allow' });
  }

  /** Approve and return the authorization code taken from the redirect URL. */
  async function getCode(user: TestUser, client: RegisteredApp, accountId: string, challenge: string): Promise<string> {
    const res = await approve(user, client, accountId, challenge);
    expect(res.status).toBe(200);
    const url = new URL(res.body.redirectTo);
    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT_URI);
    expect(url.searchParams.get('state')).toBe('st-1');
    const code = url.searchParams.get('code');
    expect(code).toMatch(/^aba_ac_/);
    return code!;
  }

  function tokenRequest(client: RegisteredApp, form: Record<string, string>) {
    return http()
      .post('/oauth/token')
      .type('form')
      .send({ client_id: client.clientId, client_secret: client.clientSecret, ...form });
  }

  async function exchange(client: RegisteredApp, code: string, verifier: string): Promise<TokenPair> {
    const res = await tokenRequest(client, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.access_token).toMatch(/^aba_at_/);
    expect(res.body.refresh_token).toMatch(/^aba_rt_/);
    return res.body as TokenPair;
  }

  async function connect(user: TestUser, client: RegisteredApp, accountId: string): Promise<TokenPair> {
    const { verifier, challenge } = pkce();
    const code = await getCode(user, client, accountId, challenge);
    return exchange(client, code, verifier);
  }

  async function refresh(client: RegisteredApp, refreshToken: string) {
    return tokenRequest(client, { grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  const api = (method: 'get' | 'post' | 'patch' | 'delete', path: string, accessToken: string) =>
    http()[method](`/public/v1${path}`).set('Authorization', `Bearer ${accessToken}`);

  /**
   * The changes feed withholds rows younger than PUBLIC_CHANGES_SAFETY_LAG_MS (10 s, on the DB
   * clock). Instead of sleeping past the window, push the row's updated_at 20 s into the past.
   * Raw SQL on purpose: Prisma's @updatedAt would overwrite any value written through the client.
   */
  async function settle(expenseId: string): Promise<void> {
    await prisma.$executeRaw`UPDATE expenses SET updated_at = updated_at - interval '20 seconds' WHERE id = ${expenseId}`;
  }

  async function allChanges(accessToken: string, cursor?: string) {
    const res = await api('get', `/expenses/changes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, accessToken);
    expect(res.status).toBe(200);
    return res.body as {
      changes: Array<{ type: 'upsert'; expense: { id: string; amount: string } } | { type: 'delete'; id: string; deleted_at: string }>;
      next_cursor: string;
      has_more: boolean;
    };
  }

  const changeId = (c: { type: string; id?: string; expense?: { id: string } }) => (c.type === 'upsert' ? c.expense!.id : c.id!);

  // ── (a) the full happy path ──────────────────────────────────────────────

  it('(a) register → preview → approve → token → list → create (idempotent) → patch → changes → delete → refresh → revoke', async () => {
    const client = await registerApp(owner);
    const { verifier, challenge } = pkce();

    const preview = await http()
      .get('/api/v1/oauth/authorize/preview')
      .query({ ...authorizeQuery(client, challenge), response_type: 'code', state: 'st-1' })
      .set('Authorization', `Bearer ${owner.jwt}`);
    expect(preview.status).toBe(200);
    expect(preview.body.scopes).toEqual(ALL_SCOPES.split(' '));
    const previewA = preview.body.accounts.find((a: { id: string }) => a.id === accountA);
    expect(previewA).toMatchObject({ role: 'owner', selectable: true, reason: null, readOnly: false });

    sendAppConnectedEmail.mockClear();
    const code = await getCode(owner, client, accountA, challenge);
    // The "connected" e-mail is fire-and-forget after the grant is created; wait for the call.
    for (let i = 0; i < 50 && sendAppConnectedEmail.mock.calls.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(sendAppConnectedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: owner.email, accountName: expect.any(String) }));

    const pair = await exchange(client, code, verifier);
    expect(pair.account_id).toBe(accountA);
    expect(pair.scope.split(' ').sort()).toEqual(ALL_SCOPES.split(' ').sort());

    // The code is single use.
    const replay = await tokenRequest(client, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe('invalid_grant');

    const account = await api('get', '/account', pair.access_token);
    expect(account.status).toBe(200);
    expect(account.body).toMatchObject({ id: accountA, role: 'owner', encryption: 'none', read_only: false });
    expect(account.headers['x-ratelimit-limit']).toBeDefined();

    const emptyList = await api('get', '/expenses', pair.access_token);
    expect(emptyList.status).toBe(200);
    expect(emptyList.body).toMatchObject({ data: [], has_more: false });

    // Create twice with the same Idempotency-Key: 201, then 200 with the same expense.
    const key = randomUUID();
    const body = { amount: '42.50', date: '2026-10-31', description: 'Weekly groceries', merchant: 'Biedronka' };
    const created = await api('post', '/expenses', pair.access_token).set('Idempotency-Key', key).send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ amount: '42.50', currency: 'PLN', date: '2026-10-31', merchant: 'Biedronka', source: 'api' });
    expect(created.body.created_by_app).toMatchObject({ id: client.clientId });
    const expenseId: string = created.body.id;

    const repeated = await api('post', '/expenses', pair.access_token).set('Idempotency-Key', key).send(body);
    expect(repeated.status).toBe(200);
    expect(repeated.body.id).toBe(expenseId);
    expect(await prisma.expense.count({ where: { accountId: accountA, isDeleted: false } })).toBe(1);

    const listed = await api('get', '/expenses', pair.access_token);
    expect(listed.body.data.map((e: { id: string }) => e.id)).toEqual([expenseId]);

    const patched = await api('patch', `/expenses/${expenseId}`, pair.access_token).send({ amount: '45.00', notes: 'edited' });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ id: expenseId, amount: '45.00', notes: 'edited' });

    // Changes feed shows the upsert (with the patched amount) once it is past the safety lag.
    const beforeSettle = await allChanges(pair.access_token);
    expect(beforeSettle.changes.map(changeId)).not.toContain(expenseId);
    await settle(expenseId);
    const feed1 = await allChanges(pair.access_token);
    const upsert = feed1.changes.find((c) => changeId(c) === expenseId);
    expect(upsert).toMatchObject({ type: 'upsert', expense: { id: expenseId, amount: '45.00' } });

    const del = await api('delete', `/expenses/${expenseId}`, pair.access_token);
    expect(del.status).toBe(204);
    const gone = await api('get', `/expenses/${expenseId}`, pair.access_token);
    expect(gone.status).toBe(404);
    expect(gone.body.error.code).toBe('not_found');

    await settle(expenseId);
    const feed2 = await allChanges(pair.access_token, feed1.next_cursor);
    expect(feed2.changes).toEqual([expect.objectContaining({ type: 'delete', id: expenseId })]);

    // Refresh: a new pair, both of which work.
    const refreshed = await refresh(client, pair.refresh_token);
    expect(refreshed.status).toBe(200);
    const pair2 = refreshed.body as TokenPair;
    expect(pair2.refresh_token).not.toBe(pair.refresh_token);
    expect((await api('get', '/account', pair2.access_token)).status).toBe(200);

    // Revoke (RFC 7009) by the refresh token: the whole grant goes, the access token included.
    const revoked = await http()
      .post('/oauth/revoke')
      .type('form')
      .send({ client_id: client.clientId, client_secret: client.clientSecret, token: pair2.refresh_token });
    expect(revoked.status).toBe(200);
    expect(revoked.body).toEqual({});

    const after = await api('get', '/account', pair2.access_token);
    expect(after.status).toBe(401);
    expect(after.body).toEqual({ error: expect.objectContaining({ code: 'invalid_token' }) });
    expect(after.headers['www-authenticate']).toContain('invalid_token');
  });

  // ── (b) isolation between two accounts of the same user ──────────────────

  it('(b) a grant on account A never reaches account B of the same user', async () => {
    const client = await registerApp(owner);
    const pair = await connect(owner, client, accountA);

    const inB = await seedExpense(accountB, owner.id, {
      localId: randomUUID(),
      amount: 99,
      currencyCode: 'PLN',
      date: '2026-10-30',
      description: 'secret in B',
      source: 'manual',
    });
    const inA = await seedExpense(accountA, owner.id, {
      localId: randomUUID(),
      amount: 11,
      currencyCode: 'PLN',
      date: '2026-10-30',
      description: 'visible in A',
      source: 'manual',
    });
    await settle(inB.id);
    await settle(inA.id);

    for (const path of [`/expenses/${inB.id}`, `/expenses/${inB.id}/receipt`]) {
      const res = await api('get', path, pair.access_token);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    }
    const patch = await api('patch', `/expenses/${inB.id}`, pair.access_token).send({ amount: '1.00' });
    expect(patch.status).toBe(404);
    const del = await api('delete', `/expenses/${inB.id}`, pair.access_token);
    expect(del.status).toBe(404);
    const untouched = await prisma.expense.findUniqueOrThrow({ where: { id: inB.id } });
    expect(untouched.isDeleted).toBe(false);
    expect(untouched.amount.toFixed(2)).toBe('99.00');

    const list = await api('get', '/expenses', pair.access_token);
    const listIds = list.body.data.map((e: { id: string }) => e.id);
    expect(listIds).toContain(inA.id);
    expect(listIds).not.toContain(inB.id);

    // Review Focus 3: walk the whole feed — no B row, ever, upsert or delete.
    const feedIds: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const feed = await allChanges(pair.access_token, cursor);
      feedIds.push(...feed.changes.map(changeId));
      cursor = feed.next_cursor;
      if (!feed.has_more) break;
    }
    expect(feedIds).toContain(inA.id);
    expect(feedIds).not.toContain(inB.id);
    const bIds = (await prisma.expense.findMany({ where: { accountId: accountB }, select: { id: true } })).map((e) => e.id);
    expect(feedIds.filter((id) => bIds.includes(id))).toEqual([]);
  });

  // ── (c) a viewer cannot grant ────────────────────────────────────────────

  it('(c) a viewer of the account cannot approve', async () => {
    const viewer = await createUser('viewer');
    await prisma.accountMember.create({ data: { accountId: accountA, userId: viewer.id, role: 'viewer' } });
    const client = await registerApp(owner);
    const { challenge } = pkce();

    const preview = await http()
      .get('/api/v1/oauth/authorize/preview')
      .query({ ...authorizeQuery(client, challenge), response_type: 'code' })
      .set('Authorization', `Bearer ${viewer.jwt}`);
    expect(preview.status).toBe(200);
    expect(preview.body.accounts.find((a: { id: string }) => a.id === accountA)).toMatchObject({
      role: 'viewer',
      selectable: false,
      reason: 'viewer',
    });

    const res = await approve(viewer, client, accountA, challenge);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('access_denied');
    expect(await prisma.oAuthGrant.count({ where: { clientId: client.dbId } })).toBe(0);
  });

  // ── (d) admin block / unblock ────────────────────────────────────────────

  it('(d) an admin block cuts the app off on the next call; unblock restores it', async () => {
    const client = await registerApp(owner);
    const pair = await connect(owner, client, accountA);
    expect((await api('get', '/account', pair.access_token)).status).toBe(200);

    // Not an admin: refused.
    const notAdmin = await http()
      .patch(`/api/v1/admin/oauth-clients/${client.dbId}`)
      .set('Authorization', `Bearer ${owner.jwt}`)
      .send({ status: 'blocked', blockedReason: 'e2e' });
    expect(notAdmin.status).toBe(403);

    const block = await http()
      .patch(`/api/v1/admin/oauth-clients/${client.dbId}`)
      .set('Authorization', `Bearer ${admin.jwt}`)
      .send({ status: 'blocked', blockedReason: 'e2e block' });
    expect(block.status).toBe(200);

    const blocked = await api('get', '/account', pair.access_token);
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe('invalid_token');
    // The token endpoint refuses the blocked client too.
    const refreshBlocked = await refresh(client, pair.refresh_token);
    expect(refreshBlocked.status).toBe(401);
    expect(refreshBlocked.body.error).toBe('invalid_client');

    const unblock = await http()
      .patch(`/api/v1/admin/oauth-clients/${client.dbId}`)
      .set('Authorization', `Bearer ${admin.jwt}`)
      .send({ status: 'active' });
    expect(unblock.status).toBe(200);
    expect((await api('get', '/account', pair.access_token)).status).toBe(200);
    expect((await refresh(client, pair.refresh_token)).status).toBe(200);
  });

  // ── (f) the grantor loses write access after consent ─────────────────────

  it('(f) a grantor demoted to viewer after consent → 403 grant_inactive, and no refresh', async () => {
    const editor = await createUser('editor');
    await prisma.accountMember.create({ data: { accountId: accountA, userId: editor.id, role: 'editor' } });
    const client = await registerApp(owner);
    const pair = await connect(editor, client, accountA);

    const ok = await api('get', '/account', pair.access_token);
    expect(ok.status).toBe(200);
    expect(ok.body.role).toBe('editor');

    await prisma.accountMember.update({
      where: { accountId_userId: { accountId: accountA, userId: editor.id } },
      data: { role: 'viewer' },
    });

    const demoted = await api('get', '/expenses', pair.access_token);
    expect(demoted.status).toBe(403);
    expect(demoted.body.error.code).toBe('grant_inactive');
    const refreshed = await refresh(client, pair.refresh_token);
    expect(refreshed.status).toBe(400);
    expect(refreshed.body.error).toBe('invalid_grant');
  });

  // ── (g) refresh-token reuse ──────────────────────────────────────────────

  it('(g) reusing a rotated refresh token revokes the whole grant', async () => {
    const client = await registerApp(owner);
    const pair1 = await connect(owner, client, accountA);

    const rotated = await refresh(client, pair1.refresh_token);
    expect(rotated.status).toBe(200);
    const pair2 = rotated.body as TokenPair;
    expect((await api('get', '/account', pair2.access_token)).status).toBe(200);

    const reuse = await refresh(client, pair1.refresh_token);
    expect(reuse.status).toBe(400);
    expect(reuse.body.error).toBe('invalid_grant');

    const afterReuse = await api('get', '/account', pair2.access_token);
    expect(afterReuse.status).toBe(401);
    expect(afterReuse.body.error.code).toBe('invalid_token');
    expect((await refresh(client, pair2.refresh_token)).body.error).toBe('invalid_grant');

    const grant = await prisma.oAuthGrant.findFirstOrThrow({ where: { clientId: client.dbId } });
    expect(grant.revokedAt).not.toBeNull();
    expect(grant.revokedBy).toBe('reuse_detected');
  });

  // ── (h) tier-1 encrypted account ─────────────────────────────────────────

  it('(h) a tier-1 encrypted account is readable with nulled text fields and refuses writes', async () => {
    const client = await registerApp(owner);
    const { challenge } = pkce();
    const preview = await http()
      .get('/api/v1/oauth/authorize/preview')
      .query({ ...authorizeQuery(client, challenge), response_type: 'code' })
      .set('Authorization', `Bearer ${owner.jwt}`);
    expect(preview.body.accounts.find((a: { id: string }) => a.id === accountEnc)).toMatchObject({
      selectable: true,
      readOnly: true,
      reason: null,
    });

    const row = await seedExpense(accountEnc, owner.id, {
      localId: randomUUID(),
      amount: 12.5,
      currencyCode: 'PLN',
      date: '2026-10-29',
      description: 'plaintext the server holds',
      merchant: 'Some shop',
      notes: 'a note',
      source: 'manual',
    });

    const pair = await connect(owner, client, accountEnc);
    const account = await api('get', '/account', pair.access_token);
    expect(account.body).toMatchObject({ id: accountEnc, encryption: 'text', read_only: true });

    const detail = await api('get', `/expenses/${row.id}`, pair.access_token);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ amount: '12.50', description: null, merchant: null, notes: null });
    expect(detail.body.encrypted_fields).toEqual(expect.arrayContaining(['description', 'merchant', 'notes']));

    const list = await api('get', '/expenses', pair.access_token);
    expect(list.status).toBe(200);
    expect(list.body.data.find((e: { id: string }) => e.id === row.id)).toMatchObject({ description: null });

    const create = await api('post', '/expenses', pair.access_token)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '1.00', date: '2026-10-31' });
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe('account_encrypted');
    const patch = await api('patch', `/expenses/${row.id}`, pair.access_token).send({ amount: '2.00' });
    expect(patch.status).toBe(403);
    expect(patch.body.error.code).toBe('account_encrypted');
    const del = await api('delete', `/expenses/${row.id}`, pair.access_token);
    expect(del.status).toBe(403);
    expect(del.body.error.code).toBe('account_encrypted');
  });

  // ── (i) PKCE ─────────────────────────────────────────────────────────────

  it('(i) a wrong PKCE verifier is invalid_grant and burns the code', async () => {
    const client = await registerApp(owner);
    const { verifier, challenge } = pkce();
    const code = await getCode(owner, client, accountA, challenge);

    const wrong = await tokenRequest(client, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: pkce().verifier,
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe('invalid_grant');

    const right = await tokenRequest(client, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier });
    expect(right.status).toBe(400);
    expect(right.body.error).toBe('invalid_grant');
  });

  // ── (e) feature flag off — last, and restored in a finally ───────────────

  it('(e) with PUBLIC_API_ENABLED off the surface does not exist (404), read per request', async () => {
    const client = await registerApp(owner);
    const pair = await connect(owner, client, accountA);
    expect((await http().get('/public/docs')).status).toBe(302);

    process.env.PUBLIC_API_ENABLED = 'false';
    try {
      const account = await api('get', '/account', pair.access_token);
      expect(account.status).toBe(404);
      expect(account.body.error.code).toBe('not_found');

      const token = await refresh(client, pair.refresh_token);
      expect(token.status).toBe(404);
      const revoke = await http().post('/oauth/revoke').type('form').send({ client_id: client.clientId, token: pair.refresh_token });
      expect(revoke.status).toBe(404);

      expect((await http().get('/public/docs')).status).toBe(404);
      expect((await http().get('/public/docs/oauth2-redirect.html')).status).toBe(404);

      const devApps = await http().get('/api/v1/developer/apps').set('Authorization', `Bearer ${owner.jwt}`);
      expect(devApps.status).toBe(404);
      const connected = await http().get('/api/v1/connected-apps').set('Authorization', `Bearer ${owner.jwt}`);
      expect(connected.status).toBe(404);
    } finally {
      process.env.PUBLIC_API_ENABLED = 'true';
    }

    // Back on: the same token works again — the flag hides the surface, it revokes nothing.
    expect((await api('get', '/account', pair.access_token)).status).toBe(200);
  });
});
