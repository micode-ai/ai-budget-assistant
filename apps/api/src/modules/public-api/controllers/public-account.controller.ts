import { Controller, Get, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiOAuth2, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../../database/prisma.service';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { TokenOnly } from '../decorators/token-only.decorator';
import { ApiAccountHeader, ApiPublicErrors } from '../docs/public-api-docs.decorators';
import { PublicAccount } from '../dto/public-expense.dto';
import { PublicApiExceptionFilter } from '../filters/public-api-exception.filter';
import { PublicApiAuthGuard } from '../guards/public-api-auth.guard';
import { PublicApiError } from '../public-api-error';
import type { PublicApiRequest } from '../public-api.types';

/** `0` none, `1` text fields only, `>= 2` everything (the guard refuses those, so in practice none|text). */
export function encryptionLabel(tier: number): PublicAccount['encryption'] {
  if (tier >= 2) return 'full';
  return tier === 1 ? 'text' : 'none';
}

/**
 * `GET /public/v1/account` — the account the request addresses (`X-Account-Id`), one of the connection's accounts. The ONLY `@TokenOnly()` route
 * (Ruling 13): any valid token may read it, so it says nothing beyond what the consent screen
 * already showed — no e-mail, no other accounts.
 */
@ApiAccountHeader()
@ApiTags('Account')
@Controller('public/v1/account')
@UseGuards(PublicApiEnabledGuard, PublicApiAuthGuard)
@UseFilters(PublicApiExceptionFilter)
export class PublicAccountController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @TokenOnly()
  @ApiOperation({ operationId: 'getAccount' })
  @ApiOAuth2([], 'oauth2')
  @ApiOkResponse({ type: PublicAccount, description: '' })
  @ApiPublicErrors()
  async get(@Req() req: PublicApiRequest): Promise<PublicAccount> {
    const account = await this.prisma.account.findUnique({
      where: { id: req.accountId },
      select: { id: true, name: true, type: true, currencyCode: true },
    });
    if (!account) throw new PublicApiError(404, 'not_found', 'Account not found.');

    const tier = req.oauth.encryptionTier;
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      base_currency: account.currencyCode,
      role: req.accountRole,
      encryption: encryptionLabel(tier),
      // The guard only lets an owner/editor grantor through, so the role never makes it read-only;
      // an encrypted account does (writes answer 403 account_encrypted).
      read_only: tier >= 1,
      user: { id: req.user.id, name: req.user.name, base_currency: req.user.currencyCode },
    };
  }
}
