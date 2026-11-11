import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import {
  computeContributorKey,
  isEligibleContributor,
  isTrustedContributor,
  COMMUNITY_MIN_ACCOUNT_AGE_DAYS,
  COMMUNITY_MIN_CONTRIBUTOR_EXPENSES,
  COMMUNITY_TRUSTED_TENURE_DAYS,
} from '../community-prices/community-price.util';
import { usableCommunitySalt } from '../community-prices/scan-attestation.util';
import { isPromoConfirmed, promoKey } from './community-promo.util';
import type { RawLeafletItem } from './leaflet-page.util';

export type PromoContributionOutcome =
  | 'disabled'
  | 'no_consent'
  | 'no_notice'
  | 'no_validity'
  | 'not_eligible'
  | 'rate_limited'
  | 'ok'
  | 'failed';

/** A community-confirmed promo that is still running. Carries no contributor data. */
export interface ConfirmedPromo {
  key: string;
  chain: string;
  canonicalName: string;
  promoPrice: number;
  currencyCode: string;
  condition: string | null;
  /** First day of the promo, `YYYY-MM-DD`. A promo is pushed only once it has started. */
  validFrom: string;
  /** `YYYY-MM-DD` */
  validTo: string;
}

export interface PromoContributionOptions {
  /** The reader is in ADMIN_EMAILS: contributes as `isAdmin` + `trusted`, skipping the per-user gates. */
  isAdmin?: boolean;
  /** Pages of one leaflet count as ONE leaflet against the daily limit. */
  leafletId?: string;
}

const DAY_MS = 86_400_000;
const DAY_SEC = 86_400;
/** At most this many leaflets per contributor per day (fails closed on a Redis error). */
const LEAFLETS_PER_DAY = 3;
/** Labels beyond this are not real names — same cap as the community price corpus. */
export const PROMO_MAX_LABEL_LEN = 64;
/** A free-text promo condition ("with the app", "2nd for 1 zł") is capped before it is shared. */
export const PROMO_MAX_CONDITION_LEN = 80;
const DEFAULT_PROMO_K = 3;
const DEFAULT_PROMO_MIN_TRUSTED = 2;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

const todayUtc = (now: Date): Date => new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);

