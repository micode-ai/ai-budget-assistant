import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { GeocodingService } from '../ai/services/geocoding.service';
import { isStripePaidSub } from '../admin/admin-comped.util';
import {
  mondayOfWeek,
  regionBucket,
  computeContributorKey,
  isEligibleContributor,
} from './community-price.util';
import {
  aggregateCommunityPrices,
  aggregateCommunityMap,
  evaluateCommunityCell,
  DEFAULT_K_ANONYMITY,
  DEFAULT_MIN_TRUSTED,
  DEFAULT_CHEAPEST_MAX_DROP_PCT,
  type CommunityAggOptions,
  type CommunityObservationRow,
} from './community-price-calculator';
import { clusterContributors, DEFAULT_CORRELATION } from './community-price-correlation';
import {
  attestedLineHash,
  attestedUnitPrice,
  receiptContentKey,
  usableCommunitySalt,
  verifyScanAttestation,
  MIN_SALT_LENGTH,
} from './scan-attestation.util';
import { resolveStorePin } from './community-store-pin';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import type {
  CommunityPriceResponse,
  CommunityPricePeriod,
  CommunityProductSearchItem,
  CommunityPriceMapPoint,
} from '@budget/shared-types';
import type { CommunityBaseline } from '../price-history/receipt-check.util';

// Read-path cache: anonymous aggregate data, so the key is global (not per-account).
const READ_CACHE_TTL_SEC = 300;

// ── Anti-abuse hardening (ABA-335 security audit, ABA-642 anti-Sybil) ────────
// Only lines the SERVER'S OWN OCR read can contribute: the scan response carries a
// server-signed `scanAttestation` (see scan-attestation.util.ts), the client hands
// it back on expense create, and `recordContribution` uses merchant / location /
// date / currency from the token and only the saved lines whose hash is in it.
// `expense.source` is no longer consulted (it is a free client string).
//
// A person (userId, across all their accounts) must be at least this old AND have
// this many real tracked expenses before their contributions count — age alone is
// cheap to fake. Both overridable via env
// (COMMUNITY_MIN_ACCOUNT_AGE_DAYS / COMMUNITY_MIN_CONTRIBUTOR_EXPENSES; the names
// predate the per-user keying and are unchanged).
const MIN_ACCOUNT_AGE_DAYS = 7;
const MIN_CONTRIBUTOR_EXPENSES = 15;
// Trusted = user tenure >= this many days OR paying through Stripe (never a comp).
const TRUSTED_TENURE_DAYS = 60;
// Product/merchant labels beyond this are almost certainly not real names — cap
// them so no oversized free-text string can reach the cross-account corpus.
const MAX_LABEL_LEN = 64;
// A receipt older than this (or dated more than a day ahead) never contributes:
// persistence across two weeks therefore needs two REAL calendar weeks.
const MAX_RECEIPT_AGE_DAYS = 14;
const MAX_RECEIPT_FUTURE_DAYS = 1;
// Per-contributor limits, in RECEIPTS (not lines). incrementWindow throws on a
// Redis outage, so these fail CLOSED: the receipt is skipped.
const RATE_LIMIT_DAILY = 6;
const RATE_LIMIT_WEEKLY = 20;
const DAY_MS = 86_400_000;
// Multi-week persistence (anti-Sybil): a store must have data in >= this many
// DISTINCT weeks over the lookback window to be exposed. Both env-tunable.
const MIN_PERSISTENCE_WEEKS = 2;
const PERSISTENCE_LOOKBACK_WEEKS = 8;
// Receipt-price-check baselines are always the 4-week view.
const BASELINE_PERIOD_WEEKS = 4;
const BASELINE_MAX_ROWS = 20_000;
// Scan-time baseline reads are an oracle over the corpus (a scanner can probe any
// store/product pair), so they are budgeted per USER and capped per scan.
const BASELINE_READS_PER_HOUR = 30;
const BASELINE_MAX_PRODUCTS = 100;
// A product search term / product name beyond this is not a real name.
const MAX_QUERY_LEN = 64;

