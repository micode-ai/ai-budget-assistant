import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { OAuthClient, OAuthGrant, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { OAuthClientsService } from './oauth-clients.service';
import { OAuthGrantsService } from './oauth-grants.service';
import { generateToken, sha256Hex, verifyPkceS256 } from './oauth-crypto.util';
import { oauthCodeKey, type OAuthCodePayload } from './oauth-code';
import { InvalidScopeError, parseScopeParam } from './oauth-scopes';

export const ACCESS_TOKEN_TTL_SEC = 3600;
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const TOKEN_RATE_LIMIT_PER_MIN = 30;
const TOKEN_RATE_WINDOW_MS = 60_000;

/** RFC 6749 error codes of `/oauth/token` and `/oauth/revoke` (also the published OpenAPI enum). */
export const OAUTH_TOKEN_ERROR_CODES = [
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unsupported_grant_type',
  'invalid_scope',
  'slow_down',
  'temporarily_unavailable',
] as const;
export type OAuthTokenErrorCode = (typeof OAUTH_TOKEN_ERROR_CODES)[number];

/** RFC 6749 §5.2 error: body `{error, error_description}`. Descriptions never contain a token/secret. */
export class OAuthTokenError extends HttpException {
  constructor(
    readonly code: OAuthTokenErrorCode,
    description: string,
    status: number = HttpStatus.BAD_REQUEST,
  ) {
    super({ error: code, error_description: description }, status);
  }
}

const err = {
  request: (d: string) => new OAuthTokenError('invalid_request', d),
  client: (d: string) => new OAuthTokenError('invalid_client', d, HttpStatus.UNAUTHORIZED),
  grant: (d: string) => new OAuthTokenError('invalid_grant', d),
  unavailable: () => new OAuthTokenError('temporarily_unavailable', 'please try again', HttpStatus.SERVICE_UNAVAILABLE),
};

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
  account_id: string;
}

/** Form or JSON body, as parsed by express. Values may be strings, arrays (repeated keys) or objects. */
export type OAuthBody = Record<string, unknown>;

/** A param that is absent or empty reads as undefined; anything but a single string is invalid_request. */
function param(body: OAuthBody, name: string): string | undefined {
  const v = body?.[name];
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw err.request(`${name} must be a single string`);
  return v;
}

function required(body: OAuthBody, name: string): string {
  const v = param(body, name);
  if (v === undefined) throw err.request(`${name} is required`);
  return v;
}

/** RFC 6749 §2.3.1: each half of the Basic credentials is form-urlencoded before base64. */
function formDecode(s: string): string {
  return decodeURIComponent(s.replace(/\+/g, ' '));
}

function parseBasic(header: string | undefined): { id: string; secret: string } | null {
  if (!header) return null;
  const m = /^Basic\s+(\S+)\s*$/i.exec(header);
  if (!m) return null;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 0) throw err.client('malformed Basic credentials');
  try {
    return { id: formDecode(decoded.slice(0, colon)), secret: formDecode(decoded.slice(colon + 1)) };
  } catch {
    throw err.client('malformed Basic credentials');
  }
}

/**
 * The third-party-facing half of the OAuth server: `POST /oauth/token` (code exchange with PKCE,
 * refresh rotation with reuse detection) and `POST /oauth/revoke` (RFC 7009).
 *
 * The grant is authoritative for scopes (Ruling 10): every token response reports `grant.scopes`.
 * Nothing here ever logs a token, code, verifier or secret.
 */
@Injectable()
export class OAuthTokenService {
  private readonly logger = new Logger(OAuthTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly clients: OAuthClientsService,
    private readonly grants: OAuthGrantsService,
  ) {}

  async token(body: OAuthBody, authorization: string | undefined): Promise<TokenResponse> {
    const client = await this.authenticateClient(body, authorization);
    // A confidential client is counted once its secret checked out. A public client has no secret,
    // so anyone who knows its (public) client_id could burn its budget with junk requests and lock
    // the real app out (H1): it is counted only once it presents a credential bound to it - see
    // exchangeCode / refresh.
    if (client.isConfidential) await this.rateLimit(client);

    const grantType = param(body, 'grant_type');
    if (!grantType) throw err.request('grant_type is required');
    if (grantType === 'authorization_code') return this.exchangeCode(client, body);
    if (grantType === 'refresh_token') return this.refresh(client, body);
    throw new OAuthTokenError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
  }

