import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { BudgetAlertService } from '../budgets/budget-alert.service';
import type { CreateExpenseDto, UpdateExpenseDto } from '../expenses/dto';
import { ExpensesService } from '../expenses/expenses.service';
import { SharedActivityService } from '../notifications/shared-activity.service';
import type { PublicExpenseCreateDto, PublicExpenseUpdateDto } from './dto/public-expense.dto';
import { PublicApiError } from './public-api-error';
import { getPublicExpense } from './public-expenses.query';
import { findOwnByIdempotencyKey } from './public-idempotency.util';
import {
  assertReferencesBelongToAccount,
  fetchAccountCurrency,
  parseIdempotencyKey,
  type PublicWriteContext,
} from './public-write.shared';

export { assertReferencesBelongToAccount, parseIdempotencyKey, type PublicWriteContext };

/**
 * The public API's expense WRITE path: public snake_case body → the app's internal
 * `CreateExpenseDto`/`UpdateExpenseDto`, then `ExpensesService` — never Prisma directly — so every
 * side effect of an app write fires unchanged (anomaly check, family feed, gamification, merchant
 * rules, chat-cache bust inside the service; budget alerts and the shared-account push the app's
 * own `ExpensesController` adds on top, repeated here).
 *
 * Everything the service would otherwise resolve leniently is checked FIRST: the service resolves
 * a category by name or client id and silently drops an unknown tag or project, and its tag and
 * project lookups on create are not account-scoped. A public client gets a `422` instead.
 */

export function toInternalCreateDto(
  body: PublicExpenseCreateDto,
  opts: { idempotencyKey: string; baseCurrency: string },
): CreateExpenseDto {
  return {
    localId: opts.idempotencyKey,
    amount: Number(body.amount),
    currencyCode: body.currency ?? opts.baseCurrency,
    date: body.date,
    time: body.time,
    categoryId: body.category_id,
    description: body.description,
    merchant: body.merchant,
    notes: body.notes,
    location: body.location
      ? { lat: body.location.lat, lng: body.location.lng, name: body.location.name ?? undefined }
      : undefined,
    tagIds: body.tag_ids,
    projectId: body.project_id,
    items: body.items?.map((item, index) => ({
      description: item.description,
      quantity: item.quantity !== undefined ? Number(item.quantity) : 1,
      unitPrice: item.unit_price !== undefined ? Number(item.unit_price) : 0,
      totalPrice: Number(item.total_price),
      sortOrder: index,
    })),
    source: 'api',
  };
}

/**
 * Only the fields present in the body. `null` reaches the service on purpose for the clearable
 * fields: `update()` hands `description`/`notes`/`time` straight to Prisma (null clears the
 * column), treats `categoryId: null` as an explicit clear, and `location`/`projectId: null` as
 * removal. Never touches `source` or the creator.
 */
export function toInternalUpdateDto(body: PublicExpenseUpdateDto): UpdateExpenseDto {
  const dto: UpdateExpenseDto = {};
  // The internal DTO types these as `string | undefined`; the service passes them to Prisma as-is.
  const clearable = (v: string | null): string => v as string;
  if (body.amount !== undefined) dto.amount = Number(body.amount);
  if (body.currency !== undefined) dto.currencyCode = body.currency;
  if (body.date !== undefined) dto.date = body.date;
  if (body.time !== undefined) dto.time = clearable(body.time);
  if (body.category_id !== undefined) dto.categoryId = clearable(body.category_id);
  if (body.description !== undefined) dto.description = clearable(body.description);
  if (body.merchant !== undefined) dto.merchant = body.merchant;
  if (body.notes !== undefined) dto.notes = clearable(body.notes);
  if (body.location !== undefined) {
    dto.location = body.location
      ? { lat: body.location.lat, lng: body.location.lng, name: body.location.name ?? undefined }
      : null;
  }
  if (body.tag_ids !== undefined) dto.tagIds = body.tag_ids;
  if (body.project_id !== undefined) dto.projectId = body.project_id;
  return dto;
}

/**
 * Amount, currency and date of a shared-group share row (`source: 'group'`) belong to the group's
 * budget mirror: `ExpensesService.update` ignores them there (ABA-660). A write API must not answer
 * 200 for an edit it dropped, so they are refused up front; every other field stays writable.
 */
