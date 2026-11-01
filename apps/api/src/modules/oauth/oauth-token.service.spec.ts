import { HttpException } from '@nestjs/common';
import { createHash } from 'crypto';
import { OAuthTokenService } from './oauth-token.service';
import { OAuthGrantsService } from './oauth-grants.service';
import { sha256Hex } from './oauth-crypto.util';
import { oauthCodeKey, type OAuthCodePayload } from './oauth-code';

const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const REDIRECT = 'https://acc.example.com/cb';
const SECRET = 'aba_cs_confidential-secret';

interface Client {
  id: string;
  clientId: string;
  isConfidential: boolean;
  secretHash: string | null;
  status: 'active' | 'blocked';
}

const confidential: Client = {
  id: 'cdb1',
  clientId: 'aba_ci_conf',
  isConfidential: true,
  secretHash: sha256Hex(SECRET),
  status: 'active',
};
const publicClient: Client = {
  id: 'cdb2',
  clientId: 'aba_ci_pub',
  isConfidential: false,
  secretHash: null,
  status: 'active',
};

function basic(id: string, secret: string): string {
  return `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString('base64')}`;
}

/** In-memory Prisma + Redis fakes; the REAL OAuthGrantsService runs on top so revoke deletes tokens. */
function build() {
  const clients: Client[] = [{ ...confidential }, { ...publicClient }];
  const grants: any[] = [
    { id: 'g1', clientId: 'cdb1', userId: 'u1', accountId: 'acc1', scopes: ['expenses:read', 'categories:read'], revokedAt: null, revokedBy: null },
    { id: 'g2', clientId: 'cdb2', userId: 'u1', accountId: 'acc1', scopes: ['expenses:read'], revokedAt: null, revokedBy: null },
  ];
  const members = [{ userId: 'u1', accountId: 'acc1', role: 'owner' }];
  let tokens: any[] = [];
  let seq = 0;
  const redis = new Map<string, string>();
  const counters = new Map<string, number>();

  const matchToken = (t: any, where: any) =>
    Object.entries(where).every(([k, v]) => (v === null ? t[k] == null : t[k] === v));

  const prisma: any = {
    oAuthToken: {
      findUnique: jest.fn(async ({ where, include }: any) => {
        const t = tokens.find((x) => x.tokenHash === where.tokenHash);
        if (!t) return null;
        return include?.grant ? { ...t, grant: { ...grants.find((g) => g.id === t.grantId) } } : { ...t };
      }),
      createMany: jest.fn(async ({ data }: any) => {
        for (const d of data) tokens.push({ id: `t${++seq}`, rotatedAt: null, createdAt: new Date(), ...d });
        return { count: data.length };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = tokens.filter((t) => matchToken(t, where));
        for (const t of hit) Object.assign(t, data);
        return { count: hit.length };
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = tokens.length;
        tokens = tokens.filter((t) => t.grantId !== where.grantId);
        return { count: before - tokens.length };
      }),
    },
    oAuthGrant: {
      findUnique: jest.fn(async ({ where }: any) => {
        const g = grants.find((x) => x.id === where.id);
        return g ? { ...g } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = grants.filter((g) => g.id === where.id && (where.revokedAt !== null || g.revokedAt === null));
        for (const g of hit) Object.assign(g, data);
        return { count: hit.length };
      }),
    },
    accountMember: {
      findFirst: jest.fn(async ({ where }: any) => {
        const m = members.find(
          (x) => x.userId === where.userId && x.accountId === where.accountId && where.role.in.includes(x.role),
        );
        return m ? { ...m } : null;
      }),
    },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };

  const cache: any = {
    takeOnce: jest.fn(async (key: string) => {
      const raw = redis.get(key);
      redis.delete(key);
      return raw ? JSON.parse(raw) : null;
    }),
    incrementWindow: jest.fn(async (key: string) => {
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      return n;
    }),
  };

  const clientsSvc: any = {
    findActiveByClientId: jest.fn(async (id: string) => {
      const c = clients.find((x) => x.clientId === id);
      return c ? { ...c } : null;
    }),
    verifySecret: jest.fn(
      (c: Client, s: string) => !!c.secretHash && typeof s === 'string' && s.length > 0 && sha256Hex(s) === c.secretHash,
    ),
  };

  const grantsSvc = new OAuthGrantsService(prisma);
  const svc = new OAuthTokenService(prisma, cache, clientsSvc, grantsSvc);

  let codeSeq = 0;
  const putCode = (over: Partial<OAuthCodePayload> = {}, client: Client = confidential): string => {
    const code = `aba_ac_code${++codeSeq}`;
    const payload: OAuthCodePayload = {
      grantId: client === confidential ? 'g1' : 'g2',
      clientDbId: client.id,
      redirectUri: REDIRECT,
      codeChallenge: CHALLENGE,
      scopes: ['expenses:read'],
      ...over,
    };
    redis.set(oauthCodeKey(sha256Hex(code)), JSON.stringify(payload));
    return code;
  };

  return { svc, prisma, cache, clients, grants, members, getTokens: () => tokens, putCode };
}