// Sentinel stored in product_aliases.canonical_name to exclude a product from all
// tracking — same convention as price-history.service.ts (kept as its own private
// copy there; not exported, so this is a deliberate local duplicate of the value).
// The ONLY thing still read from the user's aliases: they are user-typed text and
// never enter the shared corpus.
const IGNORED_SENTINEL = '__ignored__';

/**
 * ABA-335 (Community Price Map), hardened by ABA-642. The write path
 * (`recordContribution`) builds the anonymized `community_price_observations`
 * corpus from SERVER-ATTESTED receipt lines only; the read path
 * (`getCommunityPrices` / `searchProducts` / `getCommunityMap` /
 * `getStoreBaselines`) exposes only cells that clear the exposure gates. Reads are
 * FREE on every tier, behind the COMMUNITY_PRICE_READ_ENABLED kill switch.
 *
 * Privacy invariants (see schema.prisma model doc for the full rationale):
 *  - No accountId, userId, or expenseId is ever written to the observation row,
 *    the receipt-seen row or the store-geo row.
 *  - No user/contributor coordinates are stored — only the STORE's server-geocoded
 *    printed address (from the signed token), never client GPS.
 *  - `contributorKey` is a salted one-way hash of the USER id — used only for the
 *    one-vote-per-person-per-week dedup, the rate limits and the read-path
 *    k-anonymity gate; never exposed to any client. `trusted` is a coarse boolean.
 *  - Encrypted (E2EE) accounts are skipped.
 *  - Rows written before ABA-642 (`attested = false`) are kept but NEVER read.
 */