/** A strict `YYYY-MM-DD` that is a real calendar date, as a UTC-midnight Date; otherwise null. */
function parseYmd(s: string | null): Date | null {
  if (!s || !YMD.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? d : null;
}

/**
 * Gazetka match, community layer (flag `COMMUNITY_PROMOS_ENABLED`, default OFF). Every leaflet page
 * a consenting user reads contributes anonymous promo facts — chain, product, price, validity — to
 * `community_promo_observations`; a promo becomes "confirmed" once enough distinct (and trusted)
 * contributors read the same one, or an admin did.
 *
 * Privacy: no account id, user id, image or location is written — only a salted one-way
 * `contributorKey` (the community-price key, `COMMUNITY_PRICE_SALT`), which never leaves the server.
 * The write path is fire-and-forget and never throws into its caller.
 */
@Injectable()
export class CommunityPromoService {
  private readonly logger = new Logger(CommunityPromoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  /** The flag is on AND the salt is usable (>= 32 chars). */
  enabled(): boolean {
    return this.flagOn() && this.salt() !== null;
  }

  private flagOn(): boolean {
    return this.config.get<string>('COMMUNITY_PROMOS_ENABLED') === 'true';
  }

  private salt(): string | null {
    return usableCommunitySalt(this.config.get<string>('COMMUNITY_PRICE_SALT'));
  }

  /**
   * The salted one-way contributor key for a user, or `null` when `COMMUNITY_PRICE_SALT` is not
   * usable. Independent of `COMMUNITY_PROMOS_ENABLED`: an admin publish writes rows that wait for
   * the flag.
   */
  contributorKeyFor(userId: string): string | null {
    const salt = this.salt();
    return salt ? computeContributorKey(salt, userId) : null;
  }

  private intEnv(key: string, fallback: number, min = 0): number {
    const raw = parseInt(this.config.get<string>(key) ?? '', 10);
    return Number.isFinite(raw) && raw >= min ? raw : fallback;
  }

  /**
   * Contribute one read page. Gates, in order: flag + salt → consent → leaflet notice seen →
   * chain and both validity dates (validTo >= today) → contributor eligibility → 3 leaflets/day.
   * An admin reader skips consent, notice, eligibility and the rate limit, and writes as
   * `isAdmin` + `trusted`.
   */
  async contribute(
    userId: string,
    chain: string | null,
    items: RawLeafletItem[],
    validFrom: string | null,
    validTo: string | null,
    opts: PromoContributionOptions = {},
  ): Promise<PromoContributionOutcome> {
    try {
      const salt = this.salt();
      if (!this.flagOn() || !salt) return 'disabled';
      const isAdmin = opts.isAdmin === true;
      const now = new Date();

      let user: { contributeCommunityPrices: boolean; leafletConsentNoticeAt: Date | null; createdAt: Date } | null =
        null;
      if (!isAdmin) {
        user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { contributeCommunityPrices: true, leafletConsentNoticeAt: true, createdAt: true },
        });
        if (!user?.contributeCommunityPrices) return 'no_consent';
        // Users who opted in before leaflets were part of the consent contribute only once they saw the notice.
        if (!user.leafletConsentNoticeAt) return 'no_notice';
      }

      const chainName = chain?.trim() ?? '';
      const from = parseYmd(validFrom);
      const to = parseYmd(validTo);
      if (
        !chainName ||
        chainName.length > PROMO_MAX_LABEL_LEN ||
        !from ||
        !to ||
        from.getTime() > to.getTime() ||
        to.getTime() < todayUtc(now).getTime()
      ) {
        return 'no_validity';
      }

      const contributorKey = computeContributorKey(salt, userId);
      let trusted = true;
      if (user) {
        const accountAgeDays = (now.getTime() - user.createdAt.getTime()) / DAY_MS;
        const expenseCount = await this.prisma.expense.count({ where: { userId, isDeleted: false } });
        if (
          !isEligibleContributor(
            accountAgeDays,
            expenseCount,
            this.intEnv('COMMUNITY_MIN_ACCOUNT_AGE_DAYS', COMMUNITY_MIN_ACCOUNT_AGE_DAYS),
            this.intEnv('COMMUNITY_MIN_CONTRIBUTOR_EXPENSES', COMMUNITY_MIN_CONTRIBUTOR_EXPENSES),
          )
        ) {
          return 'not_eligible';
        }
        if (!(await this.admitLeaflet(contributorKey, opts.leafletId))) return 'rate_limited';
        const sub = await this.prisma.subscription.findUnique({
          where: { userId },
          select: { tier: true, status: true, stripeSubscriptionId: true },
        });
        trusted = isTrustedContributor(
          accountAgeDays,
          sub,
          this.intEnv('COMMUNITY_TRUSTED_TENURE_DAYS', COMMUNITY_TRUSTED_TENURE_DAYS),
        );
      }

      const rows = [];
      for (const item of items) {
        const name = item.canonicalName?.trim();
        if (!name || name.length > PROMO_MAX_LABEL_LEN) continue;
        const price = Math.round(Number(item.promoPrice) * 100) / 100;
        if (!Number.isFinite(price) || price <= 0) continue;
        if (!CURRENCY.test(item.currencyCode ?? '')) continue;
        const condition = item.condition?.trim();
        rows.push({
          chain: chainName,
          canonicalName: name,
          promoPrice: price,
          currencyCode: item.currencyCode,
          condition: condition && condition.length <= PROMO_MAX_CONDITION_LEN ? condition : null,
          validFrom: from,
          validTo: to,
          contributorKey,
          trusted,
          isAdmin,
          adminLeafletId: null,
        });
      }
      if (rows.length > 0) {
        await this.prisma.communityPromoObservation.createMany({ data: rows, skipDuplicates: true });
      }
      return 'ok';
    } catch (e) {
      this.logger.warn(`contribute failed: ${e instanceof Error ? e.message : String(e)}`);
      return 'failed';
    }
  }

  /**
   * At most LEAFLETS_PER_DAY leaflets per contributor per day. The first page of a leaflet spends
   * one unit and its verdict is remembered for that (contributor, leaflet), so its later pages neither spend
   * another unit nor slip through after a refusal. `incrementWindow` throws on a Redis error, and
   * that refuses the page (fail closed).
   */
  private async admitLeaflet(contributorKey: string, leafletId?: string): Promise<boolean> {
    const verdictKey = leafletId ? `promo:contrib:lf:${contributorKey}:${leafletId}` : null;
    if (verdictKey) {
      const verdict = await this.cache.get<string>(verdictKey);
      if (verdict === 'ok') return true;
      if (verdict === 'limited') return false;
    }
    let count: number;
    try {
      count = await this.cache.incrementWindow(`promo:contrib:${contributorKey}`, DAY_MS);
    } catch (e) {
      this.logger.warn(`contribute skipped (rate limiter unavailable): ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    const ok = count <= LEAFLETS_PER_DAY;
    if (verdictKey) await this.cache.set(verdictKey, ok ? 'ok' : 'limited', DAY_SEC);
    return ok;
  }

  /**
   * Confirmed promos that are running today (validFrom <= today <= validTo, compared as UTC
   * `YYYY-MM-DD`). A row of an admin-uploaded leaflet counts only while that leaflet exists and
   * is not unpublished. The condition is taken only from an admin or a trusted row — a lone
   * untrusted contributor's free text is never pushed.
   */
  async confirmedActive(now: Date): Promise<ConfirmedPromo[]> {
    const rows = await this.prisma.communityPromoObservation.findMany({
      where: { validTo: { gte: todayUtc(now) } },
      select: {
        chain: true,
        canonicalName: true,
        promoPrice: true,
        currencyCode: true,
        condition: true,
        validFrom: true,
        validTo: true,
        contributorKey: true,
        trusted: true,
        isAdmin: true,
        adminLeafletId: true,
      },
    });

    const leafletIds = [...new Set(rows.map((r) => r.adminLeafletId).filter((id): id is string => !!id))];
    const live = new Set<string>();
    if (leafletIds.length > 0) {
      const leaflets = await this.prisma.leaflet.findMany({
        where: { id: { in: leafletIds } },
        select: { id: true, unpublishedAt: true },
      });
      for (const l of leaflets) if (!l.unpublishedAt) live.add(l.id);
    }

    const today = todayUtc(now).toISOString().slice(0, 10);
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      if (r.adminLeafletId && !live.has(r.adminLeafletId)) continue;
      // Not started yet: a leaflet read on Monday announces Thursday's promos.
      if (r.validFrom.toISOString().slice(0, 10) > today) continue;
      const key = promoKey(r);
      const group = groups.get(key);
      if (group) group.push(r);
      else groups.set(key, [r]);
    }

    const k = this.intEnv('COMMUNITY_PROMO_K', DEFAULT_PROMO_K, 1);
    const minTrusted = this.intEnv('COMMUNITY_PROMO_MIN_TRUSTED', DEFAULT_PROMO_MIN_TRUSTED);
    const out: ConfirmedPromo[] = [];
    for (const [key, group] of groups) {
      if (!isPromoConfirmed(group, k, minTrusted)) continue;
      const first = group.find((r) => r.isAdmin) ?? group[0];
      out.push({
        key,
        chain: first.chain,
        canonicalName: first.canonicalName,
        promoPrice: Number(first.promoPrice),
        currencyCode: first.currencyCode,
        condition: group.find((r) => r.isAdmin && r.condition)?.condition ?? group.find((r) => r.trusted && r.condition)?.condition ?? null,
        validFrom: first.validFrom.toISOString().slice(0, 10),
        validTo: first.validTo.toISOString().slice(0, 10),
      });
    }
    return out;
  }
}