const MIRROR_OWNED_FIELDS = ['amount', 'currency', 'date'] as const;

export function assertNotMirrorOwned(source: string, body: PublicExpenseUpdateDto): void {
  if (source !== 'group') return;
  const fields: Record<string, string[]> = {};
  for (const f of MIRROR_OWNED_FIELDS) {
    if (body[f] !== undefined) fields[f] = ['set by the shared group'];
  }
  if (Object.keys(fields).length > 0) {
    throw new PublicApiError(422, 'validation_failed', 'This expense is a share of a shared group expense; its amount, currency and date follow the group.', {
      fields,
    });
  }
}

@Injectable()
export class PublicExpenseWriteAdapter {
  private readonly logger = new Logger(PublicExpenseWriteAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expenses: ExpensesService,
    private readonly budgetAlerts: BudgetAlertService,
    private readonly sharedActivity: SharedActivityService,
  ) {}

  /**
   * Creates the expense, or — when this app already created one with this `Idempotency-Key` in this
   * account — returns that one untouched with `isNew: false`. The repeat's body is ignored: the
   * service's create is an upsert whose update branch would overwrite the row, which is the app's
   * offline-retry contract, not an idempotent replay. Two identical FIRST requests racing past the
   * lookup are resolved by that upsert (the second becomes `isNew: false`).
   */
  async create(ctx: PublicWriteContext, rawKey: string | string[] | undefined, body: PublicExpenseCreateDto) {
    const key = parseIdempotencyKey(rawKey);

    const existingId = await findOwnByIdempotencyKey(this.prisma.expense, ctx, key, { noun: 'expense', hasPlanned: true });
    if (existingId) return { id: existingId, isNew: false };

    await assertReferencesBelongToAccount(this.prisma, ctx.accountId, body);
    const baseCurrency = body.currency ?? (await fetchAccountCurrency(this.prisma, ctx.accountId));
    const dto = toInternalCreateDto(body, { idempotencyKey: key, baseCurrency });

    const { expense, isNew } = await this.expenses.create(ctx.accountId, ctx.userId, dto, {
      createdByOAuthClientId: ctx.clientDbId,
    });
    if (!expense) throw new Error('ExpensesService.create returned no expense');

    // What the app's own ExpensesController adds on top of the service for a new expense.
    if (isNew) {
      this.budgetAlerts
        .checkBudgetsForAccount(ctx.accountId, dto.currencyCode)
        .catch(logFireAndForget(this.logger, 'PublicExpenseWriteAdapter.checkBudgetsForAccount'));
      this.sharedActivity
        .notifyExpenseCreated(ctx.accountId, ctx.userId, expense.id, dto.amount, dto.currencyCode, dto.description)
        .catch(logFireAndForget(this.logger, 'PublicExpenseWriteAdapter.notifyExpenseCreated'));
    }
    return { id: expense.id as string, isNew };
  }

  async update(ctx: PublicWriteContext, id: string, body: PublicExpenseUpdateDto) {
    const row = await getPublicExpense(this.prisma, ctx.accountId, id);
    assertNotMirrorOwned(row.source, body);
    await assertReferencesBelongToAccount(this.prisma, ctx.accountId, body);
    const dto = toInternalUpdateDto(body);
    const updated = await this.expenses.update(ctx.accountId, row.id, dto);

    // Same re-check the app's ExpensesController runs after an amount or currency edit.
    if (updated && (dto.amount !== undefined || dto.currencyCode !== undefined)) {
      this.budgetAlerts
        .checkBudgetsForAccount(ctx.accountId, updated.currencyCode)
        .catch(logFireAndForget(this.logger, 'PublicExpenseWriteAdapter.checkBudgetsForAccount'));
    }
    return { id: row.id };
  }

  /**
   * A shared-group share row (`source: 'group'`) is deletable, exactly as in the app: the mirror
   * respects a user's delete and never recreates or touches that row (docs/wiki/features/shared-groups.md,
   * "Deleting is respected"); the app's `remove()` has no group check either.
   */
  async remove(ctx: PublicWriteContext, id: string): Promise<void> {
    const row = await getPublicExpense(this.prisma, ctx.accountId, id);
    await this.expenses.remove(ctx.accountId, row.id);
  }
}
