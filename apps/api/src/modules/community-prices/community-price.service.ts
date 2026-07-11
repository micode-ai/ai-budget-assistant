import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { GeocodingService } from '../ai/services/geocoding.service';
import { normalizeMerchantPL } from '../import-bank/merchants/merchants-pl';
import { mondayOfWeek, regionBucket, computeContributorKey } from './community-price.util';
import { aggregateCommunityPrices, DEFAULT_K_ANONYMITY } from './community-price-calculator';
import type {
  CommunityPriceResponse,
  CommunityPricePeriod,
  CommunityProductSearchItem,
} from '@budget/shared-types';

// Read-path cache: anonymous aggregate data, so the key is global (not per-account).
const READ_CACHE_TTL_SEC = 300;

// Sentinel stored in product_aliases.canonical_name to exclude a product from all
// tracking — same convention as price-history.service.ts (kept as its own private
// copy there; not exported, so this is a deliberate local duplicate of the value).
const IGNORED_SENTINEL = '__ignored__';

/**
 * ABA-335 (Community Price Map). M1 built the anonymized
 * `community_price_observations` corpus from OCR'd receipt line items
 * (`recordContribution`, fire-and-forget + fail-silent). M2 adds the
 * k-anonymity-gated read path (`getCommunityPrices` / `searchProducts`), exposed
 * only through the Pro-gated CommunityPriceController.
 *
 * Privacy invariants (see schema.prisma model doc for the full rationale):
 *  - No accountId, userId, or expenseId is ever written to the observation row.
 *  - No user/contributor coordinates are stored — only the STORE's (point-of-
 *    sale) region, reverse-geocoded or grid-bucketed, never the exact address.
 *  - `contributorKey` is a salted one-way hash of accountId — used only for the
 *    one-vote-per-account-per-week dedup and the read-path k-anonymity gate;
 *    never exposed to any client.
 *  - Encrypted (E2EE) accounts are skipped: `merchant`/`canonicalName` would be
 *    ciphertext, which is neither usable for aggregation nor safe to persist
 *    into a cross-account global table.
 */
@Injectable()
export class CommunityPriceService {
  private readonly logger = new Logger(CommunityPriceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly geocoding: GeocodingService,
    private readonly cache: CacheService,
  ) {}

  /** k-anonymity threshold, overridable via COMMUNITY_PRICE_K env (min 2). */
  private getK(): number {
    const raw = parseInt(this.config.get<string>('COMMUNITY_PRICE_K') ?? '', 10);
    return Number.isFinite(raw) && raw >= 2 ? raw : DEFAULT_K_ANONYMITY;
  }

  /**
   * GET /price-history/community — k-anonymity-gated per-store price points for a
   * product, cheapest-first. `product` is an exact canonicalName (from the search
   * endpoint). Optional `region` scopes to one area; omitted = national.
   */
  async getCommunityPrices(
    product: string,
    region: string | null,
    period: CommunityPricePeriod,
  ): Promise<CommunityPriceResponse> {
    const normalizedProduct = product.trim();
    const weeks = period === '4w' ? 4 : 1;
    const cutoff = mondayOfWeek(new Date());
    cutoff.setDate(cutoff.getDate() - (weeks - 1) * 7);
    const weekLabel = cutoff.toISOString().slice(0, 10);

    const empty: CommunityPriceResponse = {
      product: normalizedProduct,
      region: region ?? null,
      currency: '',
      period,
      weekLabel,
      stores: [],
    };
    if (!normalizedProduct) return empty;

    const cacheKey = `cph:${createHash('sha1').update(normalizedProduct.toLowerCase()).digest('hex')}:${region ?? '*'}:${period}`;
    const cached = await this.cache.get<CommunityPriceResponse>(cacheKey);
    if (cached) return cached;

    const rows = await this.prisma.communityPriceObservation.findMany({
      where: {
        canonicalName: normalizedProduct,
        ...(region ? { region } : {}),
        weekStart: { gte: cutoff },
      },
      select: { merchantNormalized: true, price: true, currencyCode: true, contributorKey: true },
    });

    const { currency, stores } = aggregateCommunityPrices(
      rows.map((r) => ({
        merchantNormalized: r.merchantNormalized,
        price: Number(r.price),
        currencyCode: r.currencyCode,
        contributorKey: r.contributorKey,
      })),
      this.getK(),
    );

    const result: CommunityPriceResponse = {
      product: normalizedProduct,
      region: region ?? null,
      currency,
      period,
      weekLabel,
      stores,
    };
    await this.cache.set(cacheKey, result, READ_CACHE_TTL_SEC);
    return result;
  }

