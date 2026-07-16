import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** Minimal shape recorded per surfaced shield item (amounts already in base currency). */
export interface RecordableRecommendation {
  canonicalName: string;
  currentPrice: number;    // base
  projectedPrice: number;  // base
  quantity: number;
  projectedSaving: number; // base
}

@Injectable()
export class InflationShieldTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  private periodMonth(now: Date): string {
    return now.toISOString().slice(0, 7); // "YYYY-MM"
  }

  /**
   * Persist an `active` recommendation snapshot per surfaced item. Idempotent per
   * (account, product, month): the FIRST recommendation of the month wins (stable
   * "we told you at price X" basis) — a duplicate throws P2002 which we swallow.
   */
  async recordRecommendations(
    accountId: string,
    items: RecordableRecommendation[],
    baseCurrency: string,
    now: Date = new Date(),
  ): Promise<void> {
    const periodMonth = this.periodMonth(now);
    for (const it of items) {
      try {
        await this.prisma.inflationShieldRecommendation.create({
          data: {
            accountId,
            canonicalName: it.canonicalName,
            periodMonth,
            priceAtRec: it.currentPrice,
            projectedPrice: it.projectedPrice,
            qty: it.quantity,
            projectedSaving: it.projectedSaving,
            currencyCode: baseCurrency,
          },
        });
      } catch (e) {
        if (!isP2002(e)) throw e;
        // Already recorded this product this month — keep the original snapshot.
      }
    }
  }

  /**
   * When a receipt is created, credit any active recommendation whose product
   * the user actually bought (>= half the recommended quantity, purchased on/after
   * the recommendation date). Credits the projected saving as realized, scaled by
   * how much of the recommended quantity was bought (capped at 1). Fire-and-forget;
   * fail-silent by the caller. Matches canonicalName EXACTLY (v1 — aliased-product
   * matching is a follow-up).
   */
  async reconcilePurchase(accountId: string, expenseId: string): Promise<void> {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, accountId, isDeleted: false },
      select: {
        date: true,
        items: { where: { isDeleted: false, canonicalName: { not: null } }, select: { canonicalName: true, quantity: true } },
      },
    });
    if (!expense || expense.items.length === 0) return;

    const active = await this.prisma.inflationShieldRecommendation.findMany({
      where: { accountId, status: 'active' },
    });
    if (active.length === 0) return;

    // Sum bought quantity per canonicalName in this receipt.
    const boughtByName = new Map<string, number>();
    for (const it of expense.items) {
      const name = it.canonicalName as string;
      boughtByName.set(name, (boughtByName.get(name) ?? 0) + Number(it.quantity));
    }

    for (const rec of active) {
      const bought = boughtByName.get(rec.canonicalName);
      if (bought == null) continue;
      const recDay = new Date(rec.recommendedAt.toISOString().slice(0, 10)); // UTC midnight of the rec's day
      if (expense.date < recDay) continue;                                   // bought before the recommendation day
      if (bought < rec.qty * 0.5) continue;                 // bought too little to count
      const ratio = Math.min(bought / rec.qty, 1);
      const realized = Math.round(Number(rec.projectedSaving) * ratio * 100) / 100;
      await this.prisma.inflationShieldRecommendation.update({
        where: { id: rec.id },
        data: { status: 'acted', actedAt: new Date(), realizedSaving: realized },
      });
    }
  }

  /** Acted recommendations' realized savings + the currency each was recorded in. */
  async getActedRecommendations(accountId: string): Promise<Array<{ realizedSaving: number; currencyCode: string }>> {
    const rows = await this.prisma.inflationShieldRecommendation.findMany({
      where: { accountId, status: 'acted' },
      select: { realizedSaving: true, currencyCode: true },
    });
    return rows.map((r) => ({ realizedSaving: Number(r.realizedSaving ?? 0), currencyCode: r.currencyCode }));
  }
}
