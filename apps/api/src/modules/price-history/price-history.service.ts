import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type {
  PriceHistoryResponse,
  PriceHistoryProduct,
  ProductListItem,
  StoreLatestPrice,
} from '@budget/shared-types';

type Period = '3m' | '6m' | '12m';

interface RawItemRow {
  rawName: string;       // original expense_items.canonical_name, before alias resolution
  resolvedName: string;
  date: Date;
  unitPrice: number;
  merchant: string;
  currency: string;
}

@Injectable()
export class PriceHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getPriceHistory(accountId: string, period: Period = '6m'): Promise<PriceHistoryResponse> {
    const cacheKey = `ph:${accountId}:${period}`;
    const cached = await this.cache.get<PriceHistoryResponse>(cacheKey);
    if (cached) return cached;

    const rows = await this.fetchRows(accountId);
    const currency = this.resolveMajorityCurrency(rows);
    const filtered = rows.filter((r) => r.currency === currency);
    const { inflationIndex, productCount, products } = this.computeInflationIndex(filtered, period);

    const result: PriceHistoryResponse = { inflationIndex, period, productCount, currency, products };
    await this.cache.set(cacheKey, result, 300);
    return result;
  }

  async listProducts(accountId: string): Promise<ProductListItem[]> {
    const aliases = await this.getAliasMap(accountId);
    const items: Array<{ canonicalName: string; expense: { date: Date } }> =
      await (this.prisma as any).expenseItem.findMany({
        where: {
          expense: { accountId, isDeleted: false },
          canonicalName: { not: null },
          isDeleted: false,
        },
        select: { canonicalName: true, expense: { select: { date: true } } },
      });

    const productMap = new Map<string, { count: number; lastSeen: Date }>();
    for (const item of items) {
      const raw = item.canonicalName as string;
      const existing = productMap.get(raw) ?? { count: 0, lastSeen: new Date(0) };
      existing.count += 1;
      const expDate = (item as any).expense?.date ?? new Date(0);
      if (expDate > existing.lastSeen) existing.lastSeen = expDate;
      productMap.set(raw, existing);
    }

    return Array.from(productMap.entries())
      .map(([rawName, { count, lastSeen }]) => ({
        rawName,
        canonicalName: aliases.get(rawName) ?? rawName,
        purchaseCount: count,
        lastSeen: lastSeen.toISOString().slice(0, 10),
      }))
      .sort((a, b) => b.purchaseCount - a.purchaseCount);
  }

  async upsertAlias(accountId: string, rawName: string, canonicalName: string): Promise<void> {
    await (this.prisma as any).productAlias.upsert({
      where: { accountId_rawName: { accountId, rawName } },
      create: { accountId, rawName, canonicalName },
      update: { canonicalName },
    });
  }

  async deleteAlias(accountId: string, rawName: string): Promise<void> {
    await (this.prisma as any).productAlias.deleteMany({ where: { accountId, rawName } });
  }

  async mergeProducts(accountId: string, rawNames: string[], canonicalName: string): Promise<void> {
    await this.prisma.$transaction(
      rawNames.map((rawName) =>
        (this.prisma as any).productAlias.upsert({
          where: { accountId_rawName: { accountId, rawName } },
          create: { accountId, rawName, canonicalName },
          update: { canonicalName },
        }),
      ),
    );
  }

  // ── private helpers ──────────────────────────────────────────────────────

  private async fetchRows(accountId: string): Promise<RawItemRow[]> {
    const aliases = await this.getAliasMap(accountId);
    const items: Array<{
      canonicalName: string;
      unitPrice: number;
      expense: { date: Date; merchant: string | null; currencyCode: string };
    }> = await (this.prisma as any).expenseItem.findMany({
      where: {
        expense: { accountId, isDeleted: false },
        canonicalName: { not: null },
        isDeleted: false,
      },
      select: {
        canonicalName: true,
        unitPrice: true,
        expense: { select: { date: true, merchant: true, currencyCode: true } },
      },
    });

    return items.map((item) => ({
      rawName: item.canonicalName,
      resolvedName: aliases.get(item.canonicalName) ?? item.canonicalName,
      date: item.expense.date,
      unitPrice: Number(item.unitPrice),
      merchant: item.expense.merchant ?? 'Unknown',
      currency: item.expense.currencyCode ?? 'PLN',
    }));
  }

  private async getAliasMap(accountId: string): Promise<Map<string, string>> {
    const aliases: Array<{ rawName: string; canonicalName: string }> =
      await (this.prisma as any).productAlias.findMany({
        where: { accountId },
        select: { rawName: true, canonicalName: true },
      });
    return new Map(aliases.map((a) => [a.rawName, a.canonicalName]));
  }

  private resolveMajorityCurrency(rows: Pick<RawItemRow, 'currency'>[]): string {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
    if (counts.size === 0) return 'PLN';
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }

  /**
   * Returns the last day of the calendar month that is `monthsBack` months before `now`.
   * e.g. now=2026-07-02, monthsBack=6 → 2026-01-31 (last day of January)
   * This is the split boundary: base = [2N months back .. N months back], current = [N months back .. now].
   */
  private lastDayOfMonthNBack(now: Date, monthsBack: number): Date {
    const d = new Date(now);
    d.setDate(1); // First of current month
    d.setMonth(d.getMonth() - monthsBack + 1); // First of the month (monthsBack-1) before
    d.setDate(0); // Last day of the target month
    return d;
  }

  private computeInflationIndex(
    rows: RawItemRow[],
    period: Period,
    now: Date = new Date(),
  ): { inflationIndex: number | null; productCount: number; products: PriceHistoryProduct[] } {
    const months = { '3m': 3, '6m': 6, '12m': 12 }[period];
    // periodStart = last day of the Nth month before now
    // e.g. now=2026-07-02, 6m → 2026-01-31
    const periodStart = this.lastDayOfMonthNBack(now, months);
    // baseStart = last day of the 2Nth month before now
    // e.g. now=2026-07-02, 6m → 2025-07-31
    const baseStart = this.lastDayOfMonthNBack(now, months * 2);

    // Group by resolved name; track first rawName per group for alias writes
    const byProduct = new Map<string, RawItemRow[]>();
    const rawNameByProduct = new Map<string, string>();
    for (const row of rows) {
      const existing = byProduct.get(row.resolvedName) ?? [];
      existing.push(row);
      byProduct.set(row.resolvedName, existing);
      if (!rawNameByProduct.has(row.resolvedName)) {
        rawNameByProduct.set(row.resolvedName, row.rawName);
      }
    }

    const products: PriceHistoryProduct[] = [];
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [name, items] of byProduct.entries()) {
      const baseItems = items.filter((i) => i.date >= baseStart && i.date < periodStart);
      const currentItems = items.filter((i) => i.date >= periodStart && i.date <= now);

      if (baseItems.length === 0 || currentItems.length === 0) continue;

      const baseAvg = baseItems.reduce((s, i) => s + i.unitPrice, 0) / baseItems.length;
      const currentAvg = currentItems.reduce((s, i) => s + i.unitPrice, 0) / currentItems.length;
      const priceChangePct = ((currentAvg - baseAvg) / baseAvg) * 100;
      const weight = baseAvg * baseItems.length;

      weightedSum += weight * priceChangePct;
      totalWeight += weight;

      // Store comparison: latest price per merchant (sorted by date ascending)
      const storeMap = new Map<string, StoreLatestPrice>();
      for (const item of [...baseItems, ...currentItems].sort(
        (a, b) => a.date.getTime() - b.date.getTime(),
      )) {
        storeMap.set(item.merchant, {
          merchantName: item.merchant,
          latestPrice: item.unitPrice,
          latestDate: item.date.toISOString().slice(0, 10),
        });
      }

      products.push({
        rawName: rawNameByProduct.get(name) ?? name,
        canonicalName: name,
        priceChangePct: Math.round(priceChangePct * 10) / 10,
        currentAvgPrice: Math.round(currentAvg * 100) / 100,
        baseAvgPrice: Math.round(baseAvg * 100) / 100,
        currency: items[0].currency,
        purchaseCount: items.length,
        stores: [...storeMap.values()].sort((a, b) => a.latestPrice - b.latestPrice),
        pricePoints: items
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .map((i) => ({
            date: i.date.toISOString().slice(0, 10),
            price: i.unitPrice,
            merchant: i.merchant,
          })),
      });
    }

    products.sort((a, b) => Math.abs(b.priceChangePct) - Math.abs(a.priceChangePct));
    const productCount = products.length;
    const inflationIndex =
      productCount >= 3 && totalWeight > 0
        ? Math.round((weightedSum / totalWeight) * 10) / 10
        : null;

    return { inflationIndex, productCount, products };
  }
}
