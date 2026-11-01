import { CanActivate, ExecutionContext, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { CacheService } from '../../../common/cache/cache.service';
import type { AccountRole, AuthenticatedUser } from '../../../common/types';
import { logFireAndForget } from '../../../common/utils/fire-and-forget';
import { PrismaService } from '../../../database/prisma.service';
import { sha256Hex } from '../../oauth/oauth-crypto.util';
import { isPublicApiEnabled } from '../../oauth/oauth.config';
import { PUBLIC_SCOPES, type PublicScope } from '../../oauth/oauth-scopes';
import { REQUIRE_SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { TOKEN_ONLY_KEY } from '../decorators/token-only.decorator';
import { PublicApiError } from '../public-api-error';
import { PublicApiRateLimitService } from '../public-api-rate-limit.service';
import type { PublicApiRequest } from '../public-api.types';

const ACCESS_PREFIX = 'aba_at_';
const LAST_USED_THROTTLE_SEC = 300;
const GRANTING_ROLES: ReadonlySet<string> = new Set(['owner', 'editor']);

/**
 * The whole authorization of a `/public/v1` request, in a fixed order (spec section 4):
 * flag -> bearer -> access token by hash -> grant/client -> user -> grantor still owner/editor ->
 * encryption tier -> scopes -> rate limit -> throttled `lastUsedAt`.
 *
 * Everything is read from the database on EVERY request, never cached: a revoke, a block, a
 * demotion or a removal must take effect on the very next call — a concurrent revoke can leave a
 * freshly minted token row on a revoked grant, so the grant itself is the authority.
 *
 * Sets `req.user` / `req.accountId` / `req.accountRole` / `req.monthAnchorDay` in exactly the shape
 * `JwtStrategy` + `AccountContextGuard` produce, so the app's services and write guards work
 * unchanged, plus `req.oauth`. It deliberately does NOT stamp `LastActiveService`: an app calling
 * on the user's behalf is not the user being active.
 *
 * Never log the token (or its hash).
 */
@Injectable()
export class PublicApiAuthGuard implements CanActivate {
  private readonly logger = new Logger(PublicApiAuthGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly rateLimit: PublicApiRateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isPublicApiEnabled(this.config)) throw new NotFoundException();

    const http = context.switchToHttp();
    const req = http.getRequest<PublicApiRequest>();
    const res = http.getResponse<Response>();

    const token = readBearer(req.headers?.authorization);
    if (!token || !token.startsWith(ACCESS_PREFIX)) throw invalidToken(res);

    const row = await this.prisma.oAuthToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
      select: {
        kind: true,
        expiresAt: true,
        grant: {
          select: {
            id: true,
            userId: true,
            accountId: true,
            scopes: true,
            revokedAt: true,
            client: {
              select: { id: true, name: true, status: true, deletedAt: true, rateLimitPerGrant: true, rateLimitPerClient: true },
            },
            user: {
              select: { id: true, email: true, name: true, currencyCode: true, timezone: true, defaultAccountId: true, isActive: true },
            },
            account: { select: { encryptionTier: true, monthAnchorDay: true } },
          },
        },
      },
    });
    if (!row || row.kind !== 'access' || row.expiresAt.getTime() <= Date.now()) throw invalidToken(res);

    const { grant } = row;
    if (grant.revokedAt || grant.client.status !== 'active' || grant.client.deletedAt) throw invalidToken(res);
    if (!grant.user.isActive) throw invalidToken(res);

    // The grant works only while its grantor still is owner/editor of the account — re-read now.
    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId: grant.accountId, userId: grant.userId } },
      select: { role: true },
    });
    if (!membership || !GRANTING_ROLES.has(membership.role)) {
      throw new PublicApiError(
        403,
        'grant_inactive',
        'The user who connected this app no longer has write access to the account. Ask them to reconnect it.',
      );
    }

    const encryptionTier = grant.account.encryptionTier;
    if (encryptionTier >= 2) {
      throw new PublicApiError(403, 'account_encrypted', 'This account is end-to-end encrypted and cannot be used through the API.');
    }

    const grantScopes = grant.scopes.filter((s): s is PublicScope => (PUBLIC_SCOPES as readonly string[]).includes(s));
    // Deny by default (Ruling 13): a route must declare its scopes, or opt out with @TokenOnly().
    // A missing or empty @RequireScopes is a refusal, never "any valid token".
    const tokenOnly = this.reflector.getAllAndOverride<boolean>(TOKEN_ONLY_KEY, [context.getHandler(), context.getClass()]) === true;
    const required = this.reflector.getAllAndMerge<PublicScope[]>(REQUIRE_SCOPES_KEY, [context.getClass(), context.getHandler()]) ?? [];
    if (!tokenOnly && required.length === 0) {
      throw new PublicApiError(403, 'insufficient_scope', 'This request requires a scope the access token does not carry.');
    }
    if (required.some((s) => !grantScopes.includes(s))) {
      throw new PublicApiError(403, 'insufficient_scope', 'The access token does not carry the scope this request needs.', {
        required: [...new Set(required)],
      });
    }

    const limit = await this.rateLimit.check(grant.id, grant.client.id, {
      perGrant: grant.client.rateLimitPerGrant,
      perClient: grant.client.rateLimitPerClient,
    });
    res.setHeader('X-RateLimit-Limit', String(limit.limit));
    res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
    if (limit.retryAfterSec !== undefined) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      throw new PublicApiError(429, 'rate_limited', 'Too many requests. Retry after the number of seconds in Retry-After.');
    }

    const user: AuthenticatedUser = {
      id: grant.user.id,
      email: grant.user.email,
      name: grant.user.name,
      currencyCode: grant.user.currencyCode,
      timezone: grant.user.timezone,
      defaultAccountId: grant.user.defaultAccountId as string | undefined,
    };
    req.user = user;
    req.accountId = grant.accountId;
    req.accountRole = membership.role as AccountRole;
    req.monthAnchorDay = grant.account.monthAnchorDay ?? null;
    req.oauth = {
      clientDbId: grant.client.id,
      clientName: grant.client.name,
      grantId: grant.id,
      scopes: grantScopes,
      encryptionTier,
    };

    void this.stampLastUsed(grant.id).catch(logFireAndForget(this.logger, 'PublicApiAuthGuard.stampLastUsed'));
    return true;
  }

  /** At most one write per grant per 5 minutes; a Redis outage skips the stamp (setIfAbsent -> false). */
  private async stampLastUsed(grantId: string): Promise<void> {
    if (!(await this.cache.setIfAbsent(`oauth:lu:${grantId}`, LAST_USED_THROTTLE_SEC))) return;
    await this.prisma.oAuthGrant.updateMany({ where: { id: grantId }, data: { lastUsedAt: new Date() } });
  }
}

function readBearer(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null;
  const m = /^Bearer[ ]+([^\s]+)\s*$/i.exec(header);
  return m ? m[1] : null;
}

function invalidToken(res: Response): PublicApiError {
  res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
  return new PublicApiError(401, 'invalid_token', 'The access token is missing, invalid, expired or revoked.');
}
