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
  StreamableFile,
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
import {
  ListPublicExpenseChangesQueryDto,
  ListPublicExpensesQueryDto,
  PublicExpenseCreateDto,
  PublicExpenseUpdateDto,
  EX,
  PublicExpense,
  PublicExpenseChanges,
  PublicExpenseList,
} from '../dto/public-expense.dto';
import { ApiPublicErrors } from '../docs/public-api-docs.decorators';
import { PublicApiExceptionFilter } from '../filters/public-api-exception.filter';
import { PublicApiAuthGuard } from '../guards/public-api-auth.guard';
import { toPublicExpense } from '../mappers/public-expense.mapper';
import { PublicApiError } from '../public-api-error';
import { PublicExpenseWriteAdapter, type PublicWriteContext } from '../public-expense-write.adapter';
import type { PublicApiRequest } from '../public-api.types';
import { getPublicExpense, getPublicReceipt, listPublicExpenseChanges, listPublicExpenses } from '../public-expenses.query';

/** Content types a receipt can be served as (sniffed from the bytes; see `getPublicReceipt`). */
const RECEIPT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

/** The `{id}` path parameter: the expense's id as returned by this API. */
function ApiExpenseId(): MethodDecorator {
  return ApiParam({ name: 'id', type: String, format: 'uuid', example: EX.expenseId });
}

/**
 * `GET /public/v1/expenses`, `GET /public/v1/expenses/changes`, `GET|PATCH|DELETE /public/v1/expenses/{id}`,
 * `GET /public/v1/expenses/{id}/receipt`, `POST /public/v1/expenses`.
 * Writes go through `PublicExpenseWriteAdapter` → `ExpensesService`, and every write route carries
 * `@PublicWrite()` (encrypted account, viewer, archived trip).
 *
 * Route order matters for later tasks: a literal sub-path (`/expenses/changes`) must be declared
 * BEFORE `@Get(':id')` in this class, or `:id` captures it.
 */
