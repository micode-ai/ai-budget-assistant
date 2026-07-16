import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { computeBasket, BasketRow } from './basket-calculator';
import type {
  PriceHistoryResponse,
  PriceHistoryProduct,
  PriceHistoryPeriod,
  ProductListItem,
  StoreLatestPrice,
  BasketCompareItem,
  BasketCompareResponse,
} from '@budget/shared-types';

type Period = PriceHistoryPeriod;

// Sentinel stored in product_aliases.canonical_name to exclude a product from all tracking.
// No migration needed — reuses the existing non-null canonicalName column.
const IGNORED_SENTINEL = '__ignored__';

interface RawItemRow {
  id: string;
  rawName: string;       // original expense_items.canonical_name, before alias resolution
  resolvedName: string;
  date: Date;
  unitPrice: number;
  merchant: string;
  currency: string;
  locationLat?: number | null;
  locationLng?: number | null;
}

export interface ProductTrendRow {
  canonicalName: string;             // resolved name
  currency: string;                  // native currency of the latest purchase
  points: { date: string; price: number }[];   // sorted ascending by date
  purchaseDates: Date[];             // sorted ascending
  currentBestPrice: number;          // latest personal unit price (used as the current price for the forecast)
  latestMerchant: string;
}

const AI_BACKFILL_BATCH = 50;
const AI_BACKFILL_MAX_UNIQUE = 500;

