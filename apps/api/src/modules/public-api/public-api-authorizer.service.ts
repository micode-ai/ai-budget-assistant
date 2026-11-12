import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../common/cache/cache.service';
import type { AccountRole, AuthenticatedUser } from '../../common/types';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { PrismaService } from '../../database/prisma.service';
import { sha256Hex } from '../oauth/oauth-crypto.util';
import { GRANTING_ROLES } from '../oauth/oauth-grant-accounts.util';
import { PUBLIC_SCOPES, type PublicScope } from '../oauth/oauth-scopes';
import { PublicApiError } from './public-api-error';
import { PublicApiRateLimitService } from './public-api-rate-limit.service';

const ACCESS_PREFIX = 'aba_at_';
const LAST_USED_THROTTLE_SEC = 300;
const INVALID_TOKEN_CHALLENGE = 'Bearer error="invalid_token"';

/** Header hints an authorization failure may carry (set on `PublicApiError`, or on any error after the rate limit). */
export type AuthorizerErrorHints = Pick<PublicApiError, 'wwwAuthenticate' | 'retryAfterSec' | 'rateLimit'>;

export interface AuthorizeOptions {
  /** Scopes the call needs; `[]` only together with `tokenOnly` (empty without it is a refusal). */
  requiredScopes: PublicScope[];
  tokenOnly: boolean;
  /** Skip the per-account checks: the call addresses the connection, not one account. */
  connectionLevel: boolean;
  /** The addressed account as sent; null = not sent (fine only while the connection holds one account). */
  accountId: string | null;
  /** The surface the token must be bound to: null = `/public/v1`, `MCP_RESOURCE_URL` = `/mcp`. */
  resource: string | null;
  /**
   * Count this call against the connection's rate limit (default true). Only the MCP endpoint's
   * connection-level pre-check passes false: every tool call it lets through authorizes again WITH
   * the count, so one tool call costs one unit. Without the count, `rateLimit` reads `{0, 0}`.
   */
  consumeRateLimit?: boolean;
}

export interface AuthorizedContext {
  user: AuthenticatedUser;
  oauth: {
    clientDbId: string;
    clientName: string;
    grantId: string;
    scopes: PublicScope[];
    grantAccountIds: string[];
    encryptionTier: number;
  };
  accountId?: string;
  accountRole?: AccountRole;
  monthAnchorDay?: number | null;
  rateLimit: { limit: number; remaining: number };
}

/**
 * The whole authorization of a third-party (OAuth bearer) call, in a fixed order, shared by the
 * `/public/v1` REST guard and the MCP tools. Per CONNECTION: bearer -> access token by hash ->
 * token bound to THIS surface (`resource`) -> grant/client -> user -> the grant still holds an
 * account -> scopes -> rate limit (one bucket per grant, whichever account is addressed). Then,
 * unless `connectionLevel`, per ADDRESSED account: account id (optional while the connection holds
 * one account) -> granted? -> grantor still owner/editor THERE -> its encryption tier. Last, the
 * throttled `lastUsedAt` stamp.
 *
 * The account rule counts GRANTED accounts, not usable ones: with two granted accounts an id is
 * required even when one of them is inactive.
 *
 * Everything is read from the database on EVERY call, never cached: a revoke, a block, a demotion
 * or a removal must take effect on the very next call — a concurrent revoke can leave a freshly
 * minted token row on a revoked grant, so the grant itself is the authority.
 *
 * Resource binding (RFC 8707): a token issued without `resource` works only for `/public/v1`, a
 * token issued for the MCP resource only for `/mcp`; anything else is `invalid_token`.
 *
 * Never touches `req`/`res`: refusals carry `wwwAuthenticate` / `retryAfterSec` / `rateLimit` for
 * the caller to write as headers. It deliberately does NOT stamp `LastActiveService`: an app
 * calling on the user's behalf is not the user being active.
 *
 * Never log the token (or its hash).
 */
@Injectable()
export class PublicApiAuthorizer {
  private readonly logger = new Logger(PublicApiAuthorizer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly rateLimit: PublicApiRateLimitService,
  ) {}