  /** RFC 7009: always `{}` once the client is authenticated, whether or not the token was found. */
  async revoke(body: OAuthBody, authorization: string | undefined): Promise<Record<string, never>> {
    const client = await this.authenticateClient(body, authorization);
    const token = required(body, 'token');
    param(body, 'token_type_hint'); // accepted and ignored: both kinds are looked up by hash
    const row = await this.prisma.oAuthToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { grant: { select: { clientId: true } } },
    });
    // Another client's token is silently ignored — revealing it exists would be an oracle.
    if (row && row.grant.clientId === client.id) await this.grants.revoke(row.grantId, 'client');
    return {};
  }

  /** Creates one access (1 h) and one refresh (90 d) token for the grant; only hashes are stored. */
  issuePair(grantId: string): Promise<{ accessToken: string; refreshToken: string }> {
    return this.issuePairWith(this.prisma, grantId);
  }

  private async issuePairWith(
    db: Prisma.TransactionClient | PrismaService,
    grantId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = generateToken('aba_at_');
    const refreshToken = generateToken('aba_rt_');
    const now = Date.now();
    await db.oAuthToken.createMany({
      data: [
        { grantId, kind: 'access', tokenHash: sha256Hex(accessToken), expiresAt: new Date(now + ACCESS_TOKEN_TTL_SEC * 1000) },
        { grantId, kind: 'refresh', tokenHash: sha256Hex(refreshToken), expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS) },
      ],
    });
    return { accessToken, refreshToken };
  }

  private async exchangeCode(client: OAuthClient, body: OAuthBody): Promise<TokenResponse> {
    const code = required(body, 'code');
    const redirectUri = required(body, 'redirect_uri');
    const verifier = required(body, 'code_verifier');

    let payload: OAuthCodePayload | null;
    try {
      payload = await this.cache.takeOnce<OAuthCodePayload>(oauthCodeKey(sha256Hex(code)));
    } catch (e) {
      // Fail closed: a code we cannot read is not a code we can honour.
      this.logger.warn(`authorization code read failed: ${(e as Error).message}`);
      throw err.unavailable();
    }
    // The code is consumed by now whatever happens next: a failed attempt burns it.
    if (!payload) throw err.grant('authorization code is invalid, expired or already used');
    if (payload.clientDbId !== client.id) throw err.grant('authorization code was issued to another client');
    if (!client.isConfidential) await this.rateLimit(client);
    if (payload.redirectUri !== redirectUri) throw err.grant('redirect_uri does not match the authorization request');
    if (!verifyPkceS256(verifier, payload.codeChallenge)) throw err.grant('code_verifier does not match');

    const grant = await this.prisma.oAuthGrant.findUnique({ where: { id: payload.grantId } });
    await this.assertGrantUsable(grant, client);

    const pair = await this.issuePair(grant!.id);
    return this.response(grant!, pair);
  }

  private async refresh(client: OAuthClient, body: OAuthBody): Promise<TokenResponse> {
    const presented = required(body, 'refresh_token');
    const scopeParam = param(body, 'scope');

    const row = await this.prisma.oAuthToken.findUnique({
      where: { tokenHash: sha256Hex(presented) },
      include: { grant: true },
    });
    if (!row || row.kind !== 'refresh') throw err.grant('refresh token is invalid');
    // A token of another client: refuse without touching the owner's grant.
    if (row.grant.clientId !== client.id) throw err.grant('refresh token is invalid');
    if (!client.isConfidential) await this.rateLimit(client);

    if (row.rotatedAt) {
      await this.reuseDetected(row.grantId);
      throw err.grant('refresh token is invalid');
    }
    if (row.expiresAt.getTime() <= Date.now()) throw err.grant('refresh token has expired');

    await this.assertGrantUsable(row.grant, client);

    if (scopeParam !== undefined) {
      let requested: string[];
      try {
        requested = parseScopeParam(scopeParam);
      } catch (e) {
        if (e instanceof InvalidScopeError) throw new OAuthTokenError('invalid_scope', e.message);
        throw e;
      }
      const outside = requested.filter((s) => !row.grant.scopes.includes(s));
      if (outside.length > 0) throw new OAuthTokenError('invalid_scope', `scope exceeds the grant: ${outside.join(' ')}`);
      // v1 has no per-token scopes: a subset is accepted, the response still reports the grant's scopes.
    }

    // Race-safe rotation: only the request whose conditional update hits the row may issue.
    const pair = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.oAuthToken.updateMany({
        where: { id: row.id, rotatedAt: null },
        data: { rotatedAt: new Date() },
      });
      if (count !== 1) return null;
      return this.issuePairWith(tx, row.grantId);
    });
    if (!pair) {
      // Lost the race to a concurrent refresh with the same token — that is a second use of it.
      await this.reuseDetected(row.grantId);
      throw err.grant('refresh token is invalid');
    }
    return this.response(row.grant, pair);
  }

  private async reuseDetected(grantId: string): Promise<void> {
    this.logger.warn(`refresh token reuse detected; revoking grant ${grantId}`);
    await this.grants.revoke(grantId, 'reuse_detected');
  }

  /** Grant exists, belongs to this client, is not revoked, and its grantor is still owner/editor. */
  private async assertGrantUsable(grant: OAuthGrant | null, client: OAuthClient): Promise<void> {
    if (!grant || grant.clientId !== client.id || grant.revokedAt) throw err.grant('grant is not active');
    const member = await this.prisma.accountMember.findFirst({
      where: { userId: grant.userId, accountId: grant.accountId, role: { in: ['owner', 'editor'] } },
      select: { userId: true },
    });
    if (!member) throw err.grant('grant is no longer valid for this account');
  }

  private response(grant: OAuthGrant, pair: { accessToken: string; refreshToken: string }): TokenResponse {
    return {
      access_token: pair.accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SEC,
      refresh_token: pair.refreshToken,
      scope: grant.scopes.join(' '),
      account_id: grant.accountId,
    };
  }

  /**
   * Client authentication: HTTP Basic or `client_id`/`client_secret` in the body (RFC 6749 §2.3.1).
   * A body field repeating the Basic value is tolerated (some libraries send both); a contradicting
   * one is invalid_request. Confidential clients must present their secret; public clients must not.
   */
  private async authenticateClient(body: OAuthBody, authorization: string | undefined): Promise<OAuthClient> {
    const basicCreds = parseBasic(authorization);
    const bodyId = param(body, 'client_id');
    const bodySecret = param(body, 'client_secret');

    let clientId: string | undefined;
    let secret: string | undefined;
    if (basicCreds) {
      if (bodyId !== undefined && bodyId !== basicCreds.id) throw err.request('client_id contradicts the Authorization header');
      if (bodySecret !== undefined && bodySecret !== basicCreds.secret) {
        throw err.request('client_secret contradicts the Authorization header');
      }
      clientId = basicCreds.id;
      secret = basicCreds.secret === '' ? undefined : basicCreds.secret;
    } else {
      clientId = bodyId;
      secret = bodySecret;
    }

    if (!clientId) throw err.client('client authentication is required');
    const client = await this.clients.findActiveByClientId(clientId);
    if (!client || client.status !== 'active') throw err.client('unknown or blocked client');

    if (client.isConfidential) {
      if (!secret || !this.clients.verifySecret(client, secret)) throw err.client('client authentication failed');
    } else if (secret !== undefined) {
      throw err.client('a public client must not send a client secret');
    }
    return client;
  }

  private async rateLimit(client: OAuthClient): Promise<void> {
    let hits: number;
    try {
      hits = await this.cache.incrementWindow(`oauth:tok:${client.clientId}`, TOKEN_RATE_WINDOW_MS);
    } catch (e) {
      this.logger.warn(`token rate-limit counter failed: ${(e as Error).message}`);
      throw err.unavailable();
    }
    if (hits > TOKEN_RATE_LIMIT_PER_MIN) {
      throw new OAuthTokenError('slow_down', 'too many token requests, retry later', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