@ApiTags('Expenses')
@Controller('public/v1/expenses')
@UseGuards(PublicApiEnabledGuard, PublicApiAuthGuard)
@UseFilters(PublicApiExceptionFilter)
export class PublicExpensesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: PublicExpenseWriteAdapter,
  ) {}

  @Get()
  @RequireScopes('expenses:read')
  @ApiOperation({ operationId: 'listExpenses' })
  @ApiOAuth2(['expenses:read'], 'oauth2')
  @ApiOkResponse({ type: PublicExpenseList, description: '' })
  @ApiPublicErrors()
  async list(@Req() req: PublicApiRequest, @Query() q: ListPublicExpensesQueryDto): Promise<PublicExpenseList> {
    const tier = req.oauth.encryptionTier;
    // At tier 1 merchant/description/notes are withheld from every response; filtering on them would
    // turn the filter into an oracle for the very values withheld (rows a bot or import wrote are
    // plaintext on the server). Refuse rather than silently match nothing.
    if (tier >= 1 && (q.merchant !== undefined || q.search !== undefined)) {
      throw new PublicApiError(
        403,
        'account_encrypted',
        'This account is end-to-end encrypted: merchant and search filters are not available.',
        { fields: ['merchant', 'search'].filter((f) => q[f as 'merchant' | 'search'] !== undefined) },
      );
    }

    const page = await listPublicExpenses(this.prisma, req.accountId, q);
    return {
      data: page.rows.map((r) => toPublicExpense(r, { encryptionTier: tier, includeItems: false })),
      next_cursor: page.nextCursor,
      has_more: page.hasMore,
    };
  }

  /**
   * Incremental sync: every change since `cursor`, ordered by `(updated_at, id)`. Deletions — and
   * expenses that turned planned — arrive as `{type:'delete'}`. Upserts go through the same mapper
   * as `GET /expenses/{id}`, so tier-1 nulling applies to them identically.
   *
   * Declared BEFORE `@Get(':id')`: Express matches in declaration order, and `:id` would capture
   * the literal `changes`.
   */
  @Get('changes')
  @RequireScopes('expenses:read')
  @ApiOperation({ operationId: 'listExpenseChanges' })
  @ApiOAuth2(['expenses:read'], 'oauth2')
  @ApiOkResponse({ type: PublicExpenseChanges, description: '' })
  @ApiPublicErrors()
  async changes(@Req() req: PublicApiRequest, @Query() q: ListPublicExpenseChangesQueryDto): Promise<PublicExpenseChanges> {
    const tier = req.oauth.encryptionTier;
    const page = await listPublicExpenseChanges(this.prisma, req.accountId, q);
    return {
      changes: page.changes.map((c) =>
        c.type === 'upsert'
          ? { type: 'upsert' as const, expense: toPublicExpense(c.row, { encryptionTier: tier, includeItems: true }) }
          : { type: 'delete' as const, id: c.id, deleted_at: c.deletedAt.toISOString() },
      ),
      next_cursor: page.nextCursor,
      has_more: page.hasMore,
    };
  }

  /**
   * The original receipt bytes. `receiptImage` is a tier-1 encrypted field, so an encrypted
   * account gets `403 account_encrypted` before any lookup (the answer does not depend on the id).
   * Content type is sniffed from the bytes, never taken from the stored mime (see
   * `getPublicReceipt`); `nosniff` stops a browser from second-guessing it, and `private, no-store`
   * keeps a financial document out of shared and disk caches.
   */
  @Get(':id/receipt')
  @RequireScopes('receipts:read')
  @ApiOperation({ operationId: 'getExpenseReceipt' })
  @ApiOAuth2(['receipts:read'], 'oauth2')
  @ApiExpenseId()
  @ApiOkResponse({
    description: '',
    content: Object.fromEntries(RECEIPT_CONTENT_TYPES.map((t) => [t, { schema: { type: 'string', format: 'binary' } }])),
  })
  @ApiPublicErrors()
  async receipt(
    @Req() req: PublicApiRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (req.oauth.encryptionTier >= 1) {
      throw new PublicApiError(
        403,
        'account_encrypted',
        'This account is end-to-end encrypted: receipt files are not available through the API.',
      );
    }
    const file = await getPublicReceipt(this.prisma, req.accountId, id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.bytes, {
      type: file.contentType,
      disposition: `inline; filename="receipt-${file.id}.${file.extension}"`,
      length: file.bytes.length,
    });
  }

  @Get(':id')
  @RequireScopes('expenses:read')
  @ApiOperation({ operationId: 'getExpense' })
  @ApiOAuth2(['expenses:read'], 'oauth2')
  @ApiExpenseId()
  @ApiOkResponse({ type: PublicExpense, description: '' })
  @ApiPublicErrors()
  async get(@Req() req: PublicApiRequest, @Param('id') id: string): Promise<PublicExpense> {
    return this.detail(req, id);
  }

  /**
   * `201` with the new expense, or `200` with the expense this app already created under the same
   * `Idempotency-Key` (the repeat's body is ignored). `@Res()` because the status depends on the
   * outcome: with `passthrough` Nest re-applies the route's default 201 when it sends the body.
   */
  @Post()
  @RequireScopes('expenses:write')
  @PublicWrite()
  @ApiOperation({ operationId: 'createExpense' })
  @ApiOAuth2(['expenses:write'], 'oauth2')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid', example: 'b7e3c1a9-4f2d-4e8b-9a6c-0d5f7e1b3a24' },
  })
  @ApiCreatedResponse({ type: PublicExpense, description: '' })
  @ApiOkResponse({ type: PublicExpense, description: '' })
  @ApiPublicErrors(409, 422)
  async create(
    @Req() req: PublicApiRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: PublicExpenseCreateDto,
    @Res() res: Response,
  ): Promise<void> {
    const { id, isNew } = await this.writer.create(writeContext(req), idempotencyKey, body);
    res.status(isNew ? 201 : 200).json(await this.detail(req, id));
  }

  @Patch(':id')
  @RequireScopes('expenses:write')
  @PublicWrite()
  @ApiOperation({ operationId: 'updateExpense' })
  @ApiOAuth2(['expenses:write'], 'oauth2')
  @ApiExpenseId()
  @ApiOkResponse({ type: PublicExpense, description: '' })
  @ApiPublicErrors(422)
  async update(@Req() req: PublicApiRequest, @Param('id') id: string, @Body() body: PublicExpenseUpdateDto): Promise<PublicExpense> {
    const { id: serverId } = await this.writer.update(writeContext(req), id, body);
    return this.detail(req, serverId);
  }

  /** Soft delete, as in the app. */
  @Delete(':id')
  @HttpCode(204)
  @RequireScopes('expenses:write')
  @PublicWrite()
  @ApiOperation({ operationId: 'deleteExpense' })
  @ApiOAuth2(['expenses:write'], 'oauth2')
  @ApiExpenseId()
  @ApiNoContentResponse({ description: '' })
  @ApiPublicErrors()
  async remove(@Req() req: PublicApiRequest, @Param('id') id: string): Promise<void> {
    await this.writer.remove(writeContext(req), id);
  }

  /** The detail shape (with items), re-read so a write answers exactly what a GET would. */
  private async detail(req: PublicApiRequest, id: string): Promise<PublicExpense> {
    const row = await getPublicExpense(this.prisma, req.accountId, id);
    return toPublicExpense(row, { encryptionTier: req.oauth.encryptionTier, includeItems: true });
  }
}

function writeContext(req: PublicApiRequest): PublicWriteContext {
  return { accountId: req.accountId, userId: req.user.id, clientDbId: req.oauth.clientDbId };
}
