import { Body, Controller, Headers, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiOAuthRevokeDocs, ApiOAuthTokenDocs } from './dto/oauth-token.doc';
import { PublicApiEnabledGuard } from './guards/public-api-enabled.guard';
import { OAuthTokenError, OAuthTokenService, type OAuthBody } from './oauth-token.service';

/**
 * The third-party-facing OAuth endpoints, served WITHOUT the api/v1 prefix (`oauth/token` and
 * `oauth/revoke` are named in global-prefix-exclusions.ts) and with `Access-Control-Allow-Origin: *`
 * without credentials (cors-options.ts).
 *
 * Public by design: there is no JwtAuthGuard — the caller is an OAuth client authenticated inside
 * the service (HTTP Basic or client_id/client_secret). The body is typed as a plain record on
 * purpose: the global ValidationPipe skips `Object`, so standard OAuth form params and the extras
 * some libraries add never turn into a non-RFC 400 — the service validates every field itself and
 * answers in RFC 6749 §5.2 `{error, error_description}`. Both `application/x-www-form-urlencoded`
 * and JSON bodies arrive here (main.ts registers both parsers).
 */
@ApiTags('OAuth')
@Controller('oauth')
@UseGuards(PublicApiEnabledGuard)
export class OAuthTokenController {
  constructor(private readonly tokens: OAuthTokenService) {}

  @Post('token')
  @HttpCode(200)
  @ApiOperation({ operationId: 'issueToken' })
  @ApiOAuthTokenDocs()
  async token(
    @Body() body: OAuthBody,
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    try {
      return await this.tokens.token(body ?? {}, authorization);
    } catch (e) {
      decorateError(e, authorization, res);
      throw e;
    }
  }

  @Post('revoke')
  @HttpCode(200)
  @ApiOperation({ operationId: 'revokeToken' })
  @ApiOAuthRevokeDocs()
  async revoke(
    @Body() body: OAuthBody,
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    try {
      return await this.tokens.revoke(body ?? {}, authorization);
    } catch (e) {
      decorateError(e, authorization, res);
      throw e;
    }
  }
}

/** RFC 6749 §5.1: token responses (and their errors) must never be cached. */
function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

/** Headers that ride on the error response the exception filter writes. */
function decorateError(e: unknown, authorization: string | undefined, res: Response): void {
  if (!(e instanceof OAuthTokenError)) return;
  // RFC 6749 §5.2: a 401 to a client that used the Authorization header carries WWW-Authenticate.
  if (e.code === 'invalid_client' && authorization && /^Basic\s/i.test(authorization)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="oauth"');
  }
  if (e.code === 'slow_down') res.setHeader('Retry-After', '60');
}
