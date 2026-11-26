import { Injectable, NotFoundException } from '@nestjs/common';
import type { UtilityKind, UtilitySummary, UtilityUnit } from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { convertAmount, getRatesSafe } from '../../common/utils/fx';
import { UpsertUtilityReadingDto } from './dto';
import { computeUtilityStats } from './utility-stats.util';

@Injectable()
export class UtilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  private expenseWhere(accountId: string, idOrClientId: string) {
    return { accountId, isDeleted: false, OR: [{ id: idOrClientId }, { clientId: idOrClientId }] };
  }

  async findForExpense(accountId: string, expenseIdOrClientId: string) {
    return this.prisma.utilityReading.findFirst({
      where: { accountId, expense: this.expenseWhere(accountId, expenseIdOrClientId) },
    });
  }

  async upsert(accountId: string, expenseIdOrClientId: string, dto: UpsertUtilityReadingDto) {
    const expense = await this.prisma.expense.findFirst({
      where: this.expenseWhere(accountId, expenseIdOrClientId),
      select: { id: true, amount: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    const data = {
      kind: dto.kind,
      consumption: dto.consumption,
      unit: dto.unit,
      propertyLabel: dto.propertyLabel?.trim() || null,
      unitPrice: Math.round((Number(expense.amount) / dto.consumption) * 1e5) / 1e5,
    };
    // The RESOLVED expense PK is written, never the raw param.
    return this.prisma.utilityReading.upsert({
      where: { expenseId: expense.id },
      create: { accountId, expenseId: expense.id, ...data },
      update: data,
    });
  }

  async remove(accountId: string, expenseIdOrClientId: string) {
    const reading = await this.findForExpense(accountId, expenseIdOrClientId);
    if (!reading) throw new NotFoundException('Utility reading not found');
    await this.prisma.utilityReading.delete({ where: { id: reading.id } });
    return { success: true };
  }

  /** Display currency comes from the caller, never from a row. */
  async getSummary(accountId: string, baseCurrency = 'USD', property?: string): Promise<UtilitySummary> {
    const rows = await this.prisma.utilityReading.findMany({
      where: { accountId, expense: { accountId, isDeleted: false, isPlanned: false } },
      include: { expense: { select: { amount: true, currencyCode: true, date: true } } },
    });
    const properties = [...new Set(rows.map((r) => r.propertyLabel).filter((p): p is string => !!p))].sort();
    const scoped = property ? rows.filter((r) => r.propertyLabel === property) : rows;
    const rates = scoped.some((r) => r.expense.currencyCode !== baseCurrency)
      ? await getRatesSafe(this.exchangeRateService, baseCurrency)
      : null;
    let fxApproximate = false;
    const kinds = computeUtilityStats(
      scoped.map((r) => {
        const cost = convertAmount(Number(r.expense.amount), r.expense.currencyCode, baseCurrency, rates);
        if (cost === null) fxApproximate = true;
        return {
          date: r.expense.date,
          kind: r.kind as UtilityKind,
          unit: r.unit as UtilityUnit,
          consumption: Number(r.consumption),
          cost,
        };
      }),
    );
    return { currencyCode: baseCurrency, fxApproximate, kinds, properties };
  }
}
