import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import type { PublicBudgetCreateDto, PublicBudgetUpdateDto } from './dto/public-budget.dto';
import { PublicApiError } from './public-api-error';
import { isPublicCategory } from './public-categories.query';
import { requirePublicBudgetId } from './public-budgets.query';
import { findOwnByIdempotencyKey } from './public-idempotency.util';
import {
  fetchAccountCurrency,
  parseIdempotencyKey,
  type PublicWriteContext,
} from './public-write.shared';

/**
 * The public API's budget WRITE path: public snake_case body → the app's internal budget payload,
 * then `BudgetsService` — never Prisma directly. A budget has no category of its own; scope exists
 * only through allocations, written as a full set. Allocation totals are deliberately NOT checked
 * against the budget amount: the app has no such rule.
 */

interface InternalBudgetPayload {
  name?: string;
  amount?: number;
  currencyCode?: string;
  period?: string;
  startDate?: string;
  endDate?: string;
  alertThreshold?: number;
  categories?: { categoryId: string; amount: number }[];
}

const toCategories = (allocations: { category_id: string; amount: string }[]) =>
  allocations.map((a) => ({ categoryId: a.category_id, amount: Number(a.amount) }));

export function toInternalBudgetCreateDto(
  body: PublicBudgetCreateDto,
  opts: { idempotencyKey: string; baseCurrency: string }
) {
  return {
    localId: opts.idempotencyKey,
    name: body.name,
    amount: Number(body.amount),
    currencyCode: body.currency ?? opts.baseCurrency,
    period: body.period,
    startDate: body.start_date,
    endDate: body.end_date,
    alertThreshold: body.alert_threshold,
    categories: body.allocations ? toCategories(body.allocations) : undefined,
  };
}

/** Only the fields present in the body; `categories` only when `allocations` is (`[]` clears the set). */
export function toInternalBudgetUpdateDto(body: PublicBudgetUpdateDto): InternalBudgetPayload {
  const dto: InternalBudgetPayload = {};
  if (body.name !== undefined) dto.name = body.name;
  if (body.amount !== undefined) dto.amount = Number(body.amount);
  if (body.currency !== undefined) dto.currencyCode = body.currency;
  if (body.period !== undefined) dto.period = body.period;
  if (body.start_date !== undefined) dto.startDate = body.start_date;
  if (body.end_date !== undefined) dto.endDate = body.end_date;
  if (body.alert_threshold !== undefined) dto.alertThreshold = body.alert_threshold;
  if (body.allocations !== undefined) dto.categories = toCategories(body.allocations);
  return dto;
}

@Injectable()
export class PublicBudgetWriteAdapter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgets: BudgetsService
  ) {}

  /** Every allocation category must be a live expense category of THIS account; all failures at once. */
  private async assertAllocations(
    accountId: string,
    allocations: { category_id: string }[] | undefined
  ): Promise<void> {
    if (!allocations || allocations.length === 0) return;
    const ok = await Promise.all(
      allocations.map((a) => isPublicCategory(this.prisma, accountId, a.category_id, 'expense'))
    );
    const fields: Record<string, string[]> = {};
    const add = (i: number, message: string) => {
      (fields[`allocations[${i}].category_id`] ??= []).push(message);
    };
    ok.forEach((valid, i) => {
      if (!valid) add(i, "category_id must be one of this account's expense categories");
    });
    // The app keeps one allocation per category (`@@unique([budgetId, categoryId])`) and the
    // service would silently keep only the last of a repeated id, dropping the earlier amount.
    const seen = new Set<string>();
    allocations.forEach((a, i) => {
      const id = a.category_id.toLowerCase();
      if (seen.has(id)) add(i, 'duplicate category_id');
      seen.add(id);
    });
    if (Object.keys(fields).length > 0) {
      throw new PublicApiError(
        422,
        'validation_failed',
        'The request references records that are not in this account.',
        { fields }
      );
    }
  }

  /**
   * Creates the budget, or — when this app already created one with this `Idempotency-Key` in this
   * account — returns that one untouched with `isNew: false` (the repeat's body is ignored).
   */
  async create(
    ctx: PublicWriteContext,
    rawKey: string | string[] | undefined,
    body: PublicBudgetCreateDto
  ) {
    const key = parseIdempotencyKey(rawKey);

    const existingId = await findOwnByIdempotencyKey(this.prisma.budget, ctx, key, {
      noun: 'budget',
      hasPlanned: false,
    });
    if (existingId) return { id: existingId, isNew: false };

    await this.assertAllocations(ctx.accountId, body.allocations);
    const baseCurrency = body.currency ?? (await fetchAccountCurrency(this.prisma, ctx.accountId));
    const dto = toInternalBudgetCreateDto(body, { idempotencyKey: key, baseCurrency });

    const { budget, isNew } = await this.budgets.createWithStatus(ctx.accountId, ctx.userId, dto, {
      createdByOAuthClientId: ctx.clientDbId,
    });
    if (!budget) throw new Error('BudgetsService.createWithStatus returned no budget');
    return { id: budget.id as string, isNew };
  }

  async update(ctx: PublicWriteContext, id: string, body: PublicBudgetUpdateDto) {
    const budgetId = await requirePublicBudgetId(this.prisma, ctx.accountId, id);
    await this.assertAllocations(ctx.accountId, body.allocations);
    await this.budgets.update(ctx.accountId, budgetId, toInternalBudgetUpdateDto(body));
    return { id: budgetId };
  }

  async remove(ctx: PublicWriteContext, id: string): Promise<void> {
    const budgetId = await requirePublicBudgetId(this.prisma, ctx.accountId, id);
    await this.budgets.remove(ctx.accountId, budgetId);
  }
}
