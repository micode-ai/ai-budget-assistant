import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { getRatesSafe, unitRate } from '../../common/utils/fx';
import { resolveGroupShares } from './group-ledger';
import {
  convertAtRate,
  isAllowedEntryCurrency,
  planExpenseFxEdit,
  resolveConvertedShares,
  type ConversionResult,
  type FxRateSource,
} from './group-fx';
import { GroupExpenseShareInputDto, UpdateGroupExpenseDto } from './dto';
import type { GroupFxPreview } from '@budget/shared-types';

/** ABA-654 review M2: the widest a manual rate may sit from the provider's, either way. */
export const FX_MANUAL_RATE_FACTOR = 3;
export const MAX_SHARES = 20;

/** The stored money columns of a group expense that an edit is planned from. */
export interface StoredFxFigures {
  amount: unknown;
  originalAmount: unknown;
  originalCurrency: string | null;
  fxRate: unknown;
}

/**
 * Entry-currency conversion and share resolution for group expenses (ABA-654). It reads the group's
 * currency and the provider's rates and never writes, so GroupsService and the itemised-expense
 * service both build on it without depending on each other. The pure maths is in `group-fx.ts`.
 */
@Injectable()
export class GroupFxService {
  constructor(
    private readonly prisma: PrismaService,
    // The existing singleton (CurrencyExchangeModule), never a second instance (ABA-654).
    private readonly rates: ExchangeRateService,
  ) {}

  resolveShares(amount: number, splitType: string, shares: GroupExpenseShareInputDto[]) {
    const ids = shares.map((s) => s.memberId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate share member');
    if (ids.length === 0 || ids.length > MAX_SHARES) throw new BadRequestException('Invalid number of shares');
    try {
      return resolveGroupShares(amount, splitType as any, shares);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid split');
    }
  }

  async groupCurrencyOf(groupId: string): Promise<string> {
    const g = await this.prisma.expenseGroup.findUnique({ where: { id: groupId }, select: { currencyCode: true } });
    if (!g) throw new NotFoundException('Group not found');
    return g.currencyCode;
  }

  private fxUnavailable(): BadRequestException {
    return new BadRequestException({
      code: 'FX_RATE_UNAVAILABLE',
      message: 'No exchange rate is available for that currency right now. Enter the rate or try again later.',
    });
  }

  assertEntryCurrency(code: string, groupCurrency: string): void {
    if (!isAllowedEntryCurrency(code, groupCurrency)) {
      throw new BadRequestException({ code: 'CURRENCY_UNSUPPORTED', message: 'That currency is not supported' });
    }
  }

  /** The provider's current unit rate (1 `currency` in `groupCurrency`), or null when unknown. */
  private async providerRate(currency: string, groupCurrency: string): Promise<number | null> {
    if (currency === groupCurrency) return 1;
    return unitRate(currency, groupCurrency, await getRatesSafe(this.rates, groupCurrency));
  }

  /**
   * ABA-654: converts ONCE, at write time. A manual rate wins; otherwise the provider's rate at entry
   * time (it has no history). An unknown rate is a 400 FX_RATE_UNAVAILABLE, never a silently
   * unconverted amount.
   */
  async convertEntry(
    entryAmount: number,
    currency: string,
    groupCurrency: string,
    manualRate?: number,
  ): Promise<Extract<ConversionResult, { ok: true }>> {
    this.assertEntryCurrency(currency, groupCurrency);
    let rate: number | null;
    let source: FxRateSource;
    if (currency !== groupCurrency && manualRate !== undefined) {
      // ABA-654 review M2: a manual rate is bounded to within 3x of the provider's in either direction
      // (it exists for a cash exchange or a card's own rate, not for moving a debt). With no provider
      // rate for the pair there is nothing to compare against and the manual rate stands.
      const reference = await this.providerRate(currency, groupCurrency);
      if (reference !== null && (manualRate > reference * FX_MANUAL_RATE_FACTOR || manualRate < reference / FX_MANUAL_RATE_FACTOR)) {
        throw new BadRequestException({
          code: 'FX_RATE_IMPLAUSIBLE',
          message: 'That exchange rate is far from the current market rate. Check it and try again.',
        });
      }
      rate = manualRate;
      source = 'manual';
    } else {
      rate = await this.providerRate(currency, groupCurrency);
      source = 'provider';
    }
    if (rate === null) throw this.fxUnavailable();
    return this.checked(convertAtRate(entryAmount, currency, groupCurrency, rate, source, new Date()));
  }

  checked(r: ConversionResult): Extract<ConversionResult, { ok: true }> {
    if (!r.ok) {
      throw new BadRequestException({ code: 'FX_AMOUNT_OUT_OF_RANGE', message: 'The converted amount is out of range' });
    }
    return r;
  }

  /** The usual id / count / split checks, then the FX-aware resolution (exact values as weights). */
  resolveFxShares(
    amount: number,
    originalAmount: number | null,
    splitType: string,
    shares: GroupExpenseShareInputDto[],
  ) {
    if (originalAmount === null) return this.resolveShares(amount, splitType, shares);
    this.resolveShares(originalAmount, splitType, shares);
    try {
      return resolveConvertedShares(amount, originalAmount, splitType as any, shares);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid split');
    }
  }

  /** GET /groups/:groupId/fx-preview?currency= — the provider rate the app's form shows (ABA-654). */
  async fxPreview(groupId: string, currency: string): Promise<GroupFxPreview> {
    const groupCurrency = await this.groupCurrencyOf(groupId);
    this.assertEntryCurrency(currency, groupCurrency);
    return { groupCurrency, currencyCode: currency, rate: await this.providerRate(currency, groupCurrency) };
  }

  /**
   * ABA-654 edit rule: a new amount reuses the stored rate, a new currency fetches a new one (or takes
   * the override), anything else touches no figures. Never a "refresh the rate" re-conversion. Shared
   * by the plain and the itemised edit.
   */
  async resolveEditFigures(groupId: string, expense: StoredFxFigures, dto: UpdateGroupExpenseDto) {
    const groupCurrency = await this.groupCurrencyOf(groupId);
    const stored = {
      amount: Number(expense.amount),
      originalAmount: expense.originalAmount == null ? null : Number(expense.originalAmount),
      originalCurrency: expense.originalCurrency ?? null,
      fxRate: expense.fxRate == null ? null : Number(expense.fxRate),
    };
    if (dto.currencyCode !== undefined) this.assertEntryCurrency(dto.currencyCode, groupCurrency);
    const plan = planExpenseFxEdit(stored, groupCurrency, dto);
    let amount: number;
    let originalAmount: number | null;
    let fxData: Record<string, unknown> = {};
    if (plan.kind === 'keep') {
      amount = stored.amount;
      originalAmount = stored.originalCurrency ? stored.originalAmount : null;
    } else if (plan.kind === 'reuse') {
      const r = this.checked(
        convertAtRate(plan.entryAmount, stored.originalCurrency as string, groupCurrency, stored.fxRate as number, 'provider', new Date()),
      );
      // Only the amounts move; the rate, its source and its timestamp stay as first recorded.
      amount = r.amount;
      originalAmount = r.fx.originalAmount;
      fxData = { originalAmount };
    } else {
      const r =
        plan.kind === 'group'
          ? await this.convertEntry(plan.entryAmount, groupCurrency, groupCurrency)
          : await this.convertEntry(plan.entryAmount, plan.currency, groupCurrency, plan.kind === 'manual' ? plan.rate : undefined);
      amount = r.amount;
      originalAmount = r.fx.originalAmount;
      fxData = { ...r.fx };
    }
    return { amount, originalAmount, fxData };
  }
}
