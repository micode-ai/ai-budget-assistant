import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { McpEnabledGuard } from './guards/mcp-enabled.guard';
import { DCR_RATE_WINDOW_MS, OAuthRegisterService } from './oauth-register.service';
import type { RegistrationResponse } from './dto/register.dto';

/**
 * The address the per-IP registration limit counts. `req.ip` first: main.ts sets Express
 * `trust proxy` to 1, so it is the address our nginx appended to X-Forwarded-For — the real peer,
 * which a client cannot spoof (anything it sends itself sits further left and is not trusted).
 * `X-Real-IP` is only a fallback for an empty `req.ip`. A request with neither shares one
 * `unknown` bucket — still limited. The service then groups IPv6 by /64 (ip-bucket.util.ts).
 */
export function clientIp(req: Pick<Request, 'headers' | 'ip'>): string {
  const ip = req.ip?.trim();
  if (ip) return ip;
  const raw = req.headers['x-real-ip'];
  const header = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return header || 'unknown';
}

/**
 * `POST /oauth/register` — RFC 7591 dynamic client registration for MCP assistants.
 *
 * Public by design: no JwtAuthGuard (the caller is an assistant that has no account yet), served
 * WITHOUT the api/v1 prefix (named in global-prefix-exclusions.ts) and with CORS `*` without
 * credentials (cors-options.ts). 404 unless PUBLIC_API_ENABLED and MCP_ENABLED are both on. The body
 * is a plain record on purpose so the global ValidationPipe never answers in a non-RFC shape; the
 * service validates every field. Not part of the published REST API document.
 */
@ApiExcludeController()
@Controller('oauth')
@UseGuards(McpEnabledGuard)
export class OAuthRegisterController {
  constructor(private readonly registrations: OAuthRegisterService) {}

  @Post('register')
  @HttpCode(201)
  async register(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RegistrationResponse> {
    res.setHeader('Cache-Control', 'no-store');
    try {
      return await this.registrations.register(body, clientIp(req));
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        res.setHeader('Retry-After', String(DCR_RATE_WINDOW_MS / 1000));
      }
      throw e;
    }
  }
}