  async authorize(bearer: string | null, opts: AuthorizeOptions): Promise<AuthorizedContext> {
    if (!bearer || !bearer.startsWith(ACCESS_PREFIX)) throw invalidToken();

    const row = await this.prisma.oAuthToken.findUnique({
      where: { tokenHash: sha256Hex(bearer) },
      select: {
        kind: true,
        expiresAt: true,
        resource: true,
        grant: {
          select: {
            id: true,
            userId: true,
            scopes: true,
            revokedAt: true,
            client: {
              select: { id: true, name: true, status: true, deletedAt: true, rateLimitPerGrant: true, rateLimitPerClient: true },
            },
            user: {
              select: { id: true, email: true, name: true, currencyCode: true, timezone: true, defaultAccountId: true, isActive: true },
            },
            // Live granted accounts in connection order (as `loadGrantAccountStates` orders them).
            accounts: {
              where: { account: { isActive: true } },
              orderBy: [{ createdAt: 'asc' }, { accountId: 'asc' }],
              select: { accountId: true, account: { select: { encryptionTier: true, monthAnchorDay: true } } },
            },
          },
        },
      },
    });
    if (!row || row.kind !== 'access' || row.expiresAt.getTime() <= Date.now()) throw invalidToken();
    // A token is valid on exactly one surface. `?? null`: an absent column reads as "public API".
    if ((row.resource ?? null) !== opts.resource) throw invalidToken();

    const { grant } = row;
    if (grant.revokedAt || grant.client.status !== 'active' || grant.client.deletedAt) throw invalidToken();
    if (!grant.user.isActive) throw invalidToken();
    // Normally unreachable (removing the last account revokes the grant), but a grant left with no
    // live account must never resolve to anything.
    if (grant.accounts.length === 0) throw invalidToken();
    const grantAccountIds = grant.accounts.map((a) => a.accountId);

    const grantScopes = grant.scopes.filter((s): s is PublicScope => (PUBLIC_SCOPES as readonly string[]).includes(s));
    // Deny by default (Ruling 13): a call must declare its scopes, or opt out with tokenOnly.
    // An empty list is a refusal, never "any valid token".
    const required = opts.requiredScopes;
    if (!opts.tokenOnly && required.length === 0) {
      throw new PublicApiError(403, 'insufficient_scope', 'This request requires a scope the access token does not carry.');
    }
    if (required.some((s) => !grantScopes.includes(s))) {
      throw new PublicApiError(403, 'insufficient_scope', 'The access token does not carry the scope this request needs.', {
        required: [...new Set(required)],
      });
    }

    const limit =
      opts.consumeRateLimit === false
        ? { limit: 0, remaining: 0 }
        : await this.rateLimit.check(grant.id, grant.client.id, {
            perGrant: grant.client.rateLimitPerGrant,
            perClient: grant.client.rateLimitPerClient,
          });
    const rateLimit = { limit: limit.limit, remaining: limit.remaining };
    if ('retryAfterSec' in limit && limit.retryAfterSec !== undefined) {
      const err = new PublicApiError(429, 'rate_limited', 'Too many requests. Retry after the number of seconds in Retry-After.');
      err.rateLimit = rateLimit;
      err.retryAfterSec = limit.retryAfterSec;
      throw err;
    }

    const oauth = {
      clientDbId: grant.client.id,
      clientName: grant.client.name,
      grantId: grant.id,
      scopes: grantScopes,
      grantAccountIds,
    };
    const user: AuthenticatedUser = {
      id: grant.user.id,
      email: grant.user.email,
      name: grant.user.name,
      currencyCode: grant.user.currencyCode,
      timezone: grant.user.timezone,
      defaultAccountId: grant.user.defaultAccountId as string | undefined,
    };

    let context: AuthorizedContext;
    if (opts.connectionLevel) {
      context = { user, oauth: { ...oauth, encryptionTier: 0 }, rateLimit };
    } else {
      try {
        context = await this.authorizeAccount(grant, opts.accountId, user, oauth, rateLimit);
      } catch (err) {
        // Counted against the connection already: the refusal (or failure) still reports the figures,
        // exactly as the headers used to be written before these checks ran.
        if (err !== null && typeof err === 'object') (err as AuthorizerErrorHints).rateLimit = rateLimit;
        throw err;
      }
    }

    void this.stampLastUsed(grant.id).catch(logFireAndForget(this.logger, 'PublicApiAuthorizer.stampLastUsed'));
    return context;
  }

