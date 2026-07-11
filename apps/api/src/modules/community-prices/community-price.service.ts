import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { GeocodingService } from '../ai/services/geocoding.service';
import { normalizeMerchantPL } from '../import-bank/merchants/merchants-pl';
import { mondayOfWeek, regionBucket, computeContributorKey, isEligibleContributor } from './community-price.util';
import { aggregateCommunityPrices, aggregateCommunityMap, DEFAULT_K_ANONYMITY } from './community-price-calculator';
import type {
  CommunityPriceResponse,
  CommunityPricePeriod,
  CommunityProductSearchItem,
  CommunityPriceMapPoint,
} from '@budget/shared-types';

// Read-path cache: anonymous aggregate data, so the key is global (not per-account).
const READ_CACHE_TTL_SEC = 300;

// ── Anti-abuse hardening (ABA-335 security audit) ────────────────────────────
// The k-anonymity gate counts distinct contributor accounts, but nothing stops
// an attacker from registering throwaway accounts and POSTing fabricated
// expenses to mint "distinct" contributors (Sybil). These raise the cost of that
// attack; they do NOT fully solve it — see the read kill-switch below and the
// tracked follow-up. Full defense (trust scoring / DP noise) must land before
// the read API is enabled for real users.
//
// Only receipt-SCANNED expenses feed the shared corpus — a manually-typed or
// API-posted expense carries no AI/OCR-derived product name and must never
// broadcast free text cross-account. ('ocr' = mobile scan; the bot sources are
// their photo handlers.)
const RECEIPT_SOURCES = new Set(['ocr', 'telegram', 'whatsapp', 'slack']);
// An account must be at least this old AND have this many real tracked expenses
// before its contributions count — age alone is cheap to fake (register + wait);
// requiring sustained real usage raises the per-identity cost of a Sybil fleet.
// Both overridable via env (COMMUNITY_MIN_ACCOUNT_AGE_DAYS / COMMUNITY_MIN_CONTRIBUTOR_EXPENSES).
const MIN_ACCOUNT_AGE_DAYS = 7;
const MIN_CONTRIBUTOR_EXPENSES = 15;
// Product/merchant labels beyond this are almost certainly not real names — cap
// them so no oversized free-text string can reach the cross-account corpus.
const MAX_LABEL_LEN = 64;
// Multi-week persistence (anti-Sybil): a store must have data in >= this many
// DISTINCT weeks over the lookback window to be exposed — blocks a single-week
// burst of K throwaway accounts. The displayed price still comes only from the
// requested 1w/4w period; the gate runs over the wider lookback. Both env-tunable.
const MIN_PERSISTENCE_WEEKS = 2;
const PERSISTENCE_LOOKBACK_WEEKS = 8;

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

  /** Read a non-negative int env override, else the given default. */
  private intEnv(key: string, fallback: number): number {
    const raw = parseInt(this.config.get<string>(key) ?? '', 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
  }

  /**
   * Read kill-switch (defaults OFF). The k-anonymity gate does not by itself
   * defend against a Sybil attacker who controls the write path, so the read API
   * stays DARK until `COMMUNITY_PRICE_READ_ENABLED=true` is explicitly set — after
   * the anti-Sybil design work lands. The write pipeline keeps filling the corpus
   * in the meantime (itself gated on COMMUNITY_PRICE_SALT).
   */
  private readEnabled(): boolean {
    return this.config.get<string>('COMMUNITY_PRICE_READ_ENABLED') === 'true';
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
    const displayCutoff = mondayOfWeek(new Date());
    displayCutoff.setDate(displayCutoff.getDate() - (weeks - 1) * 7);
    const displayFromWeek = displayCutoff.toISOString().slice(0, 10);
    const weekLabel = displayFromWeek;

    const empty: CommunityPriceResponse = {
      product: normalizedProduct,
      region: region ?? null,
      currency: '',
      period,
      weekLabel,
      stores: [],
    };
    if (!normalizedProduct || !this.readEnabled()) return empty;

    // Cache key uses the exact (case-preserved) product so it can never collide
    // with a different-case canonicalName the case-sensitive query wouldn't match.
    const cacheKey = `cph:${createHash('sha1').update(normalizedProduct).digest('hex')}:${region ?? '*'}:${period}`;
    const cached = await this.cache.get<CommunityPriceResponse>(cacheKey);
    if (cached) return cached;

    // Upper bound: a future-dated expense must not match indefinitely — cap at the
    // end of the current week. The persistence gate needs a wider LOOKBACK window
    // than the display period, so query from the lookback cutoff (display still
    // filters to `displayFromWeek` inside the aggregator).
    const ceiling = mondayOfWeek(new Date());
    ceiling.setDate(ceiling.getDate() + 7);
    const lookbackWeeks = Math.max(
      this.intEnv('COMMUNITY_PERSISTENCE_LOOKBACK_WEEKS', PERSISTENCE_LOOKBACK_WEEKS),
      weeks,
    );
    const lookbackCutoff = mondayOfWeek(new Date());
    lookbackCutoff.setDate(lookbackCutoff.getDate() - (lookbackWeeks - 1) * 7);

    const rows = await this.prisma.communityPriceObservation.findMany({
      where: {
        canonicalName: normalizedProduct,
        ...(region ? { region } : {}),
        weekStart: { gte: lookbackCutoff, lt: ceiling },
      },
      select: { merchantNormalized: true, price: true, currencyCode: true, contributorKey: true, weekStart: true },
    });

    const { currency, stores } = aggregateCommunityPrices(
      rows.map((r) => ({
        merchantNormalized: r.merchantNormalized,
        price: Number(r.price),
        currencyCode: r.currencyCode,
        contributorKey: r.contributorKey,
        weekStart: r.weekStart.toISOString().slice(0, 10),
      })),
      this.getK(),
      this.intEnv('COMMUNITY_MIN_PERSISTENCE_WEEKS', MIN_PERSISTENCE_WEEKS),
      displayFromWeek,
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
    if (term.length < 2 || !this.readEnabled()) return [];
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

  /**
   * GET /price-history/community/map — k-anonymity-gated store price points WITH
   * coordinates for a product, for the map view. Only stores that clear the K-gate
   * AND have a known coordinate (from the store-geo lookup) are returned. Coords are
   * the STORE's public location, never a contributor's.
   */
  async getCommunityMap(
    product: string,
    region: string | null,
    period: CommunityPricePeriod,
  ): Promise<CommunityPriceMapPoint[]> {
    const normalizedProduct = product.trim();
    if (!normalizedProduct || !this.readEnabled()) return [];

    const cacheKey = `cphmap:${createHash('sha1').update(normalizedProduct).digest('hex')}:${region ?? '*'}:${period}`;
    const cached = await this.cache.get<CommunityPriceMapPoint[]>(cacheKey);
    if (cached) return cached;

    const weeks = period === '4w' ? 4 : 1;
    const displayCutoff = mondayOfWeek(new Date());
    displayCutoff.setDate(displayCutoff.getDate() - (weeks - 1) * 7);
    const displayFromWeek = displayCutoff.toISOString().slice(0, 10);
    const ceiling = mondayOfWeek(new Date());
    ceiling.setDate(ceiling.getDate() + 7);
    const lookbackWeeks = Math.max(
      this.intEnv('COMMUNITY_PERSISTENCE_LOOKBACK_WEEKS', PERSISTENCE_LOOKBACK_WEEKS),
      weeks,
    );
    const lookbackCutoff = mondayOfWeek(new Date());
    lookbackCutoff.setDate(lookbackCutoff.getDate() - (lookbackWeeks - 1) * 7);

    const rows = await this.prisma.communityPriceObservation.findMany({
      where: {
        canonicalName: normalizedProduct,
        ...(region ? { region } : {}),
        weekStart: { gte: lookbackCutoff, lt: ceiling },
      },
      select: {
        merchantNormalized: true,
        region: true,
        price: true,
        currencyCode: true,
        contributorKey: true,
        weekStart: true,
      },
    });

    const aggs = aggregateCommunityMap(
      rows.map((r) => ({
        merchantNormalized: r.merchantNormalized,
        region: r.region,
        price: Number(r.price),
        currencyCode: r.currencyCode,
        contributorKey: r.contributorKey,
        weekStart: r.weekStart.toISOString().slice(0, 10),
      })),
      this.getK(),
      this.intEnv('COMMUNITY_MIN_PERSISTENCE_WEEKS', MIN_PERSISTENCE_WEEKS),
      displayFromWeek,
    );
    if (aggs.length === 0) return [];

    // Batch-fetch store coordinates for the surfaced (merchant, region) cells.
    const geos = await this.prisma.communityStoreGeo.findMany({
      where: { OR: aggs.map((a) => ({ merchantNormalized: a.merchantNormalized, region: a.region })) },
      select: { merchantNormalized: true, region: true, lat: true, lng: true },
    });
    const geoByKey = new Map(geos.map((g) => [`${g.merchantNormalized}|${g.region}`, g]));

    const points: CommunityPriceMapPoint[] = [];
    for (const a of aggs) {
      const geo = geoByKey.get(`${a.merchantNormalized}|${a.region}`);
      if (!geo) continue; // no known coordinate → not on the map
      points.push({
        merchantName: a.merchantName,
        lat: Number(geo.lat),
        lng: Number(geo.lng),
        medianPrice: a.medianPrice,
        currencyCode: a.currencyCode,
        receiptCount: a.receiptCount,
        isCheapest: false,
      });
    }

    // Re-mark cheapest among the points that actually have a coordinate (the
    // overall-cheapest cell may have been dropped for lacking geo).
    let cheapestIdx = -1;
    for (let i = 0; i < points.length; i++) {
      if (cheapestIdx === -1 || points[i].medianPrice < points[cheapestIdx].medianPrice) cheapestIdx = i;
    }
    if (cheapestIdx >= 0) points[cheapestIdx].isCheapest = true;

    await this.cache.set(cacheKey, points, READ_CACHE_TTL_SEC);
    return points;
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
          source: true,
          locationLat: true,
          locationLng: true,
          account: { select: { encryptionEnabled: true, createdAt: true } },
          items: {
            where: { isDeleted: false, canonicalName: { not: null } },
            select: { canonicalName: true, quantity: true, unitPrice: true, totalPrice: true },
          },
        },
      });
      if (!expense) return;
      if (expense.account.encryptionEnabled) return; // merchant/canonicalName would be ciphertext
      // Only receipt-scanned expenses feed the corpus — a manually-typed / API-posted
      // expense carries no AI/OCR product name and must never broadcast free text.
      if (!RECEIPT_SOURCES.has(expense.source)) return;
      if (!expense.merchant) return;
      if (expense.items.length === 0) return;
      if (expense.locationLat == null || expense.locationLng == null) return; // no POS coords, skip

      // Anti-Sybil eligibility: account must be old enough AND have real usage history.
      const accountAgeDays = (Date.now() - expense.account.createdAt.getTime()) / 86_400_000;
      const expenseCount = await this.prisma.expense.count({
        where: { accountId, isDeleted: false },
      });
      if (
        !isEligibleContributor(
          accountAgeDays,
          expenseCount,
          this.intEnv('COMMUNITY_MIN_ACCOUNT_AGE_DAYS', MIN_ACCOUNT_AGE_DAYS),
          this.intEnv('COMMUNITY_MIN_CONTRIBUTOR_EXPENSES', MIN_CONTRIBUTOR_EXPENSES),
        )
      ) {
        return;
      }

      const lat = Number(expense.locationLat);
      const lng = Number(expense.locationLng);
      if (lat === 0 && lng === 0) return; // null-island convention (undecryptable/absent location)

      const merchantNormalized = normalizeMerchantPL(expense.merchant)?.trim().toLowerCase();
      if (!merchantNormalized || merchantNormalized.length > MAX_LABEL_LEN) return;

      const city = await this.geocoding.reverseGeocode(lat, lng).catch(() => null);
      const region = regionBucket(lat, lng, city);
      const weekStart = mondayOfWeek(expense.date);
      const contributorKey = computeContributorKey(salt, accountId);
      const aliasMap = await this.getAliasMap(accountId);

      // Store-location lookup for the community MAP (M4): the STORE's public
      // coordinate keyed by (merchantNormalized, region) — no contributor linkage.
      // Best-effort + fire-and-forget so it never blocks the observation writes.
      this.prisma.communityStoreGeo
        .upsert({
          where: { community_store_geo_key: { merchantNormalized, region } },
          create: { merchantNormalized, region, lat, lng },
          update: { lat, lng },
        })
        .catch(() => {});

      for (const item of expense.items) {
        const rawName = item.canonicalName as string;
        const canonicalName = aliasMap.get(rawName) ?? rawName;
        if (canonicalName === IGNORED_SENTINEL) continue;
        if (canonicalName.length > MAX_LABEL_LEN) continue; // no oversized free text into the shared corpus

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
      this.logger.warn(
        `recordContribution failed for expense ${expenseId}: ${e instanceof Error ? e.message : String(e)}`,
      );
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