  /**
   * GET /price-history/community/products?q= — autocomplete over products that
   * currently satisfy the K-gate in at least one region. Returns only products
   * that are actually exposable, so the client never offers a dead query.
   */
  async searchProducts(q: string): Promise<CommunityProductSearchItem[]> {
    const term = q.trim();
    if (term.length < 2) return [];
    const k = this.getK();

    // One row per distinct (product, region, contributor). Nested maps count
    // distinct contributors per (product, region) — no string-key separator to
    // clash with product/region text.
    const groups = await this.prisma.communityPriceObservation.groupBy({
      by: ['canonicalName', 'region', 'contributorKey'],
      where: { canonicalName: { contains: term, mode: 'insensitive' } },
    });

    const byProduct = new Map<string, Map<string, Set<string>>>();
    for (const g of groups) {
      let regions = byProduct.get(g.canonicalName);
      if (!regions) {
        regions = new Map();
        byProduct.set(g.canonicalName, regions);
      }
      let contributors = regions.get(g.region);
      if (!contributors) {
        contributors = new Set();
        regions.set(g.region, contributors);
      }
      contributors.add(g.contributorKey);
    }

    const items: CommunityProductSearchItem[] = [];
    for (const [canonicalName, regions] of byProduct) {
      let regionsAvailable = 0;
      for (const contributors of regions.values()) {
        if (contributors.size >= k) regionsAvailable += 1; // region clears the K-gate
      }
      if (regionsAvailable > 0) items.push({ canonicalName, regionsAvailable });
    }

    return items
      .sort((a, b) => b.regionsAvailable - a.regionsAvailable || a.canonicalName.localeCompare(b.canonicalName))
      .slice(0, 20);
  }

  async recordContribution(accountId: string, userId: string, expenseId: string): Promise<void> {
    try {
      const salt = this.config.get<string>('COMMUNITY_PRICE_SALT');
      if (!salt) return; // no salt configured -> never derive a contributor key with a weak/no secret

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { contributeCommunityPrices: true },
      });
      if (!user?.contributeCommunityPrices) return; // consent gate

      const expense = await this.prisma.expense.findFirst({
        where: { id: expenseId, accountId, isDeleted: false },
        select: {
          merchant: true,
          currencyCode: true,
          date: true,
          locationLat: true,
          locationLng: true,
          account: { select: { encryptionEnabled: true } },
          items: {
            where: { isDeleted: false, canonicalName: { not: null } },
            select: { canonicalName: true, quantity: true, unitPrice: true, totalPrice: true },
          },
        },
      });
      if (!expense) return;
      if (expense.account.encryptionEnabled) return; // merchant/canonicalName would be ciphertext
      if (!expense.merchant) return;
      if (expense.items.length === 0) return;
      if (expense.locationLat == null || expense.locationLng == null) return; // no POS coords, skip

      const lat = Number(expense.locationLat);
      const lng = Number(expense.locationLng);
      if (lat === 0 && lng === 0) return; // null-island convention (undecryptable/absent location)

      const merchantNormalized = normalizeMerchantPL(expense.merchant)?.trim().toLowerCase();
      if (!merchantNormalized) return;

      const city = await this.geocoding.reverseGeocode(lat, lng).catch(() => null);
      const region = regionBucket(lat, lng, city);
      const weekStart = mondayOfWeek(expense.date);
      const contributorKey = computeContributorKey(salt, accountId);
      const aliasMap = await this.getAliasMap(accountId);

      for (const item of expense.items) {
        const rawName = item.canonicalName as string;
        const canonicalName = aliasMap.get(rawName) ?? rawName;
        if (canonicalName === IGNORED_SENTINEL) continue;

        const quantity = Number(item.quantity);
        const price =
          quantity > 1 ? Number(item.totalPrice) / quantity : Number(item.unitPrice);
        if (!(price > 0)) continue;

        try {
          await this.prisma.communityPriceObservation.upsert({
            where: {
              community_obs_dedup: {
                canonicalName,
                merchantNormalized,
                region,
                weekStart,
                currencyCode: expense.currencyCode,
                contributorKey,
              },
            },
            create: {
              canonicalName,
              merchantNormalized,
              region,
              weekStart,
              currencyCode: expense.currencyCode,
              price,
              contributorKey,
            },
            update: { price },
          });
        } catch (e: any) {
          // Concurrent racing writes for the same key: already contributed this
          // week — no-op rather than retry/throw.
          if (e?.code === 'P2002') continue;
          throw e;
        }
      }
    } catch (e) {
      this.logger.warn(`recordContribution failed for expense ${expenseId}: ${e}`);
    }
  }

  private async getAliasMap(accountId: string): Promise<Map<string, string>> {
    const aliases = await this.prisma.productAlias.findMany({
      where: { accountId },
      select: { rawName: true, canonicalName: true },
    });
    return new Map(aliases.map((a) => [a.rawName, a.canonicalName]));
  }
}
