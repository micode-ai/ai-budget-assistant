import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOAuth2,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../../../database/prisma.service';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { PublicWrite } from '../decorators/public-write.decorator';
import { RequireScopes } from '../decorators/require-scopes.decorator';
import { ApiAccountHeader, ApiPublicErrors } from '../docs/public-api-docs.decorators';
import {
  EX_INCOME_ID,
  ListPublicIncomeChangesQueryDto,
  ListPublicIncomesQueryDto,
  PublicIncome,
  PublicIncomeChanges,
  PublicIncomeCreateDto,
  PublicIncomeList,
  PublicIncomeUpdateDto,
} from '../dto/public-income.dto';
import { PublicApiExceptionFilter } from '../filters/public-api-exception.filter';
import { PublicApiAuthGuard } from '../guards/public-api-auth.guard';
import { toPublicIncome } from '../mappers/public-income.mapper';

import { PublicIncomeWriteAdapter } from '../public-income-write.adapter';
import type { PublicApiRequest } from '../public-api.types';
import { writeContext } from '../public-write.shared';
import { listPublicIncomeChanges } from '../public-incomes.query';
import { readPublicIncome, readPublicIncomeList } from '../public-read.views';

/** The `{id}` path parameter: the income's id as returned by this API. */
function ApiIncomeId(): MethodDecorator {
  return ApiParam({ name: 'id', type: String, format: 'uuid', example: EX_INCOME_ID });
}

/**
 * `GET /public/v1/incomes`, `GET /public/v1/incomes/changes`, `GET /public/v1/incomes/{id}`.
 * `POST /public/v1/incomes`, `PATCH|DELETE /public/v1/incomes/{id}` go through
 * `PublicIncomeWriteAdapter` → `IncomesService`; every write route carries `@PublicWrite()`.
 *
 * Route order matters: a literal sub-path (`/incomes/changes`) must be declared BEFORE
 * `@Get(':id')` in this class, or `:id` captures it.
 */
@ApiAccountHeader()
@ApiTags('Incomes')
@Controller('public/v1/incomes')
@UseGuards(PublicApiEnabledGuard, PublicApiAuthGuard)
@UseFilters(PublicApiExceptionFilter)
export class PublicIncomesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: PublicIncomeWriteAdapter
  ) {}

  @Get()
  @RequireScopes('incomes:read')
  @ApiOperation({ operationId: 'listIncomes' })
  @ApiOAuth2(['incomes:read'], 'oauth2')
  @ApiOkResponse({ type: PublicIncomeList, description: '' })
  @ApiPublicErrors()
  async list(
    @Req() req: PublicApiRequest,
    @Query() q: ListPublicIncomesQueryDto
  ): Promise<PublicIncomeList> {
    // Shared with the MCP `list_incomes` tool, tier-1 filter refusal included (public-read.views.ts).
    return readPublicIncomeList(this.prisma, req.accountId, req.oauth.encryptionTier, q);
  }

  /** Incremental sync: every change since `cursor`, ordered by `(updated_at, id)`; deletions arrive as `{type:'delete'}`. */
  @Get('changes')
  @RequireScopes('incomes:read')
  @ApiOperation({ operationId: 'listIncomeChanges' })
  @ApiOAuth2(['incomes:read'], 'oauth2')
  @ApiOkResponse({ type: PublicIncomeChanges, description: '' })
  @ApiPublicErrors()
  async changes(
    @Req() req: PublicApiRequest,
    @Query() q: ListPublicIncomeChangesQueryDto
  ): Promise<PublicIncomeChanges> {
    const tier = req.oauth.encryptionTier;
    const page = await listPublicIncomeChanges(this.prisma, req.accountId, q);
    return {
      changes: page.changes.map((c) =>
        c.type === 'upsert'
          ? { type: 'upsert' as const, income: toPublicIncome(c.row, { encryptionTier: tier }) }
          : { type: 'delete' as const, id: c.id, deleted_at: c.deletedAt.toISOString() }
      ),
      next_cursor: page.nextCursor,
      has_more: page.hasMore,
    };
  }

  @Get(':id')
  @RequireScopes('incomes:read')
  @ApiOperation({ operationId: 'getIncome' })
  @ApiOAuth2(['incomes:read'], 'oauth2')
  @ApiIncomeId()
  @ApiOkResponse({ type: PublicIncome, description: '' })
  @ApiPublicErrors()
  async get(@Req() req: PublicApiRequest, @Param('id') id: string): Promise<PublicIncome> {
    return this.detail(req, id);
  }

  /**
   * `201` with the new income, or `200` with the income this app already created under the same
   * `Idempotency-Key` (the repeat's body is ignored). `@Res()` because the status depends on the
   * outcome: with `passthrough` Nest re-applies the route's default 201 when it sends the body.
   */
  @Post()
  @RequireScopes('incomes:write')
  @PublicWrite()
  @ApiOperation({ operationId: 'createIncome' })
  @ApiOAuth2(['incomes:write'], 'oauth2')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid', example: 'b7e3c1a9-4f2d-4e8b-9a6c-0d5f7e1b3a24' },
  })
  @ApiCreatedResponse({ type: PublicIncome, description: '' })
  @ApiOkResponse({ type: PublicIncome, description: '' })
  @ApiPublicErrors(409, 422)
  async create(
    @Req() req: PublicApiRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: PublicIncomeCreateDto,
    @Res() res: Response
  ): Promise<void> {
    const { id, isNew } = await this.writer.create(writeContext(req), idempotencyKey, body);
    res.status(isNew ? 201 : 200).json(await this.detail(req, id));
  }

  /** A transfer leg is read-only (`422`); editing a debt repayment changes the debt's outstanding balance. */
  @Patch(':id')
  @RequireScopes('incomes:write')
  @PublicWrite()
  @ApiOperation({ operationId: 'updateIncome' })
  @ApiOAuth2(['incomes:write'], 'oauth2')
  @ApiIncomeId()
  @ApiOkResponse({ type: PublicIncome, description: '' })
  @ApiPublicErrors(422)
  async update(
    @Req() req: PublicApiRequest,
    @Param('id') id: string,
    @Body() body: PublicIncomeUpdateDto
  ): Promise<PublicIncome> {
    const { id: serverId } = await this.writer.update(writeContext(req), id, body);
    return this.detail(req, serverId);
  }

  /** Soft delete, as in the app. A transfer leg cannot be deleted on its own (`422`). */
  @Delete(':id')
  @HttpCode(204)
  @RequireScopes('incomes:write')
  @PublicWrite()
  @ApiOperation({ operationId: 'deleteIncome' })
  @ApiOAuth2(['incomes:write'], 'oauth2')
  @ApiIncomeId()
  @ApiNoContentResponse({ description: '' })
  @ApiPublicErrors(422)
  async remove(@Req() req: PublicApiRequest, @Param('id') id: string): Promise<void> {
    await this.writer.remove(writeContext(req), id);
  }

  /** Re-read so a write answers exactly what a GET would. */
  private async detail(req: PublicApiRequest, id: string): Promise<PublicIncome> {
    return readPublicIncome(this.prisma, req.accountId, req.oauth.encryptionTier, id);
  }
}

