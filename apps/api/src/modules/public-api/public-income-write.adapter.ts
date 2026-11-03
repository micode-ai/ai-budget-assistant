import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { CreateIncomeDto, UpdateIncomeDto } from '../incomes/dto';
import { IncomesService } from '../incomes/incomes.service';
import type { PublicIncomeCreateDto, PublicIncomeUpdateDto } from './dto/public-income.dto';
import { PublicApiError } from './public-api-error';
import {
  assertReferencesBelongToAccount,
  fetchAccountCurrency,
  parseIdempotencyKey,
  type PublicWriteContext,
} from './public-write.shared';
import { getPublicIncome } from './public-incomes.query';
import { findOwnByIdempotencyKey } from './public-idempotency.util';

/**
 * The public API's income WRITE path: public snake_case body → the app's internal
 * `CreateIncomeDto`/`UpdateIncomeDto`, then `IncomesService` — never Prisma directly. The app's own
 * `IncomesController` adds nothing on top of the service (no budget alert, no shared-account push),
 * so nothing is repeated here.
 *
 * Same discipline as the expense adapter: references are checked first (the service resolves a
 * category leniently and its tag and project lookups are not account-scoped), and the
 * `Idempotency-Key` is scoped to the creating app and the account.
 */

export function toInternalIncomeCreateDto(
  body: PublicIncomeCreateDto,
  opts: { idempotencyKey: string; baseCurrency: string }
): CreateIncomeDto {
  return {
    localId: opts.idempotencyKey,
    amount: Number(body.amount),
    currencyCode: body.currency ?? opts.baseCurrency,
    date: body.date,
    categoryId: body.category_id,
    description: body.description,
    notes: body.notes,
    tagIds: body.tag_ids,
    projectId: body.project_id,
    source: 'api',
  };
}

/**
 * Only the fields present in the body. `null` reaches the service on purpose for the clearable
 * fields (`description`/`notes` go straight to Prisma; `categoryId: null` is an explicit clear in
 * `resolveCategoryIdForUpdate`; `projectId: null` removes the link). Never carries a debt field,
 * `source` or the creator.
 */
export function toInternalIncomeUpdateDto(body: PublicIncomeUpdateDto): UpdateIncomeDto {
  const dto: UpdateIncomeDto = {};
  // The internal DTO types these as `string | undefined`; the service passes them on as-is.
  const clearable = (v: string | null): string => v as string;
  if (body.amount !== undefined) dto.amount = Number(body.amount);
  if (body.currency !== undefined) dto.currencyCode = body.currency;
  if (body.date !== undefined) dto.date = body.date;
  if (body.category_id !== undefined) dto.categoryId = clearable(body.category_id);
  if (body.description !== undefined) dto.description = clearable(body.description);
  if (body.notes !== undefined) dto.notes = clearable(body.notes);
  if (body.tag_ids !== undefined) dto.tagIds = body.tag_ids;
  if (body.project_id !== undefined) dto.projectId = body.project_id;
  return dto;
}

/**
 * One leg of an account transfer: editing or deleting it alone would unbalance the transfer, so
 * both are refused. (`IncomesService.update` has no group-mirror special case — a group-linked
 * income's amount, currency and date are plain writable fields — so no equivalent refusal exists.)
 */
function assertNotTransferLeg(row: { linkedTransfer: unknown }, verb: 'edited' | 'deleted'): void {
  if (row.linkedTransfer) {
    throw new PublicApiError(
      422,
      'validation_failed',
      `This income is one side of a transfer between accounts and cannot be ${verb} on its own; manage the transfer in the app.`
    );
  }
}

@Injectable()
export class PublicIncomeWriteAdapter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly incomes: IncomesService
  ) {}

  /**
   * Creates the income, or — when this app already created one with this `Idempotency-Key` in this
   * account — returns that one untouched with `isNew: false` (the repeat's body is ignored; the
   * service's create is an upsert whose update branch would overwrite the row).
   */
  async create(
    ctx: PublicWriteContext,
    rawKey: string | string[] | undefined,
    body: PublicIncomeCreateDto
  ) {
    const key = parseIdempotencyKey(rawKey);

    const existingId = await findOwnByIdempotencyKey(this.prisma.income, ctx, key, {
      noun: 'income',
      hasPlanned: false,
    });
    if (existingId) return { id: existingId, isNew: false };

    await assertReferencesBelongToAccount(this.prisma, ctx.accountId, body, {
      categoryType: 'income',
    });
    const baseCurrency = body.currency ?? (await fetchAccountCurrency(this.prisma, ctx.accountId));
    const dto = toInternalIncomeCreateDto(body, { idempotencyKey: key, baseCurrency });

    const { income, isNew } = await this.incomes.createWithStatus(ctx.accountId, ctx.userId, dto, {
      createdByOAuthClientId: ctx.clientDbId,
    });
    if (!income) throw new Error('IncomesService.createWithStatus returned no income');
    return { id: income.id as string, isNew };
  }

  async update(ctx: PublicWriteContext, id: string, body: PublicIncomeUpdateDto) {
    const row = await getPublicIncome(this.prisma, ctx.accountId, id);
    assertNotTransferLeg(row, 'edited');
    await assertReferencesBelongToAccount(this.prisma, ctx.accountId, body, {
      categoryType: 'income',
    });
    await this.incomes.update(ctx.accountId, row.id, toInternalIncomeUpdateDto(body));
    return { id: row.id };
  }

  async remove(ctx: PublicWriteContext, id: string): Promise<void> {
    const row = await getPublicIncome(this.prisma, ctx.accountId, id);
    assertNotTransferLeg(row, 'deleted');
    await this.incomes.remove(ctx.accountId, row.id);
  }
}
