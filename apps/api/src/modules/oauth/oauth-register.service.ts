import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { generateClientId } from './oauth-crypto.util';
import { ipBucket } from './ip-bucket.util';
import { parseRegistrationRequest, type RegistrationResponse } from './dto/register.dto';

export const DCR_REGISTRATIONS_PER_HOUR = 10;
export const DCR_RATE_WINDOW_MS = 60 * 60 * 1000;
/**
 * Ceiling on registrations from ALL clients together per hour. The per-IP limit alone cannot stop a
 * botnet; this bounds the anonymous table growth (cleanup runs only after 30 days) whatever the source.
 */
export const DCR_REGISTRATIONS_GLOBAL_PER_HOUR = 300;
export const DCR_GLOBAL_KEY = 'oauth:dcr:all';

/** 429 for an exhausted (or unreadable) per-IP registration window. */
function tooMany(): HttpException {
  return new HttpException(
    { error: 'slow_down', error_description: 'too many client registrations, retry later' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * RFC 7591 dynamic client registration for MCP assistants (`POST /oauth/register`).
 *
 * Every registered client is PUBLIC (no secret; PKCE S256 is already required of every client at
 * authorize), owner-less, `source = 'mcp_dcr'` and never verified — its name, URI and logo are
 * untrusted text the consent page shows as such. What it may do afterwards is fixed elsewhere:
 * read scopes only (oauth-scope-policy.ts) and only for the MCP resource (ruling R4).
 */
@Injectable()
export class OAuthRegisterService {
  private readonly logger = new Logger(OAuthRegisterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async register(body: unknown, ip: string): Promise<RegistrationResponse> {
    // Per source, counted before validation, so a flood of junk requests is limited too.
    await this.countWindow(`oauth:dcr:${ipBucket(ip)}`, DCR_REGISTRATIONS_PER_HOUR);
    const req = parseRegistrationRequest(body);
    // Global ceiling, counted only for valid requests (the ones that would write a row), so one
    // source's junk cannot use up everyone's budget.
    await this.countWindow(DCR_GLOBAL_KEY, DCR_REGISTRATIONS_GLOBAL_PER_HOUR);

    const client = await this.prisma.oAuthClient.create({
      data: {
        clientId: generateClientId(),
        secretHash: null,
        isConfidential: false,
        ownerUserId: null,
        source: 'mcp_dcr',
        isVerified: false,
        name: req.clientName,
        description: null,
        logoUrl: req.logoUri,
        homepageUrl: req.clientUri,
        privacyPolicyUrl: null,
        redirectUris: req.redirectUris,
      },
    });
    // The client_id is public by design; nothing else about the request is logged.
    this.logger.log(`registered MCP client ${client.clientId}`);

    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.name,
      ...(req.clientUri ? { client_uri: req.clientUri } : {}),
      ...(req.logoUri ? { logo_uri: req.logoUri } : {}),
      redirect_uris: req.redirectUris,
      grant_types: req.grantTypes,
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: req.scopes.join(' '),
    };
  }

  /**
   * One fixed one-hour window per key (per IP/64 bucket, and the global one). Fails closed: a
   * counter we cannot read is a 429, never "unlimited".
   */
  private async countWindow(key: string, max: number): Promise<void> {
    let hits: number;
    try {
      hits = await this.cache.incrementWindow(key, DCR_RATE_WINDOW_MS);
    } catch (e) {
      this.logger.warn(`registration rate-limit counter failed: ${(e as Error).message}`);
      throw tooMany();
    }
    if (hits > max) throw tooMany();
  }
}