@Injectable()
export class PriceHistoryService {
  private readonly logger = new Logger(PriceHistoryService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

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

  /**
   * Per-product price series over the account's full history, for the Inflation
   * Shield. Reuses fetchRows (alias resolution + per-unit price already handled).
   */
  async getProductTrends(accountId: string): Promise<ProductTrendRow[]> {
    const rows = await this.fetchRows(accountId);
    const byProduct = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byProduct.get(r.resolvedName) ?? [];
      arr.push(r);
      byProduct.set(r.resolvedName, arr);
    }
    const out: ProductTrendRow[] = [];
    for (const [name, items] of byProduct.entries()) {
      const sorted = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());
      const latest = sorted[sorted.length - 1];
      out.push({
        canonicalName: name,
        currency: latest.currency,
        points: sorted.map((i) => ({ date: i.date.toISOString().slice(0, 10), price: i.unitPrice })),
        purchaseDates: sorted.map((i) => i.date),
        currentBestPrice: latest.unitPrice,
        latestMerchant: latest.merchant,
      });
    }
    return out;
  }

  async getBasketComparison(
    accountId: string,
    items: BasketCompareItem[],
    origin?: { lat: number; lng: number },
  ): Promise<BasketCompareResponse> {
    const rows = await this.fetchRows(accountId);
    // Most-recent geo-tagged expense per merchant → store coords
    const storeCoords = new Map<string, { lat: number; lng: number; date: Date }>();
    for (const r of rows) {
      if (r.locationLat == null || r.locationLng == null) continue;
      const cur = storeCoords.get(r.merchant);
      if (!cur || r.date > cur.date) storeCoords.set(r.merchant, { lat: r.locationLat, lng: r.locationLng, date: r.date });
    }
    const coordMap = new Map([...storeCoords].map(([m, c]) => [m, { lat: c.lat, lng: c.lng }]));
    return computeBasket(rows as unknown as BasketRow[], items, new Date(), coordMap, origin);
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

    // Accumulate by rawName first, then group by resolved canonicalName
    const rawMap = new Map<string, { count: number; lastSeen: Date }>();
    for (const item of items) {
      const raw = item.canonicalName as string;
      const existing = rawMap.get(raw) ?? { count: 0, lastSeen: new Date(0) };
      existing.count += 1;
      const expDate = (item as any).expense?.date ?? new Date(0);
      if (expDate > existing.lastSeen) existing.lastSeen = expDate;
      rawMap.set(raw, existing);
    }

    // Group by resolved canonicalName so merged products appear as one row
    const canonicalMap = new Map<
      string,
      { rawNames: string[]; count: number; lastSeen: Date }
    >();
    for (const [rawName, stats] of rawMap.entries()) {
      const resolved = aliases.get(rawName) ?? rawName;
      if (resolved === IGNORED_SENTINEL) continue;
      const existing = canonicalMap.get(resolved) ?? {
        rawNames: [],
        count: 0,
        lastSeen: new Date(0),
      };
      existing.rawNames.push(rawName);
      existing.count += stats.count;
      if (stats.lastSeen > existing.lastSeen) existing.lastSeen = stats.lastSeen;
      canonicalMap.set(resolved, existing);
    }

    return Array.from(canonicalMap.entries())
      .map(([canonicalName, { rawNames, count, lastSeen }]) => ({
        rawName: rawNames[0],
        rawNames,
        canonicalName,
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
    await this.invalidatePriceHistoryCache(accountId);
  }

  async deleteAlias(accountId: string, rawName: string): Promise<void> {
    await (this.prisma as any).productAlias.deleteMany({ where: { accountId, rawName } });
    await this.invalidatePriceHistoryCache(accountId);
  }

  async ignoreProduct(accountId: string, rawName: string): Promise<void> {
    await (this.prisma as any).productAlias.upsert({
      where: { accountId_rawName: { accountId, rawName } },
      create: { accountId, rawName, canonicalName: IGNORED_SENTINEL },
      update: { canonicalName: IGNORED_SENTINEL },
    });
    await this.invalidatePriceHistoryCache(accountId);
  }

  async deletePricePoint(accountId: string, itemId: string): Promise<void> {
    // Verify ownership before mutating
    const item = await (this.prisma as any).expenseItem.findFirst({
      where: { id: itemId, expense: { accountId, isDeleted: false }, isDeleted: false },
      select: { id: true },
    });
    if (!item) throw new Error('Not found');
    // Clear canonicalName so the point is excluded from all price-history queries
    await (this.prisma as any).expenseItem.update({
      where: { id: itemId },
      data: { canonicalName: null },
    });
    await this.invalidatePriceHistoryCache(accountId);
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
    await this.invalidatePriceHistoryCache(accountId);
  }

  async backfillWithAi(accountId: string): Promise<{ updatedCount: number }> {
    if (!process.env.OPENAI_API_KEY) {
      this.logger.warn('OPENAI_API_KEY not set — skipping AI backfill');
      return { updatedCount: 0 };
    }

    // Exclude rawNames that the user has already aliased (rename/merge) — backfill must not
    // overwrite them, because the alias key is the canonical_name value in expense_items;
    // changing that value orphans the alias and silently breaks the merge.
    const userAliasedNames: string[] = (
      await (this.prisma as any).productAlias.findMany({
        where: { accountId },
        select: { rawName: true },
      })
    ).map((a: { rawName: string }) => a.rawName);

    // Fetch items with no or single-word canonical names (not yet aliased by user)
    const items: Array<{ id: string; description: string | null; canonicalName: string | null }> =
      await (this.prisma as any).expenseItem.findMany({
        where: {
          expense: { accountId, isDeleted: false },
          // ExpenseItem.description is a required (non-nullable) String, so
          // `{ not: null }` is a Prisma validation error ("Argument `not` must
          // not be null") — it crashed backfill-ai (ABA-315). Skip empty
          // descriptions (nothing usable to generate a canonical name from).
          description: { not: '' },
          isDeleted: false,
          // Skip any item whose canonical_name is the key of a user alias
          ...(userAliasedNames.length > 0
            ? { NOT: { canonicalName: { in: userAliasedNames } } }
            : {}),
          OR: [
            { canonicalName: null },
            // Single-word names have no space — multi-word LLM names are preserved
            { canonicalName: { not: { contains: ' ' } } },
          ],
        },
        select: { id: true, description: true, canonicalName: true },
      });

    if (items.length === 0) return { updatedCount: 0 };

    // Deduplicate descriptions to minimise API calls
    const descToIds = new Map<string, string[]>();
    for (const item of items) {
      const desc = item.description?.trim();
      if (!desc) continue;
      const existing = descToIds.get(desc) ?? [];
      existing.push(item.id);
      descToIds.set(desc, existing);
    }

    const uniqueDescs = [...descToIds.keys()].slice(0, AI_BACKFILL_MAX_UNIQUE);
    let updatedCount = 0;

    for (let i = 0; i < uniqueDescs.length; i += AI_BACKFILL_BATCH) {
      const batch = uniqueDescs.slice(i, i + AI_BACKFILL_BATCH);
      let names: string[];
      try {
        names = await this.extractCanonicalNames(batch);
      } catch (err) {
        this.logger.warn('AI backfill batch failed', err);
        continue;
      }

      for (let j = 0; j < batch.length; j++) {
        const name = names[j]?.trim();
        if (!name) continue;
        const ids = descToIds.get(batch[j]) ?? [];
        if (ids.length === 0) continue;
        const result = await (this.prisma as any).expenseItem.updateMany({
          where: { id: { in: ids } },
          data: { canonicalName: name },
        });
        updatedCount += result.count;
      }
    }

    return { updatedCount };
  }

  // ── private helpers ──────────────────────────────────────────────────────

  private async invalidatePriceHistoryCache(accountId: string): Promise<void> {
    await this.cache.delByPrefix(`ph:${accountId}:`);
  }

  private async fetchRows(accountId: string): Promise<RawItemRow[]> {
    const aliases = await this.getAliasMap(accountId);
    const items: Array<{
      id: string;
      canonicalName: string;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
      expense: {
        date: Date;
        merchant: string | null;
        currencyCode: string;
        locationLat?: number | string | null;
        locationLng?: number | string | null;
      };
    }> = await (this.prisma as any).expenseItem.findMany({
      where: {
        expense: { accountId, isDeleted: false },
        canonicalName: { not: null },
        isDeleted: false,
      },
      select: {
        id: true,
        canonicalName: true,
        unitPrice: true,
        quantity: true,
        totalPrice: true,
        expense: {
          select: { date: true, merchant: true, currencyCode: true, locationLat: true, locationLng: true },
        },
      },
      orderBy: [{ expense: { date: 'asc' } }, { id: 'asc' }],
    });

    return items
      .filter((item) => (aliases.get(item.canonicalName) ?? '') !== IGNORED_SENTINEL)
      .map((item) => ({
        id: item.id,
        rawName: item.canonicalName,
        resolvedName: aliases.get(item.canonicalName) ?? item.canonicalName,
        date: item.expense.date,
        // When quantity > 1 (e.g. "JOGURT 2SZT 6.98"), derive per-unit price from totalPrice.
        // When quantity <= 1 (single unit or weight-based), unitPrice is already correct.
        unitPrice:
          Number(item.quantity) > 1
            ? Number(item.totalPrice) / Number(item.quantity)
            : Number(item.unitPrice),
        merchant: item.expense.merchant ?? 'Unknown',
        currency: item.expense.currencyCode ?? 'PLN',
        // Decimal? columns → Number(...); null/undefined stay null
        locationLat: item.expense.locationLat != null ? Number(item.expense.locationLat) : null,
        locationLng: item.expense.locationLng != null ? Number(item.expense.locationLng) : null,
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
    // Period semantics: the chip label = the TOTAL window of data examined.
    // Split point = midpoint of that window.
    //   3m  → base=[3 months ago .. 1.5m ago], current=[1.5m ago .. now]
    //   6m  → base=[6 months ago .. 3m ago],   current=[3m ago .. now]
    //   12m → base=[12 months ago .. 6m ago],  current=[6m ago .. now]
    //   all → base=[earliest date .. midpoint], current=[midpoint .. now]
    let baseStart: Date;
    let periodStart: Date;

    if (period === 'all') {
      const allDates = rows.map((r) => r.date);
      if (allDates.length === 0) {
        return { inflationIndex: null, productCount: 0, products: [] };
      }
      const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
      const midMs = (minDate.getTime() + now.getTime()) / 2;
      periodStart = new Date(midMs);
      baseStart = minDate;
    } else {
      const months = { '3m': 3, '6m': 6, '12m': 12 }[period];
      // Math.round: 3m→2, 6m→3, 12m→6 (nearest whole month for the midpoint)
      const halfMonths = Math.round(months / 2);
      // periodStart = last day of the (N/2)th month before now
      // e.g. now=2026-07-02, 6m → 2026-04-30 (3 months back)
      periodStart = this.lastDayOfMonthNBack(now, halfMonths);
      // baseStart = last day of the Nth month before now
      // e.g. now=2026-07-02, 6m → 2026-01-31 (6 months back)
      baseStart = this.lastDayOfMonthNBack(now, months);
    }

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
            itemId: i.id,
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

  private async extractCanonicalNames(descriptions: string[]): Promise<string[]> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: descriptions.length * 20,
      messages: [
        {
          role: 'system',
          content: `You extract clean canonical product names from grocery receipt OCR text.
Rules:
- Return ONLY brand + product variant (e.g. "Activia Truskawkowy", "Mleko Łaciate 3.2%", "Heinz Ketchup")
- Remove: weight (125G, 500ML, 6SZT), unit prices (3,49), store codes, percentages that are nutrition specs unless they identify the product variant (e.g. 3.2% fat milk → keep 3.2%)
- Keep: brand name, product type, key variant (flavor, key spec)
- Use Title Case
- One name per line, same order as input — no numbering, no extra lines
- Unknown/unclear → best guess product type`,
        },
        {
          role: 'user',
          content: descriptions.join('\n'),
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? '';
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    // Ensure count matches input (pad with empty strings if response is short)
    while (lines.length < descriptions.length) lines.push('');
    return lines.slice(0, descriptions.length);
  }
}
