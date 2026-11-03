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
import { BudgetsService } from '../../budgets/budgets.service';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { PublicWrite } from '../decorators/public-write.decorator';
import { RequireScopes } from '../decorators/require-scopes.decorator';
import { ApiAccountHeader, ApiPublicErrors } from '../docs/public-api-docs.decorators';
import {
  EX_BUDGET_ID,
  PublicBudget,
  PublicBudgetCreateDto,
  PublicBudgetList,
  PublicBudgetUpdateDto,
} from '../dto/public-budget.dto';
import { PublicApiExceptionFilter } from '../filters/public-api-exception.filter';
import { PublicApiAuthGuard } from '../guards/public-api-auth.guard';
import { toPublicBudget } from '../mappers/public-budget.mapper';
import { PublicBudgetWriteAdapter } from '../public-budget-write.adapter';
import { getPublicBudget, listPublicBudgets } from '../public-budgets.query';
import type { PublicApiRequest } from '../public-api.types';
import { writeContext } from '../public-write.shared';

/** The `{id}` path parameter: the budget's id as returned by this API. */
function ApiBudgetId(): MethodDecorator {
  return ApiParam({ name: 'id', type: String, format: 'uuid', example: EX_BUDGET_ID });
}

/**
 * `GET /public/v1/budgets`, `GET /public/v1/budgets/{id}` (both with current-period progress);
 * `POST`, `PATCH|DELETE /{id}` go through `PublicBudgetWriteAdapter` → `BudgetsService`.
 * Budgets have no changes feed and no pagination.
 */
@ApiAccountHeader()
@ApiTags('Budgets')
@Controller('public/v1/budgets')
@UseGuards(PublicApiEnabledGuard, PublicApiAuthGuard)
@UseFilters(PublicApiExceptionFilter)
export class PublicBudgetsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgets: BudgetsService,
    private readonly writer: PublicBudgetWriteAdapter
  ) {}

  @Get()
  @RequireScopes('budgets:read')
  @ApiOperation({ operationId: 'listBudgets' })
  @ApiOAuth2(['budgets:read'], 'oauth2')
  @ApiOkResponse({ type: PublicBudgetList, description: '' })
  @ApiPublicErrors()
  async list(@Req() req: PublicApiRequest): Promise<PublicBudgetList> {
    const rows = await listPublicBudgets(this.budgets, req.accountId);
    return {
      data: rows.map((r) => toPublicBudget(r, { encryptionTier: req.oauth.encryptionTier })),
    };
  }

  @Get(':id')
  @RequireScopes('budgets:read')
  @ApiOperation({ operationId: 'getBudget' })
  @ApiOAuth2(['budgets:read'], 'oauth2')
  @ApiBudgetId()
  @ApiOkResponse({ type: PublicBudget, description: '' })
  @ApiPublicErrors()
  async get(@Req() req: PublicApiRequest, @Param('id') id: string): Promise<PublicBudget> {
    return this.detail(req, id);
  }

  /** `201` with the new budget, or `200` with the one this app already created under the same `Idempotency-Key`. */
  @Post()
  @RequireScopes('budgets:write')
  @PublicWrite()
  @ApiOperation({ operationId: 'createBudget' })
  @ApiOAuth2(['budgets:write'], 'oauth2')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid', example: 'b7e3c1a9-4f2d-4e8b-9a6c-0d5f7e1b3a24' },
  })
  @ApiCreatedResponse({ type: PublicBudget, description: '' })
  @ApiOkResponse({ type: PublicBudget, description: '' })
  @ApiPublicErrors(409, 422)
  async create(
    @Req() req: PublicApiRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: PublicBudgetCreateDto,
    @Res() res: Response
  ): Promise<void> {
    const { id, isNew } = await this.writer.create(writeContext(req), idempotencyKey, body);
    res.status(isNew ? 201 : 200).json(await this.detail(req, id));
  }

  /** `allocations` replaces the whole set (`[]` clears it); absent keeps it. */
  @Patch(':id')
  @RequireScopes('budgets:write')
  @PublicWrite()
  @ApiOperation({ operationId: 'updateBudget' })
  @ApiOAuth2(['budgets:write'], 'oauth2')
  @ApiBudgetId()
  @ApiOkResponse({ type: PublicBudget, description: '' })
  @ApiPublicErrors(422)
  async update(
    @Req() req: PublicApiRequest,
    @Param('id') id: string,
    @Body() body: PublicBudgetUpdateDto
  ): Promise<PublicBudget> {
    const { id: serverId } = await this.writer.update(writeContext(req), id, body);
    return this.detail(req, serverId);
  }

  /** Soft delete, as in the app. */
  @Delete(':id')
  @HttpCode(204)
  @RequireScopes('budgets:write')
  @PublicWrite()
  @ApiOperation({ operationId: 'deleteBudget' })
  @ApiOAuth2(['budgets:write'], 'oauth2')
  @ApiBudgetId()
  @ApiNoContentResponse({ description: '' })
  @ApiPublicErrors()
  async remove(@Req() req: PublicApiRequest, @Param('id') id: string): Promise<void> {
    await this.writer.remove(writeContext(req), id);
  }

  /** Re-read so a write answers exactly what a GET would. */
  private async detail(req: PublicApiRequest, id: string): Promise<PublicBudget> {
    const row = await getPublicBudget(this.prisma, this.budgets, req.accountId, id);
    return toPublicBudget(row, { encryptionTier: req.oauth.encryptionTier });
  }
}
