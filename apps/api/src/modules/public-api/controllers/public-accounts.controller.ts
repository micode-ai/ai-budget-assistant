import { Controller, Get, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiOAuth2, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../../database/prisma.service';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { ConnectionLevel } from '../decorators/connection-level.decorator';
import { TokenOnly } from '../decorators/token-only.decorator';
import { ApiPublicErrors } from '../docs/public-api-docs.decorators';
import { PublicConnectedAccountList } from '../dto/public-expense.dto';
import { PublicApiExceptionFilter } from '../filters/public-api-exception.filter';
import { PublicApiAuthGuard } from '../guards/public-api-auth.guard';
import type { PublicApiRequest } from '../public-api.types';
import { listConnectedAccounts } from '../public-read.views';

/**
 * `GET /public/v1/accounts` — the accounts of the connection, usable or not. Token-only and
 * connection-level: it needs no `X-Account-Id` and always succeeds for a live token. It exposes
 * nothing of the user (no e-mail, no role) beyond what the consent screen showed.
 */
@ApiTags('Account')
@Controller('public/v1/accounts')
@UseGuards(PublicApiEnabledGuard, PublicApiAuthGuard)
@UseFilters(PublicApiExceptionFilter)
export class PublicAccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @TokenOnly()
  @ConnectionLevel()
  @ApiOperation({ operationId: 'listAccounts' })
  @ApiOAuth2([], 'oauth2')
  @ApiOkResponse({ type: PublicConnectedAccountList, description: '' })
  @ApiPublicErrors()
  async list(@Req() req: PublicApiRequest): Promise<PublicConnectedAccountList> {
    // Shared with the MCP `list_accounts` tool (public-read.views.ts).
    return listConnectedAccounts(this.prisma, req.oauth.grantId, req.user.id, req.oauth.scopes);
  }
}