  private async authorizeAccount(
    grant: {
      userId: string;
      accounts: Array<{ accountId: string; account: { encryptionTier: number; monthAnchorDay: number | null } }>;
    },
    wanted: string | null,
    user: AuthenticatedUser,
    oauth: Omit<AuthorizedContext['oauth'], 'encryptionTier'>,
    rateLimit: AuthorizedContext['rateLimit'],
  ): Promise<AuthorizedContext> {
    const accountId = resolveAccountId(wanted ?? undefined, undefined, oauth.grantAccountIds);
    const granted = grant.accounts.find((a) => a.accountId === accountId)!;

    // The grant works for this account only while its grantor still is owner/editor THERE — re-read now.
    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId, userId: grant.userId } },
      select: { role: true },
    });
    if (!membership || !GRANTING_ROLES.has(membership.role)) {
      throw new PublicApiError(
        403,
        'grant_inactive',
        'The user who connected this app no longer has write access to the account. Ask them to reconnect it.',
      );
    }

    const encryptionTier = granted.account.encryptionTier;
    if (encryptionTier >= 2) {
      throw new PublicApiError(403, 'account_encrypted', 'This account is end-to-end encrypted and cannot be used through the API.');
    }

    return {
      user,
      oauth: { ...oauth, encryptionTier },
      accountId,
      accountRole: membership.role as AccountRole,
      monthAnchorDay: granted.account.monthAnchorDay ?? null,
      rateLimit,
    };
  }

  /** At most one write per grant per 5 minutes; a Redis outage skips the stamp (setIfAbsent -> false). */
  private async stampLastUsed(grantId: string): Promise<void> {
    if (!(await this.cache.setIfAbsent(`oauth:lu:${grantId}`, LAST_USED_THROTTLE_SEC))) return;
    await this.prisma.oAuthGrant.updateMany({ where: { id: grantId }, data: { lastUsedAt: new Date() } });
  }
}

/**
 * The addressed account of the connection. The id is compared trimmed and lower-cased; empty reads
 * as absent. Absent is fine only while the connection holds exactly one account. Sent twice (Node
 * joins repeated headers with ", ", `headersDistinct` keeps them apart) is a 400. An id outside the
 * connection — or one that exists nowhere — gets the same 403, so the answer reveals nothing.
 */
export function resolveAccountId(
  raw: string | string[] | undefined,
  distinct: string[] | undefined,
  grantAccountIds: readonly string[],
): string {
  if (Array.isArray(raw) || (distinct?.length ?? 0) > 1 || (typeof raw === 'string' && raw.includes(','))) {
    throw new PublicApiError(400, 'validation_failed', 'The request is invalid.', {
      fields: { 'X-Account-Id': ['X-Account-Id must be sent at most once, with a single account id'] },
    });
  }
  const wanted = (raw ?? '').trim().toLowerCase();
  if (wanted === '') {
    if (grantAccountIds.length === 1) return grantAccountIds[0];
    throw new PublicApiError(
      400,
      'account_required',
      'This connection covers several accounts. Send the X-Account-Id header with one of the ids from GET /public/v1/accounts.',
    );
  }
  const match = grantAccountIds.find((id) => id.toLowerCase() === wanted);
  if (!match) throw new PublicApiError(403, 'account_not_granted', 'This app is not connected to that account.');
  return match;
}

function invalidToken(): PublicApiError {
  const err = new PublicApiError(401, 'invalid_token', 'The access token is missing, invalid, expired or revoked.');
  err.wwwAuthenticate = INVALID_TOKEN_CHALLENGE;
  return err;
}
