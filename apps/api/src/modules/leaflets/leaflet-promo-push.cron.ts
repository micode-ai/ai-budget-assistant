import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { normalizeCommunityMerchant } from '../community-prices/community-price.util';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';
import { PriceHistoryService } from '../price-history/price-history.service';
import { CommunityPromoService, type ConfirmedPromo } from './community-promo.service';
import { LeafletPushMatchService } from './leaflet-push-match.service';
import { LeafletNotificationLedger } from './leaflet-notification-ledger.service';
import { loadUsualBasket } from './leaflet-basket.loader';
import { usualPrice } from './leaflet-basket.util';
import { pushCandidatePages, pushableChains, type PushCandidate } from './leaflet-push-candidates';

const MAX_ITEMS_PER_PUSH = 3;
const PUSH_TYPE = 'leaflet_promo';
/**
 * "At most one push per user per day". A literal 24 h floor would skip every other day: the cron
 * starts at 09:00 but a user's row is written minutes into the run, so tomorrow's run reaches the
 * same user a little less than 24 h later. 20 h still blocks any second push on the same day.
 */
const PUSH_FLOOR_DAYS = 20 / 24;
const LOG_RETENTION_DAYS = 90;

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Gazetka match, community push (flag `COMMUNITY_PROMOS_ENABLED`, default OFF). Once a day, tells
 * a user about CONFIRMED community promos on products in their usual basket — only at a chain they
 * bought at in the last 90 days, at most one push a day, each promo at most once per user, never an
 * ended promo, never for an account whose item prices are encrypted. The pairing is closed-set by
 * one model call per user (a server cost, never charged to the user's budgets).
 */
@Injectable()
export class LeafletPromoPushCron {
  private readonly logger = new Logger(LeafletPromoPushCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly promos: CommunityPromoService,
    private readonly priceHistory: PriceHistoryService,
    private readonly matcher: LeafletPushMatchService,
    private readonly ledger: LeafletNotificationLedger,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 9 * * *')
  async handle(): Promise<void> {
    try {
      await this.run(new Date());
    } catch (e) {
      this.logger.warn(`leaflet promo push run failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async run(now: Date): Promise<void> {
    if (this.config.get<string>('COMMUNITY_PROMOS_ENABLED') !== 'true') return;

    // confirmedActive already drops ended and not-yet-started promos; checked again here because
    // a push about a promo that is not on today is the one thing this must never do.
    const today = ymd(now);
    const active = (await this.promos.confirmedActive(now)).filter((p) => p.validFrom <= today && p.validTo >= today);
    if (active.length === 0) return;

    const byChain = new Map<string, ConfirmedPromo[]>();
    for (const p of active) {
      const chain = normalizeCommunityMerchant(p.chain);
      if (!chain) continue;
      const list = byChain.get(chain);
      if (list) list.push(p);
      else byChain.set(chain, [p]);
    }
    if (byChain.size === 0) return;

    let sent = 0;
    const pages = pushCandidatePages(this.prisma);
    for await (const batch of pages) {
      for (const user of batch) {
        try {
          if (await this.processUser(user, byChain, now)) sent++;
        } catch (e) {
          this.logger.warn(`leaflet promo push failed for user ${user.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    if (sent > 0) this.logger.log(`Sent ${sent} leaflet promo push(es)`);
  }

  /** @returns true when a push was sent. */
  private async processUser(user: PushCandidate, byChain: Map<string, ConfirmedPromo[]>, now: Date): Promise<boolean> {
    const accountId = user.defaultAccountId;
    if (!accountId) return false;
    if (await this.ledger.withinFloor(accountId, PUSH_TYPE, PUSH_FLOOR_DAYS, now)) return false;

    // Not encrypted, and the chains this account bought at in the last 90 days.
    const chains = await pushableChains(this.prisma, accountId, now);
    if (!chains) return false;
    const atChains = [...chains].flatMap((c) => byChain.get(c) ?? []);
    if (atChains.length === 0) return false;

    // Already-pushed promos are dropped before the model call, so they cost nothing.
    const pushed = await this.ledger.recordedKeys(accountId, atChains.map((p) => p.key));
    const candidates = atChains.filter((p) => !pushed.has(p.key));
    if (candidates.length === 0) return false;

    const { basket, rows } = await loadUsualBasket(this.prisma, this.priceHistory, accountId, now);
    if (basket.length === 0) return false;
    const pairs = await this.matcher.match(basket, candidates);
    if (pairs.length === 0) return false;

    const items: ni18n.LeafletPromoItemParams[] = [];
    let pushKey: string | null = null;
    for (const pair of pairs) {
      if (items.length >= MAX_ITEMS_PER_PUSH) break;
      const promo = candidates[pair.promoIndex];
      const id = await this.ledger.recordWithId(accountId, PUSH_TYPE, promo.key);
      if (!id) continue; // recorded concurrently — already pushed
      pushKey ??= id;
      // Compared only with what they usually pay in the promo's own currency — never converted.
      const usual = usualPrice(rows, pair.basketName, promo.currencyCode, now);
      items.push({
        name: pair.basketName,
        chain: promo.chain,
        promoPrice: promo.promoPrice.toFixed(2),
        currencyCode: promo.currencyCode,
        usualPrice: usual != null ? usual.toFixed(2) : null,
        condition: promo.condition,
        validTo: promo.validTo,
      });
    }
    if (!pushKey || items.length === 0) return false;

    return this.notifications.sendToUser(
      user.id,
      (lang) => ni18n.leafletPromoTitle(lang),
      (lang) => ni18n.leafletPromoBody(lang, items),
      { type: PUSH_TYPE, pushKey },
      PUSH_TYPE,
    );
  }

  @Cron('15 3 * * *')
  async cleanupOldLogs(): Promise<void> {
    try {
      const deleted = await this.ledger.deleteOlderThan(LOG_RETENTION_DAYS);
      if (deleted) this.logger.log(`cleaned ${deleted} old leaflet notification log rows`);
    } catch (e) {
      this.logger.warn(`leaflet notification log cleanup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