const exchangeBody = (code: string, over: Record<string, unknown> = {}) => ({
  grant_type: 'authorization_code',
  code,
  redirect_uri: REDIRECT,
  code_verifier: VERIFIER,
  client_id: confidential.clientId,
  client_secret: SECRET,
  ...over,
});

async function oauthErr(p: Promise<unknown>): Promise<{ status: number; body: any }> {
  try {
    await p;
  } catch (e) {
    if (e instanceof HttpException) return { status: e.getStatus(), body: e.getResponse() };
    throw e;
  }
  throw new Error('expected an OAuth error');
}

describe('OAuthTokenService', () => {
  describe('authorization_code', () => {
    it('exchanges a code for a pair and reports the GRANT scopes and account', async () => {
      const t = build();
      const code = t.putCode({ scopes: ['expenses:read'] }); // grant has two scopes (re-consent case)
      const res = await t.svc.token(exchangeBody(code), undefined);

      expect(res).toEqual({
        access_token: expect.stringMatching(/^aba_at_/),
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: expect.stringMatching(/^aba_rt_/),
        scope: 'expenses:read categories:read',
        account_id: 'acc1',
      });
      const stored = t.getTokens();
      expect(stored).toHaveLength(2);
      // only hashes are stored
      expect(stored.map((s) => s.tokenHash).sort()).toEqual([sha256Hex(res.access_token), sha256Hex(res.refresh_token)].sort());
      const access = stored.find((s) => s.kind === 'access');
      const refresh = stored.find((s) => s.kind === 'refresh');
      expect(access.expiresAt.getTime() - Date.now()).toBeGreaterThan(3590_000);
      expect(access.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(3600_000);
      expect(refresh.expiresAt.getTime() - Date.now()).toBeGreaterThan(89 * 86400_000);
    });

    it('accepts HTTP Basic client authentication, also with a redundant matching body client_secret', async () => {
      const t = build();
      const code = t.putCode();
      const { client_secret: _s, client_id: _c, ...rest } = exchangeBody(code);
      await expect(t.svc.token(rest, basic(confidential.clientId, SECRET))).resolves.toHaveProperty('access_token');

      const code2 = t.putCode();
      await expect(t.svc.token(exchangeBody(code2), basic(confidential.clientId, SECRET))).resolves.toHaveProperty('access_token');
    });

    it('a replayed code is invalid_grant', async () => {
      const t = build();
      const code = t.putCode();
      await t.svc.token(exchangeBody(code), undefined);
      const e = await oauthErr(t.svc.token(exchangeBody(code), undefined));
      expect(e).toEqual({ status: 400, body: { error: 'invalid_grant', error_description: expect.any(String) } });
    });

    it('a wrong verifier is invalid_grant', async () => {
      const t = build();
      const code = t.putCode();
      const e = await oauthErr(t.svc.token(exchangeBody(code, { code_verifier: 'x'.repeat(43) }), undefined));
      expect(e.body.error).toBe('invalid_grant');
      expect(t.getTokens()).toHaveLength(0);
    });

    it('a different redirect_uri is invalid_grant', async () => {
      const t = build();
      const code = t.putCode();
      const e = await oauthErr(t.svc.token(exchangeBody(code, { redirect_uri: `${REDIRECT}/` }), undefined));
      expect(e.body.error).toBe('invalid_grant');
    });

    it("another client's code is invalid_grant", async () => {
      const t = build();
      const code = t.putCode({}, publicClient);
      const e = await oauthErr(t.svc.token(exchangeBody(code), undefined));
      expect(e.body.error).toBe('invalid_grant');
    });

    it('a revoked grant is invalid_grant', async () => {
      const t = build();
      t.grants[0].revokedAt = new Date();
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode()), undefined));
      expect(e.body.error).toBe('invalid_grant');
    });

    it('a grantor who is no longer owner/editor gets invalid_grant', async () => {
      const t = build();
      t.members[0].role = 'viewer';
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode()), undefined));
      expect(e.body.error).toBe('invalid_grant');
    });

    it('a Redis outage while taking the code is 503 temporarily_unavailable', async () => {
      const t = build();
      t.cache.takeOnce.mockRejectedValueOnce(new Error('connection lost'));
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode()), undefined));
      expect(e).toEqual({ status: 503, body: { error: 'temporarily_unavailable', error_description: expect.any(String) } });
      expect(t.getTokens()).toHaveLength(0);
    });

    it('missing code_verifier is invalid_request', async () => {
      const t = build();
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode(), { code_verifier: undefined }), undefined));
      expect(e).toEqual({ status: 400, body: { error: 'invalid_request', error_description: expect.any(String) } });
    });

    it('a public client exchanges with PKCE only', async () => {
      const t = build();
      const code = t.putCode({}, publicClient);
      const res = await t.svc.token(exchangeBody(code, { client_id: publicClient.clientId, client_secret: undefined }), undefined);
      expect(res.scope).toBe('expenses:read');
    });
  });

  describe('client authentication', () => {
    it('a confidential client without a secret is 401 invalid_client', async () => {
      const t = build();
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode(), { client_secret: undefined }), undefined));
      expect(e).toEqual({ status: 401, body: { error: 'invalid_client', error_description: expect.any(String) } });
    });

    it('a wrong secret is 401 invalid_client', async () => {
      const t = build();
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode(), { client_secret: 'nope' }), undefined));
      expect(e.status).toBe(401);
      expect(e.body.error).toBe('invalid_client');
    });

    it('a blocked client is 401 invalid_client', async () => {
      const t = build();
      t.clients[0].status = 'blocked';
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode()), undefined));
      expect(e.status).toBe(401);
      expect(e.body.error).toBe('invalid_client');
    });

    it('an unknown client is 401 invalid_client', async () => {
      const t = build();
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode(), { client_id: 'aba_ci_nobody' }), undefined));
      expect(e.status).toBe(401);
    });

    it('a public client sending a secret is 401 invalid_client', async () => {
      const t = build();
      const code = t.putCode({}, publicClient);
      const e = await oauthErr(
        t.svc.token(exchangeBody(code, { client_id: publicClient.clientId, client_secret: 'anything' }), undefined),
      );
      expect(e.status).toBe(401);
      expect(e.body.error).toBe('invalid_client');
    });

    it('a body client_id that contradicts Basic auth is invalid_request', async () => {
      const t = build();
      const e = await oauthErr(
        t.svc.token(exchangeBody(t.putCode(), { client_id: publicClient.clientId, client_secret: undefined }), basic(confidential.clientId, SECRET)),
      );
      expect(e.status).toBe(400);
      expect(e.body.error).toBe('invalid_request');
    });

    it('no client_id at all is 401 invalid_client', async () => {
      const t = build();
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode(), { client_id: undefined }), undefined));
      expect(e.status).toBe(401);
    });

    it('a non-string (repeated) param is invalid_request, not a crash', async () => {
      const t = build();
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode(), { code: ['a', 'b'] }), undefined));
      expect(e.body.error).toBe('invalid_request');
    });
  });

  describe('grant_type', () => {
    it('missing grant_type is invalid_request', async () => {
      const t = build();
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode(), { grant_type: undefined }), undefined));
      expect(e.body.error).toBe('invalid_request');
    });

    it('an unknown grant_type is unsupported_grant_type', async () => {
      const t = build();
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode(), { grant_type: 'password' }), undefined));
      expect(e).toEqual({ status: 400, body: { error: 'unsupported_grant_type', error_description: expect.any(String) } });
    });
  });

  describe('refresh_token', () => {
    async function connected() {
      const t = build();
      const first = await t.svc.token(exchangeBody(t.putCode()), undefined);
      const refresh = (rt: string, over: Record<string, unknown> = {}) =>
        t.svc.token(
          { grant_type: 'refresh_token', refresh_token: rt, client_id: confidential.clientId, client_secret: SECRET, ...over },
          undefined,
        );
      return { t, first, refresh };
    }

    it('rotates: the old refresh is stamped rotatedAt and the new pair differs', async () => {
      const { t, first, refresh } = await connected();
      const second = await refresh(first.refresh_token);

      expect(second.access_token).not.toBe(first.access_token);
      expect(second.refresh_token).not.toBe(first.refresh_token);
      expect(second.scope).toBe('expenses:read categories:read');
      expect(second.account_id).toBe('acc1');
      const old = t.getTokens().find((x) => x.tokenHash === sha256Hex(first.refresh_token));
      expect(old.rotatedAt).toBeInstanceOf(Date);
      const fresh = t.getTokens().find((x) => x.tokenHash === sha256Hex(second.refresh_token));
      expect(fresh.rotatedAt).toBeNull();
      expect(fresh.expiresAt.getTime() - Date.now()).toBeGreaterThan(89 * 86400_000);
    });

    it('reusing a rotated refresh token revokes the grant and kills the NEW access token too', async () => {
      const { t, first, refresh } = await connected();
      const second = await refresh(first.refresh_token);

      const e = await oauthErr(refresh(first.refresh_token));
      expect(e.body.error).toBe('invalid_grant');
      expect(t.grants[0].revokedAt).toBeInstanceOf(Date);
      expect(t.grants[0].revokedBy).toBe('reuse_detected');
      expect(t.getTokens().find((x) => x.tokenHash === sha256Hex(second.access_token))).toBeUndefined();
      expect(t.getTokens()).toHaveLength(0);
      // and the newest refresh token no longer works either
      expect((await oauthErr(refresh(second.refresh_token))).body.error).toBe('invalid_grant');
    });

    it('two concurrent refreshes with the same token cannot both succeed', async () => {
      const { t, first, refresh } = await connected();
      // Simulate the race: both requests read rotatedAt = null before either writes.
      const origFind = t.prisma.oAuthToken.findUnique.getMockImplementation();
      const snapshot = await origFind({ where: { tokenHash: sha256Hex(first.refresh_token) }, include: { grant: true } });
      t.prisma.oAuthToken.findUnique.mockImplementation(async () => ({ ...snapshot, grant: { ...snapshot.grant } }));

      const results = await Promise.allSettled([refresh(first.refresh_token), refresh(first.refresh_token)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect((rejected.reason as HttpException).getResponse()).toMatchObject({ error: 'invalid_grant' });
    });

    it('an unknown refresh token is invalid_grant', async () => {
      const { refresh } = await connected();
      expect((await oauthErr(refresh('aba_rt_nope'))).body.error).toBe('invalid_grant');
    });

    it('an access token presented as a refresh token is invalid_grant', async () => {
      const { first, refresh } = await connected();
      expect((await oauthErr(refresh(first.access_token))).body.error).toBe('invalid_grant');
    });

    it('an expired refresh token is invalid_grant', async () => {
      const { t, first, refresh } = await connected();
      t.getTokens().find((x) => x.kind === 'refresh').expiresAt = new Date(Date.now() - 1000);
      expect((await oauthErr(refresh(first.refresh_token))).body.error).toBe('invalid_grant');
      expect(t.grants[0].revokedAt).toBeNull();
    });

    it("another client's refresh token is invalid_grant and revokes nothing", async () => {
      const { t, first } = await connected();
      const e = await oauthErr(
        t.svc.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: publicClient.clientId }, undefined),
      );
      expect(e.body.error).toBe('invalid_grant');
      expect(t.grants[0].revokedAt).toBeNull();
    });

    it('a scope outside the grant is invalid_scope; a subset is accepted but reports the grant scopes', async () => {
      const { first, refresh } = await connected();
      const e = await oauthErr(refresh(first.refresh_token, { scope: 'expenses:write' }));
      expect(e).toEqual({ status: 400, body: { error: 'invalid_scope', error_description: expect.any(String) } });

      const ok = await refresh(first.refresh_token, { scope: 'expenses:read' });
      expect(ok.scope).toBe('expenses:read categories:read');
    });

    it('an unknown scope is invalid_scope', async () => {
      const { first, refresh } = await connected();
      expect((await oauthErr(refresh(first.refresh_token, { scope: 'admin' }))).body.error).toBe('invalid_scope');
    });
  });

  describe('rate limit', () => {
    it('the 31st token call in a minute for one client is 429 slow_down', async () => {
      const t = build();
      for (let i = 0; i < 30; i++) {
        await t.svc.token(exchangeBody(t.putCode()), undefined);
      }
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode()), undefined));
      expect(e).toEqual({ status: 429, body: { error: 'slow_down', error_description: expect.any(String) } });
      expect(t.cache.incrementWindow).toHaveBeenLastCalledWith(`oauth:tok:${confidential.clientId}`, 60000);
    });

    it('junk refresh requests with a public client_id do not count, so they cannot block a valid exchange (H1)', async () => {
      const t = build();
      for (let i = 0; i < 31; i++) {
        const e = await oauthErr(
          t.svc.token({ grant_type: 'refresh_token', refresh_token: `aba_rt_junk${i}`, client_id: publicClient.clientId }, undefined),
        );
        expect(e.body.error).toBe('invalid_grant');
      }
      // junk codes (not found / burnt) do not count either
      for (let i = 0; i < 31; i++) {
        const e = await oauthErr(
          t.svc.token(exchangeBody(`aba_ac_junk${i}`, { client_id: publicClient.clientId, client_secret: undefined }), undefined),
        );
        expect(e.body.error).toBe('invalid_grant');
      }
      expect(t.cache.incrementWindow).not.toHaveBeenCalled();

      const ok = await t.svc.token(
        exchangeBody(t.putCode({}, publicClient), { client_id: publicClient.clientId, client_secret: undefined }),
        undefined,
      );
      expect(ok.access_token).toMatch(/^aba_at_/);
      expect(t.cache.incrementWindow).toHaveBeenCalledWith(`oauth:tok:${publicClient.clientId}`, 60000);
    });

    it('a public client is still limited on requests that present a valid credential', async () => {
      const t = build();
      const pub = { client_id: publicClient.clientId, client_secret: undefined };
      for (let i = 0; i < 30; i++) await t.svc.token(exchangeBody(t.putCode({}, publicClient), pub), undefined);
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode({}, publicClient), pub), undefined));
      expect(e.status).toBe(429);
      expect(e.body.error).toBe('slow_down');
    });

    it('a public client presenting a valid refresh token is counted', async () => {
      const t = build();
      const pub = { client_id: publicClient.clientId, client_secret: undefined };
      const first = await t.svc.token(exchangeBody(t.putCode({}, publicClient), pub), undefined);
      t.cache.incrementWindow.mockClear();
      await t.svc.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: publicClient.clientId }, undefined);
      expect(t.cache.incrementWindow).toHaveBeenCalledTimes(1);
    });

    it('a confidential client is counted after the secret check, before the credential is examined', async () => {
      const t = build();
      await oauthErr(
        t.svc.token({ grant_type: 'refresh_token', refresh_token: 'aba_rt_junk', client_id: confidential.clientId, client_secret: SECRET }, undefined),
      );
      expect(t.cache.incrementWindow).toHaveBeenCalledWith(`oauth:tok:${confidential.clientId}`, 60000);
      t.cache.incrementWindow.mockClear();
      await oauthErr(
        t.svc.token({ grant_type: 'refresh_token', refresh_token: 'aba_rt_junk', client_id: confidential.clientId, client_secret: 'wrong' }, undefined),
      );
      expect(t.cache.incrementWindow).not.toHaveBeenCalled();
    });

    it('a Redis outage on the counter fails closed with 503', async () => {
      const t = build();
      t.cache.incrementWindow.mockRejectedValueOnce(new Error('connection lost'));
      const e = await oauthErr(t.svc.token(exchangeBody(t.putCode()), undefined));
      expect(e.status).toBe(503);
      expect(e.body.error).toBe('temporarily_unavailable');
    });
  });

  describe('issuePair', () => {
    it('stores one access and one refresh row by hash for the grant', async () => {
      const t = build();
      const pair = await t.svc.issuePair('g1');
      expect(pair.accessToken).toMatch(/^aba_at_/);
      expect(pair.refreshToken).toMatch(/^aba_rt_/);
      expect(t.getTokens().map((x) => [x.grantId, x.kind])).toEqual([
        ['g1', 'access'],
        ['g1', 'refresh'],
      ]);
    });
  });

  describe('revoke', () => {
    it("revokes this client's grant (by access or refresh token) with revokedBy client", async () => {
      const t = build();
      const pair = await t.svc.token(exchangeBody(t.putCode()), undefined);
      await expect(
        t.svc.revoke({ token: pair.access_token, client_id: confidential.clientId, client_secret: SECRET }, undefined),
      ).resolves.toEqual({});
      expect(t.grants[0].revokedBy).toBe('client');
      expect(t.getTokens()).toHaveLength(0);
    });

    it("another client's token: 200 {} but nothing revoked", async () => {
      const t = build();
      const pair = await t.svc.token(exchangeBody(t.putCode()), undefined);
      await expect(
        t.svc.revoke({ token: pair.refresh_token, token_type_hint: 'refresh_token', client_id: publicClient.clientId }, undefined),
      ).resolves.toEqual({});
      expect(t.grants[0].revokedAt).toBeNull();
      expect(t.getTokens()).toHaveLength(2);
    });

    it('an unknown token is still 200 {}', async () => {
      const t = build();
      await expect(
        t.svc.revoke({ token: 'aba_at_unknown' }, basic(confidential.clientId, SECRET)),
      ).resolves.toEqual({});
    });

    it('requires client authentication and a token', async () => {
      const t = build();
      expect((await oauthErr(t.svc.revoke({ token: 'x', client_id: confidential.clientId }, undefined))).status).toBe(401);
      expect(
        (await oauthErr(t.svc.revoke({ client_id: confidential.clientId, client_secret: SECRET }, undefined))).body.error,
      ).toBe('invalid_request');
    });
  });
});
