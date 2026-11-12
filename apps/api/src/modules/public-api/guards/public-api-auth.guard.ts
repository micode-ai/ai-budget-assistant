import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { CacheService } from '../../../common/cache/cache.service';
import { PrismaService } from '../../../database/prisma.service';
import { isPublicApiEnabled } from '../../oauth/oauth.config';
import type { PublicScope } from '../../oauth/oauth-scopes';
import { ACCOUNT_HEADER, CONNECTION_LEVEL_KEY } from '../decorators/connection-level.decorator';
import { REQUIRE_SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { TOKEN_ONLY_KEY } from '../decorators/token-only.decorator';
import { PublicApiAuthorizer, type AuthorizerErrorHints } from '../public-api-authorizer.service';
import { PublicApiRateLimitService } from '../public-api-rate-limit.service';
import type { PublicApiRequest } from '../public-api.types';

/**
 * Stands in for an `X-Account-Id` sent more than once: it contains a comma, which
 * `resolveAccountId` refuses with the "sent at most once" 400 — at the same point in the check
 * order as before (after the rate limit), never earlier.
 */
const REPEATED_ACCOUNT_HEADER = ',';

/**
 * The HTTP adapter of a `/public/v1` request: flag -> the route's `@TokenOnly` / `@RequireScopes` /
 * `@ConnectionLevel` -> `X-Account-Id` -> `PublicApiAuthorizer.authorize(..., resource: null)`, then
 * the response headers and `req.*`. The order of the checks themselves, and every rule about them
 * (DB read on every request, the grant is the authority, one rate-limit bucket per connection),
 * live in `PublicApiAuthorizer` — read it before changing anything here.
 *
 * Sets `req.user` / `req.accountId` / `req.accountRole` / `req.monthAnchorDay` in exactly the shape
 * `JwtStrategy` + `AccountContextGuard` produce, so the app's services and write guards work
 * unchanged, plus `req.oauth`. Writes `X-RateLimit-Limit` / `-Remaining` whenever the rate limit was
 * counted (success or a later refusal), `Retry-After` on 429, `WWW-Authenticate` on invalid_token.
 *
 * The authorizer is stateless, so the guard composes its own from the same dependencies it always
 * took (every spec and module that provides this guard keeps working as is); `PublicApiModule` also
 * provides it for the MCP tools.
 *
 * Never log the token (or its hash).
 */
@Injectable()
export class PublicApiAuthGuard implements CanActivate {
  private readonly authorizer: PublicApiAuthorizer;

  constructor(
    private readonly config: ConfigService,
    prisma: PrismaService,
    cache: CacheService,
    rateLimit: PublicApiRateLimitService,
    private readonly reflector: Reflector,
  ) {
    this.authorizer = new PublicApiAuthorizer(prisma, cache, rateLimit);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isPublicApiEnabled(this.config)) throw new NotFoundException();

    const http = context.switchToHttp();
    const req = http.getRequest<PublicApiRequest>();
    const res = http.getResponse<Response>();

    // Deny by default (Ruling 13): a route must declare its scopes, or opt out with @TokenOnly().
    const tokenOnly = this.reflector.getAllAndOverride<boolean>(TOKEN_ONLY_KEY, [context.getHandler(), context.getClass()]) === true;
    const requiredScopes = this.reflector.getAllAndMerge<PublicScope[]>(REQUIRE_SCOPES_KEY, [context.getClass(), context.getHandler()]) ?? [];
    const connectionLevel =
      this.reflector.getAllAndOverride<boolean>(CONNECTION_LEVEL_KEY, [context.getHandler(), context.getClass()]) === true;

    let ctx;
    try {
      ctx = await this.authorizer.authorize(readBearer(req.headers?.authorization), {
        requiredScopes,
        tokenOnly,
        connectionLevel,
        accountId: readAccountHeader(req.headers?.[ACCOUNT_HEADER], req.headersDistinct?.[ACCOUNT_HEADER]),
        resource: null,
      });
    } catch (err) {
      if (err !== null && typeof err === 'object') writeErrorHeaders(res, err as AuthorizerErrorHints);
      throw err;
    }

    res.setHeader('X-RateLimit-Limit', String(ctx.rateLimit.limit));
    res.setHeader('X-RateLimit-Remaining', String(ctx.rateLimit.remaining));
    req.user = ctx.user;
    req.oauth = ctx.oauth;
    if (!connectionLevel) {
      req.accountId = ctx.accountId!;
      req.accountRole = ctx.accountRole!;
      req.monthAnchorDay = ctx.monthAnchorDay ?? null;
    }
    return true;
  }
}

function writeErrorHeaders(res: Response, err: AuthorizerErrorHints): void {
  if (err.rateLimit) {
    res.setHeader('X-RateLimit-Limit', String(err.rateLimit.limit));
    res.setHeader('X-RateLimit-Remaining', String(err.rateLimit.remaining));
  }
  if (err.retryAfterSec !== undefined) res.setHeader('Retry-After', String(err.retryAfterSec));
  if (err.wwwAuthenticate) res.setHeader('WWW-Authenticate', err.wwwAuthenticate);
}

/**
 * `X-Account-Id` as one value, or null when not sent. Sent more than once (an array, or
 * `headersDistinct` holding several) becomes a value `resolveAccountId` refuses as repeated.
 */
function readAccountHeader(raw: string | string[] | undefined, distinct: string[] | undefined): string | null {
  if (Array.isArray(raw) || (distinct?.length ?? 0) > 1) return REPEATED_ACCOUNT_HEADER;
  return raw ?? null;
}

/** The bearer token of an `Authorization` header, or null. Shared with the MCP endpoint (mcp-auth.ts). */
export function readBearer(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null;
  const m = /^Bearer[ ]+([^\s]+)\s*$/i.exec(header);
  return m ? m[1] : null;
}