@Injectable()
export class CommunityPriceService implements OnModuleInit {
  private readonly logger = new Logger(CommunityPriceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly geocoding: GeocodingService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Startup sanity checks (loud on purpose, each silently weakens or disables the
   * anti-Sybil layer):
   *  - COMMUNITY_PRICE_SALT shorter than 32 chars: attestation + contributions are
   *    disabled (a weak HMAC key is worse than none);
   *  - reads enabled without behavioural correlation: reads are REFUSED, since a
   *    ring would otherwise count as k independent people.
   */
  onModuleInit(): void {
    const rawSalt = this.config.get<string>('COMMUNITY_PRICE_SALT');
    if (rawSalt && !usableCommunitySalt(rawSalt)) {
      this.logger.warn(
        `COMMUNITY_PRICE_SALT is shorter than ${MIN_SALT_LENGTH} characters: scan attestation and community contributions are DISABLED until it is replaced.`,
      );
    }
    if (this.readFlagOn() && !this.correlationEnabled()) {
      this.logger.warn(
        'COMMUNITY_PRICE_READ_ENABLED=true but COMMUNITY_CORRELATION_ENABLED is not: community reads are REFUSED (returning "not enough data") until correlation clustering is enabled.',
      );
    }
  }

  /** The usable (>= 32 char) salt, or null. */
  private salt(): string | null {
    return usableCommunitySalt(this.config.get<string>('COMMUNITY_PRICE_SALT'));
  }

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
   * Read kill-switch (defaults OFF). Flipped only by an explicit ops step after the
   * corpus has filled (docs/superpowers/specs/2026-10-09-community-prices-anti-sybil-design.md,
   * Rollout). The write pipeline keeps filling the corpus in the meantime (itself
   * gated on COMMUNITY_PRICE_SALT). Nothing is cached while the flag is off.
   */
  readEnabled(): boolean {
    // Reads REQUIRE correlation clustering: without it a Sybil ring is k "people".
    return this.readFlagOn() && this.correlationEnabled();
  }

  private readFlagOn(): boolean {
    return this.config.get<string>('COMMUNITY_PRICE_READ_ENABLED') === 'true';
  }

  /**
   * Behavioral correlation clustering (anti-Sybil). Default OFF — set
   * COMMUNITY_CORRELATION_ENABLED=true at go-live. When off, buildClusterMap
   * returns null and the K-gate counts raw distinct contributors.
   */
  private correlationEnabled(): boolean {
    return this.config.get<string>('COMMUNITY_CORRELATION_ENABLED') === 'true';
  }

  private aggOptions(displayFromWeek: string, clusterMap: Map<string, string> | null): CommunityAggOptions {
    return {
      k: this.getK(),
      minTrusted: this.intEnv('COMMUNITY_MIN_TRUSTED', DEFAULT_MIN_TRUSTED),
      minWeeks: this.intEnv('COMMUNITY_MIN_PERSISTENCE_WEEKS', MIN_PERSISTENCE_WEEKS),
      displayFromWeek,
      clusterMap,
      cheapestMaxDropPct: this.intEnv('COMMUNITY_CHEAPEST_MAX_DROP_PCT', DEFAULT_CHEAPEST_MAX_DROP_PCT),
    };
  }

  /** Display/lookback/ceiling week boundaries for a period. */
  private windows(weeks: number) {
    const displayCutoff = mondayOfWeek(new Date());
    displayCutoff.setDate(displayCutoff.getDate() - (weeks - 1) * 7);
    // Upper bound: a future-dated row must not match indefinitely — cap at the end
    // of the current week.
    const ceiling = mondayOfWeek(new Date());
    ceiling.setDate(ceiling.getDate() + 7);
    const lookbackWeeks = Math.max(
      this.intEnv('COMMUNITY_PERSISTENCE_LOOKBACK_WEEKS', PERSISTENCE_LOOKBACK_WEEKS),
      weeks,
    );
    const lookbackCutoff = mondayOfWeek(new Date());
    lookbackCutoff.setDate(lookbackCutoff.getDate() - (lookbackWeeks - 1) * 7);
    return { displayFromWeek: displayCutoff.toISOString().slice(0, 10), ceiling, lookbackCutoff };
  }

  /**
   * Cluster the given contributors by near-identical BROAD contribution footprints
   * so a Sybil ring collapses to one effective contributor in the K-gate. Fetches
   * each contributor's full footprint over the lookback (across all products,
   * attested rows only) and clusters them; returns null when the feature is off.
   */
  private async buildClusterMap(
    contributorKeys: string[],
    lookbackCutoff: Date,
    ceiling: Date,
  ): Promise<Map<string, string> | null> {
    if (!this.correlationEnabled() || contributorKeys.length === 0) return null;
    const rows = await this.prisma.communityPriceObservation.findMany({
      where: {
        attested: true,
        contributorKey: { in: contributorKeys },
        weekStart: { gte: lookbackCutoff, lt: ceiling },
      },
      select: {
        contributorKey: true,
        canonicalName: true,
        merchantNormalized: true,
        region: true,
        weekStart: true,
      },
    });
    const footprints = new Map<string, Set<string>>();
    for (const r of rows) {
      const cell = `${r.canonicalName}|${r.merchantNormalized}|${r.region}|${r.weekStart.toISOString().slice(0, 10)}`;
      let set = footprints.get(r.contributorKey);
      if (!set) {
        set = new Set();
        footprints.set(r.contributorKey, set);
      }
      set.add(cell);
    }
    return clusterContributors(footprints, {
      minFootprint: this.intEnv('COMMUNITY_CORRELATION_MIN_FOOTPRINT', DEFAULT_CORRELATION.minFootprint),
      jaccard:
        this.intEnv('COMMUNITY_CORRELATION_JACCARD_PCT', Math.round(DEFAULT_CORRELATION.jaccard * 100)) / 100,
    });
  }

  /**
   * GET /price-history/community — gated per-store price points for a product,
   * cheapest-first. `product` is an exact canonicalName (from the search
   * endpoint). Optional `region` scopes to one area; omitted = national.
   */
  async getCommunityPrices(
    product: string,
    region: string | null,
    period: CommunityPricePeriod,
  ): Promise<CommunityPriceResponse> {
    const normalizedProduct = product.trim();
    const weeks = period === '4w' ? 4 : 1;
    const { displayFromWeek, ceiling, lookbackCutoff } = this.windows(weeks);

    const empty: CommunityPriceResponse = {
      product: normalizedProduct,
      region: region ?? null,
      currency: '',
      period,
      weekLabel: displayFromWeek,
      stores: [],
    };
    if (!normalizedProduct || normalizedProduct.length > MAX_QUERY_LEN || !this.readEnabled()) return empty;

    // Cache key uses the exact (case-preserved) product so it can never collide
    // with a different-case canonicalName the case-sensitive query wouldn't match.
    const cacheKey = `cph:${createHash('sha1').update(normalizedProduct).digest('hex')}:${region ?? '*'}:${period}`;
    const cached = await this.cache.get<CommunityPriceResponse>(cacheKey);
    if (cached) return cached;

    const rows = await this.prisma.communityPriceObservation.findMany({
      where: {
        attested: true, // legacy (pre-ABA-642) rows never enter the aggregation
        canonicalName: normalizedProduct,
        ...(region ? { region } : {}),
        weekStart: { gte: lookbackCutoff, lt: ceiling },
      },
      select: {
        merchantNormalized: true,
        price: true,
        currencyCode: true,
        contributorKey: true,
        weekStart: true,
        ingestWeek: true,
        trusted: true,
      },
    });

    const clusterMap = await this.buildClusterMap(
      [...new Set(rows.map((r) => r.contributorKey))],
      lookbackCutoff,
      ceiling,
    );

    const { currency, stores } = aggregateCommunityPrices(
      rows.map((r) => ({
        merchantNormalized: r.merchantNormalized,
        price: Number(r.price),
        currencyCode: r.currencyCode,
        contributorKey: r.contributorKey,
        weekStart: r.weekStart.toISOString().slice(0, 10),
        ingestWeek: r.ingestWeek.toISOString().slice(0, 10),
        trusted: r.trusted,
      })),
      this.aggOptions(displayFromWeek, clusterMap),
    );

    const result: CommunityPriceResponse = { ...empty, currency, stores };
    await this.cache.set(cacheKey, result, READ_CACHE_TTL_SEC);
    return result;
  }

  /**
   * GET /price-history/community/products?q= — autocomplete. A cheap PREFILTER
   * (no clustering): a product is offered only when some region has at least K
   * distinct contributors, at least `minTrusted` of them trusted, within the
   * lookback and attested rows only. The full gate runs on selection; a hit that
   * fails it shows the client's `noResults`. Keeps product names minted only by a
   * ring out of autocomplete.
   */
  async searchProducts(q: string): Promise<CommunityProductSearchItem[]> {
    const term = q.trim();
    if (term.length < 2 || term.length > MAX_QUERY_LEN || !this.readEnabled()) return [];
    const cacheKey = `cphs:${createHash('sha1').update(term.toLowerCase()).digest('hex')}`;
    const cached = await this.cache.get<CommunityProductSearchItem[]>(cacheKey);
    if (cached) return cached;
    const k = this.getK();
    const minTrusted = this.intEnv('COMMUNITY_MIN_TRUSTED', DEFAULT_MIN_TRUSTED);
    const { ceiling, lookbackCutoff } = this.windows(1);

    const groups = await this.prisma.communityPriceObservation.groupBy({
      by: ['canonicalName', 'region', 'contributorKey', 'trusted'],
      where: {
        attested: true,
        canonicalName: { contains: term, mode: 'insensitive' },
        weekStart: { gte: lookbackCutoff, lt: ceiling },
      },
    });

    // product -> region -> contributor -> trusted (a contributor is trusted if any row is)
    const byProduct = new Map<string, Map<string, Map<string, boolean>>>();
    for (const g of groups) {
      let regions = byProduct.get(g.canonicalName);
      if (!regions) {
        regions = new Map();
        byProduct.set(g.canonicalName, regions);
      }
      let contributors = regions.get(g.region);
      if (!contributors) {
        contributors = new Map();
        regions.set(g.region, contributors);
      }
      contributors.set(g.contributorKey, (contributors.get(g.contributorKey) ?? false) || g.trusted);
    }

    const items: CommunityProductSearchItem[] = [];
    for (const [canonicalName, regions] of byProduct) {
      let regionsAvailable = 0;
      for (const contributors of regions.values()) {
        const trustedCount = [...contributors.values()].filter(Boolean).length;
        if (contributors.size >= k && trustedCount >= minTrusted) regionsAvailable += 1;
      }
      if (regionsAvailable > 0) items.push({ canonicalName, regionsAvailable });
    }

    const result = items
      .sort((a, b) => b.regionsAvailable - a.regionsAvailable || a.canonicalName.localeCompare(b.canonicalName))
      .slice(0, 20);
    await this.cache.set(cacheKey, result, READ_CACHE_TTL_SEC);
    return result;
  }

  /**
   * GET /price-history/community/map — gated store price points WITH coordinates
   * for a product. Only cells that clear the exposure gates AND have an attested
   * (server-geocoded, create-only) store pin are returned. Legacy pins are never
   * shown. Coords are the STORE's public location, never a contributor's.
   */
  async getCommunityMap(
    product: string,
    region: string | null,
    period: CommunityPricePeriod,
  ): Promise<CommunityPriceMapPoint[]> {
    const normalizedProduct = product.trim();
    if (!normalizedProduct || normalizedProduct.length > MAX_QUERY_LEN || !this.readEnabled()) return [];

    const cacheKey = `cphmap:${createHash('sha1').update(normalizedProduct).digest('hex')}:${region ?? '*'}:${period}`;
    const cached = await this.cache.get<CommunityPriceMapPoint[]>(cacheKey);
    if (cached) return cached;

    const weeks = period === '4w' ? 4 : 1;
    const { displayFromWeek, ceiling, lookbackCutoff } = this.windows(weeks);

    const rows = await this.prisma.communityPriceObservation.findMany({
      where: {
        attested: true,
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
        ingestWeek: true,
        trusted: true,
      },
    });

    const clusterMap = await this.buildClusterMap(
      [...new Set(rows.map((r) => r.contributorKey))],
      lookbackCutoff,
      ceiling,
    );

    const aggs = aggregateCommunityMap(
      rows.map((r) => ({
        merchantNormalized: r.merchantNormalized,
        region: r.region,
        price: Number(r.price),
        currencyCode: r.currencyCode,
        contributorKey: r.contributorKey,
        weekStart: r.weekStart.toISOString().slice(0, 10),
        ingestWeek: r.ingestWeek.toISOString().slice(0, 10),
        trusted: r.trusted,
      })),
      this.aggOptions(displayFromWeek, clusterMap),
    );
    if (aggs.length === 0) return [];

    // Batch-fetch ATTESTED store coordinates for the surfaced (merchant, region) cells.
    const geos = await this.prisma.communityStoreGeo.findMany({
      where: {
        attested: true,
        OR: aggs.map((a) => ({ merchantNormalized: a.merchantNormalized, region: a.region })),
      },
      select: { merchantNormalized: true, region: true, lat: true, lng: true },
    });
    const geoByKey = new Map(geos.map((g) => [`${g.merchantNormalized}|${g.region}`, g]));

    const points: CommunityPriceMapPoint[] = [];
    const badgeEligible: boolean[] = [];
    for (const a of aggs) {
      const geo = geoByKey.get(`${a.merchantNormalized}|${a.region}`);
      if (!geo) continue; // no known coordinate -> not on the map
      points.push({
        merchantName: a.merchantName,
        lat: Number(geo.lat),
        lng: Number(geo.lng),
        medianPrice: a.medianPrice,
        currencyCode: a.currencyCode,
        receiptCount: a.receiptCount,
        isCheapest: false,
      });
      badgeEligible.push(a.badgeEligible);
    }

    // Re-mark cheapest among the points that actually have a coordinate (the
    // overall-cheapest cell may have been dropped for lacking geo) — but only when
    // that cell did not just drop by >= 30% (no badge at all, never a runner-up).
    let cheapestIdx = -1;
    for (let i = 0; i < points.length; i++) {
      if (cheapestIdx === -1 || points[i].medianPrice < points[cheapestIdx].medianPrice) cheapestIdx = i;
    }
    if (cheapestIdx >= 0 && badgeEligible[cheapestIdx]) points[cheapestIdx].isCheapest = true;

    await this.cache.set(cacheKey, points, READ_CACHE_TTL_SEC);
    return points;
  }

  /**
   * Same-store community baselines for the receipt price check (ABA-642). Returns
   * `{canonicalName, medianPrice, currency}` only for cells that pass the FULL
   * exposure gate in the 4-week window at THE SAME store and region — never a
   * cross-store figure (different chains legitimately price differently).
   * Fail-silent: any failure (or the read flag off) returns [].
   */
  async getStoreBaselines(
    userId: string,
    canonicalNames: string[],
    merchantNormalized: string,
    lat: number,
    lng: number,
    currency: string,
  ): Promise<CommunityBaseline[]> {
    try {
      if (!this.readEnabled()) return [];
      const merchant = merchantNormalized.trim().toLowerCase();
      if (!merchant || canonicalNames.length === 0 || !currency) return [];
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return [];

      // Per-user budget (fail CLOSED: a Redis outage makes incrementWindow throw and the
      // catch below returns [], skipping the community fallback). Counted before the
      // cache read, so cached probing is budgeted too.
      const used = await this.cache.incrementWindow(`cp:bl:${userId}`, 60 * 60 * 1000);
      if (used > this.intEnv('COMMUNITY_BASELINE_READS_PER_HOUR', BASELINE_READS_PER_HOUR)) return [];
      const names = canonicalNames.slice(0, BASELINE_MAX_PRODUCTS);

      const city = await this.geocoding.reverseGeocode(lat, lng).catch(() => null);
      const region = regionBucket(lat, lng, city);

      // One store's gated baselines for ALL its products, cached 5 min (global, anonymous).
      const cacheKey = `cpbase:${createHash('sha1').update(`${merchant}|${region}|${currency}`).digest('hex')}`;
      let all = await this.cache.get<CommunityBaseline[]>(cacheKey);
      if (!all) {
        const { displayFromWeek, ceiling, lookbackCutoff } = this.windows(BASELINE_PERIOD_WEEKS);
        const rows = await this.prisma.communityPriceObservation.findMany({
          where: {
            attested: true,
            merchantNormalized: merchant,
            region,
            currencyCode: currency,
            weekStart: { gte: lookbackCutoff, lt: ceiling },
          },
          select: {
            canonicalName: true,
            price: true,
            contributorKey: true,
            weekStart: true,
            ingestWeek: true,
            trusted: true,
          },
          // Deterministic: when the cap bites it always drops the same (oldest) rows.
          orderBy: [{ weekStart: 'desc' }, { id: 'asc' }],
          take: BASELINE_MAX_ROWS,
        });
        const clusterMap = await this.buildClusterMap(
          [...new Set(rows.map((r) => r.contributorKey))],
          lookbackCutoff,
          ceiling,
        );
        const opts = this.aggOptions(displayFromWeek, clusterMap);
        const byProduct = new Map<string, CommunityObservationRow[]>();
        for (const r of rows) {
          const arr = byProduct.get(r.canonicalName) ?? [];
          arr.push({
            merchantNormalized: merchant,
            price: Number(r.price),
            currencyCode: currency,
            contributorKey: r.contributorKey,
            weekStart: r.weekStart.toISOString().slice(0, 10),
            ingestWeek: r.ingestWeek.toISOString().slice(0, 10),
            trusted: r.trusted,
          });
          byProduct.set(r.canonicalName, arr);
        }
        all = [];
        for (const [canonicalName, group] of byProduct) {
          const cell = evaluateCommunityCell(group, opts);
          if (cell) all.push({ canonicalName, medianPrice: cell.medianPrice, currency });
        }
        await this.cache.set(cacheKey, all, READ_CACHE_TTL_SEC);
      }

      const wanted = new Set(names.map((n) => n.trim().toLowerCase()));
      return all.filter((b) => wanted.has(b.canonicalName.trim().toLowerCase()));
    } catch (e) {
      this.logger.warn(`getStoreBaselines skipped: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }

  /**
   * Contribute a saved receipt's attested lines to the corpus. Fire-and-forget +
   * fail-silent: never throws. Every skip path is a plain `return`.
   *
   * Only the data in the verified `scanAttestation` token is trusted: merchant,
   * currency, date and store location come from it (never the expense row or client
   * GPS), and only saved lines whose hash is in the token contribute — a line the
   * user edited no longer matches and is dropped, a deleted one is gone. A line's
   * price is derived from its attested fields (totalPrice / quantity), never from
   * the client-editable unitPrice.
   */
  async recordContribution(
    accountId: string,
    userId: string,
    expenseId: string,
    scanAttestation?: string | null,
  ): Promise<void> {
    try {
      const salt = this.salt();
      if (!salt) return; // no (or a < 32 char) salt -> never derive a key with a weak/no secret
      if (!scanAttestation) return; // no server-signed scan -> nothing can contribute

      const now = new Date();
      const att = verifyScanAttestation(salt, scanAttestation, { userId, accountId, now });
      if (!att) return;

      // Recency gate: the receipt date must be within [now - 14 d, now + 1 d]. Two
      // calendar weeks of persistence therefore take two real calendar weeks.
      const receiptMs = new Date(`${att.d}T12:00:00Z`).getTime();
      if (
        !Number.isFinite(receiptMs) ||
        receiptMs < now.getTime() - MAX_RECEIPT_AGE_DAYS * DAY_MS ||
        receiptMs > now.getTime() + MAX_RECEIPT_FUTURE_DAYS * DAY_MS
      ) {
        return;
      }

      if (!att.m || att.m.length > MAX_LABEL_LEN) return;
      const [lat, lng] = att.loc;
      if (lat === 0 && lng === 0) return; // null-island convention (absent location)

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { contributeCommunityPrices: true, createdAt: true },
      });
      if (!user?.contributeCommunityPrices) return; // consent gate

      const expense = await this.prisma.expense.findFirst({
        where: { id: expenseId, accountId, isDeleted: false },
        select: {
          account: { select: { encryptionEnabled: true } },
          items: {
            where: { isDeleted: false, canonicalName: { not: null } },
            select: { canonicalName: true, quantity: true, totalPrice: true },
          },
        },
      });
      if (!expense) return;
      if (expense.account.encryptionEnabled) return; // canonicalName would be ciphertext

      // Intersect the saved lines with the attested hashes.
      const attested = new Set(att.h);
      const ignored = await this.getIgnoredNames(accountId);
      const lines: Array<{ canonicalName: string; price: number }> = [];
      for (const item of expense.items) {
        const name = item.canonicalName as string;
        if (name.length > MAX_LABEL_LEN) continue; // no oversized free text into the shared corpus
        const quantity = Number(item.quantity);
        const totalPrice = Number(item.totalPrice);
        if (!attested.has(attestedLineHash(name, quantity, totalPrice))) continue; // edited / foreign line
        if (ignored.has(name)) continue; // user excluded this product from tracking
        // Unit price from the attested integers (cents, thousandths) only.
        const price = attestedUnitPrice(quantity, totalPrice);
        if (!(price > 0)) continue;
        lines.push({ canonicalName: name, price });
      }
      if (lines.length === 0) return;

      // Anti-Sybil eligibility, per PERSON: tenure and real usage across ALL accounts.
      const accountAgeDays = (now.getTime() - user.createdAt.getTime()) / DAY_MS;
      const expenseCount = await this.prisma.expense.count({ where: { userId, isDeleted: false } });
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

      // Trusted, evaluated NOW and stored as a coarse boolean: long tenure, or really
      // paying through Stripe. A comp (paid tier with no Stripe subscription) is not a payment.
      const sub = await this.prisma.subscription.findUnique({
        where: { userId },
        select: { tier: true, status: true, stripeSubscriptionId: true },
      });
      const trusted =
        accountAgeDays >= this.intEnv('COMMUNITY_TRUSTED_TENURE_DAYS', TRUSTED_TENURE_DAYS) ||
        isStripePaidSub(sub);

      const contributorKey = computeContributorKey(salt, userId);

      const weekStart = mondayOfWeek(new Date(`${att.d}T12:00:00`));
      // The week this was CONTRIBUTED (server-signed iat), for the persistence gate.
      const ingestWeek = mondayOfWeek(new Date(att.iat));

      // One physical receipt contributes once, from anyone (D4). Inserted BEFORE the
      // rate limiter so a replayed / duplicate receipt never spends the contributor's
      // budget, and before the observation writes; a unique violation means someone
      // already contributed it.
      const contentKey = receiptContentKey(salt, att);
      try {
        await this.prisma.communityReceiptSeen.create({ data: { contentKey, weekStart } });
      } catch (e: any) {
        if (e?.code === 'P2002') return;
        throw e;
      }

      // Per-contributor limits (receipts, not lines), spent only after the seen insert
      // succeeded. incrementWindow does NOT swallow Redis errors: on an outage we skip
      // the receipt (fail closed), never allow it. A receipt refused here gives its seen
      // row back so an honest retry later is not burned.
      const releaseSeen = () =>
        this.prisma.communityReceiptSeen
          .delete({ where: { contentKey } })
          .catch(logFireAndForget(this.logger, 'CommunityPriceService.releaseSeen'));
      try {
        const daily = await this.cache.incrementWindow(`cp:rl:d:${contributorKey}`, DAY_MS);
        const weekly = daily > RATE_LIMIT_DAILY ? 0 : await this.cache.incrementWindow(`cp:rl:w:${contributorKey}`, 7 * DAY_MS);
        if (daily > RATE_LIMIT_DAILY || weekly > RATE_LIMIT_WEEKLY) {
          await releaseSeen();
          return;
        }
      } catch (e) {
        await releaseSeen();
        this.logger.warn(
          `recordContribution skipped (rate limiter unavailable): ${e instanceof Error ? e.message : String(e)}`,
        );
        return;
      }

      const city = await this.geocoding.reverseGeocode(lat, lng).catch(() => null);
      const region = regionBucket(lat, lng, city);

      // Store pin for the community MAP, by CONSENSUS (never first-writer-wins): this
      // receipt adds ONE candidate coordinate for the contributor (the STORE's
      // server-geocoded printed address from the signed token, never client GPS), and a
      // pin is published only once >= k distinct contributors' candidates agree within a
      // radius, at their median. Pre-ABA-642 pins (attested = false) are a different row
      // under the unique key: kept, never overwritten, never read.
      await this.recordPinCandidate(att.m, region, contributorKey, lat, lng).catch(
        logFireAndForget(this.logger, 'CommunityPriceService.recordPinCandidate'),
      );

      for (const line of lines) {
        try {
          await this.prisma.communityPriceObservation.upsert({
            where: {
              community_obs_dedup: {
                canonicalName: line.canonicalName,
                merchantNormalized: att.m,
                region,
                weekStart,
                currencyCode: att.c,
                contributorKey,
              },
            },
            create: {
              canonicalName: line.canonicalName,
              merchantNormalized: att.m,
              region,
              weekStart,
              currencyCode: att.c,
              price: line.price,
              contributorKey,
              attested: true,
              trusted,
              ingestWeek, // set once; never moved by an update
            },
            update: { price: line.price, trusted, attested: true },
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

  /**
   * Add one pin candidate for (merchant, region, contributor), one vote per
   * contributor with the first write kept, then publish the pin if >= k distinct
   * contributors agree within the radius (median coordinate).
   */
  private async recordPinCandidate(
    merchantNormalized: string,
    region: string,
    contributorKey: string,
    lat: number,
    lng: number,
  ): Promise<void> {
    await this.prisma.communityStorePinCandidate.upsert({
      where: { community_pin_candidate_key: { merchantNormalized, region, contributorKey } },
      create: { merchantNormalized, region, contributorKey, lat, lng },
      update: {},
    });
    const rows = await this.prisma.communityStorePinCandidate.findMany({
      where: { merchantNormalized, region },
      select: { contributorKey: true, lat: true, lng: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    const pin = resolveStorePin(
      rows.map((r) => ({ contributorKey: r.contributorKey, lat: Number(r.lat), lng: Number(r.lng) })),
      this.getK(),
    );
    if (!pin) return;
    await this.prisma.communityStoreGeo.upsert({
      where: { community_store_geo_key: { merchantNormalized, region, attested: true } },
      create: { merchantNormalized, region, lat: pin.lat, lng: pin.lng, attested: true },
      update: { lat: pin.lat, lng: pin.lng },
    });
  }

  /**
   * Raw names the user excluded from tracking (alias -> `__ignored__`). The only
   * alias data still consulted: user-typed renames never enter the shared corpus.
   */
  private async getIgnoredNames(accountId: string): Promise<Set<string>> {
    const aliases = await this.prisma.productAlias.findMany({
      where: { accountId, canonicalName: IGNORED_SENTINEL },
      select: { rawName: true },
    });
    return new Set(aliases.map((a) => a.rawName));
  }
}
