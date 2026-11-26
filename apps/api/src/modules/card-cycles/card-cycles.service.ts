import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { currentCycle, lastClosedCycle, nextDueDate, daysUntil } from '../../common/utils/card-cycle';
import { UpsertCardCycleDto } from './dto';

export interface CardCycleSummary {
  accountId: string;
  currencyCode: string;
  statementDay: number;
  dueDay: number;
  creditLimit: number | null;
  /** Current cycle, `YYYY-MM-DD`. `cycleEnd` is the statement day. */
  cycleStart: string;
  cycleEnd: string;
  /** Spent in the current cycle (transaction date), card currency only. */
  spent: number;
  /** spent / creditLimit, null without a limit. Can exceed 1. */
  utilisation: number | null;
  /** Next payment due date and its distance in days. */
  dueDate: string;
  daysToDue: number;
  /** What the already-closed statement came to; null when its due date has passed. */
  statementAmount: number | null;
}

export function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Due date of the closed statement if still ahead (or today), else the one after the open cycle. */
export function resolveDue(today: Date, statementDay: number, dueDay: number) {
  const closed = lastClosedCycle(today, statementDay);
  const closedDue = nextDueDate(closed.end, dueDay);
  if (daysUntil(today, closedDue) >= 0) return { due: closedDue, closed, closedIsPayable: true };
  const cur = currentCycle(today, statementDay);
  return { due: nextDueDate(cur.end, dueDay), closed, closedIsPayable: false };
}

@Injectable()
export class CardCyclesService {
  constructor(private readonly prisma: PrismaService) {}

  async spentBetween(accountId: string, currencyCode: string, start: Date, end: Date): Promise<number> {
    const agg = await this.prisma.expense.aggregate({
      where: {
        accountId,
        currencyCode,
        isDeleted: false,
        isPlanned: false,
        isSplitReceivable: false,
        date: { gte: start, lte: end },
      },
      _sum: { amount: true },
    });
    return Number(agg._sum.amount ?? 0);
  }

  async buildSummary(
    setting: { accountId: string; currencyCode: string; statementDay: number; dueDay: number; creditLimit: unknown },
    today = new Date(),
  ): Promise<CardCycleSummary> {
    const cur = currentCycle(today, setting.statementDay);
    const { due, closed, closedIsPayable } = resolveDue(today, setting.statementDay, setting.dueDay);
    const [spent, statementAmount] = await Promise.all([
      this.spentBetween(setting.accountId, setting.currencyCode, cur.start, cur.end),
      closedIsPayable
        ? this.spentBetween(setting.accountId, setting.currencyCode, closed.start, closed.end)
        : Promise.resolve(null),
    ]);
    const limit = setting.creditLimit == null ? null : Number(setting.creditLimit);
    return {
      accountId: setting.accountId,
      currencyCode: setting.currencyCode,
      statementDay: setting.statementDay,
      dueDay: setting.dueDay,
      creditLimit: limit,
      cycleStart: ymd(cur.start),
      cycleEnd: ymd(cur.end),
      spent,
      utilisation: limit && limit > 0 ? spent / limit : null,
      dueDate: ymd(due),
      daysToDue: daysUntil(today, due),
      statementAmount,
    };
  }

  async list(accountId: string): Promise<CardCycleSummary[]> {
    const setting = await this.prisma.cardCycleSetting.findUnique({ where: { accountId } });
    return setting ? [await this.buildSummary(setting)] : [];
  }

  async upsert(accountId: string, _userId: string, dto: UpsertCardCycleDto): Promise<CardCycleSummary> {
    const data = {
      currencyCode: dto.currencyCode.toUpperCase(),
      statementDay: dto.statementDay,
      dueDay: dto.dueDay,
      creditLimit: dto.creditLimit ?? null,
      // A changed schedule must be allowed to remind again.
      lastRemindedDueDate: null,
    };
    const setting = await this.prisma.cardCycleSetting.upsert({
      where: { accountId },
      create: { accountId, ...data },
      update: data,
    });
    return this.buildSummary(setting);
  }

  async remove(accountId: string): Promise<{ success: true }> {
    await this.prisma.cardCycleSetting.deleteMany({ where: { accountId } });
    return { success: true };
  }
}
