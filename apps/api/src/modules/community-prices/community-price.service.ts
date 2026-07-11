import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { GeocodingService } from '../ai/services/geocoding.service';
import { normalizeMerchantPL } from '../import-bank/merchants/merchants-pl';
import { mondayOfWeek, regionBucket, computeContributorKey } from './community-price.util';

// Sentinel stored in product_aliases.canonical_name to exclude a product from all
// tracking — same convention as price-history.service.ts (kept as its own private
// copy there; not exported, so this is a deliberate local duplicate of the value).
const IGNORED_SENTINEL = '__ignored__';

/**
 * ABA-335 (Community Price Map), M1 — write pipeline only. Builds the
 * anonymized `community_price_observations` corpus from OCR'd receipt line
 * items. Fire-and-forget + fail-silent by contract: `recordContribution` must
 * NEVER throw into its caller (receipt/expense saving must never break because
 * of this), so every failure path is caught and logged with `Logger.warn`,
 * never `Logger.error`.
 *
 * Privacy invariants (see schema.prisma model doc for the full rationale):
 *  - No accountId, userId, or expenseId is ever written to the observation row.
 *  - No user/contributor coordinates are stored — only the STORE's (point-of-
 *    sale) region, reverse-geocoded or grid-bucketed, never the exact address.
 *  - `contributorKey` is a salted one-way hash of accountId — used only for the
 *    one-vote-per-account-per-week dedup; never exposed to any client.
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
  ) {}

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
