import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateLeafletRequest,
  LeafletMatch,
  LeafletPageRequest,
  LeafletPageResult,
  LeafletPdfRequest,
  LeafletResult,
  LeafletStatus,
} from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { PriceHistoryService } from '../price-history/price-history.service';
import { ReceiptPdfService } from '../ai/services/receipt-pdf.service';
import { normalizeCommunityMerchant } from '../community-prices/community-price.util';
import { LeafletBudgetService } from './leaflet-budget.service';
import { LeafletReaderService } from './leaflet-reader.service';
import { CommunityPromoService } from './community-promo.service';
import { resolveBasketIndex, usualPrice, type BasketProduct } from './leaflet-basket.util';
import { loadUsualBasket, type BasketRow } from './leaflet-basket.loader';
import type { NormalizedLeafletPage } from './leaflet-page.util';

/** Pages per user share — matches the native share-intake cap of 10 files. */
export const LEAFLET_PAGE_CAP = 10;
/** Native PDF limit; a larger leaflet → "share screenshots instead". */
export const LEAFLET_PDF_MAX_BYTES = 10 * 1024 * 1024;

const DAY_MS = 86_400_000;
const DEFAULT_TTL_DAYS = 7;
/**
 * A personal leaflet still `reading` with no progress for this long is shown as `failed` (R12, as
 * for admin reads): every deploy force-recreates the api and strands an in-flight PDF read, and a
 * PDF upload refused before it reached the API (nginx 413) leaves a `reading` leaflet behind.
 */
export const PERSONAL_STALE_READ_MS = 30 * 60 * 1000;

interface ReadContext {
  basket: BasketProduct[];
  rows: BasketRow[];
  currency: string;
}

type LeafletRow = {
  id: string;
  chain: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  currencyCode: string | null;
  status: string;
  pagesRead: number;
  pagesUnreadable: number;
  pagesDropped: number;
};

type ItemRow = {
  id: string;
  name: string;
  promoPrice: unknown;
  regularPrice: unknown;
  currencyCode: string;
  condition: string | null;
  basketName: string | null;
  usualPrice: unknown;
};

const ymdToDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
const dateToYmd = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const num = (v: unknown): number | null => (v == null ? null : Number(v));

function isLimitError(err: unknown): boolean {
  if (!(err instanceof ForbiddenException)) return false;
  const res = err.getResponse();
  return typeof res === 'object' && res !== null && (res as { code?: string }).code === 'LEAFLET_LIMIT';
}

/** Estimated decoded size of a base64 string, without allocating the buffer. */
function base64Bytes(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * Gazetka match, single-player: reads promo-leaflet pages (one vision call each), matches the
 * offers against the user's usual basket (closed set) and keeps the extracted facts only —
 * never the image or PDF. Every query is scoped by the guard's accountId.
 */
@Injectable()
export class LeafletsService {
  private readonly logger = new Logger(LeafletsService.name);
  /** Last progress of the PDF reads running in THIS process (single api instance), by leaflet id. */
  private readonly activeReads = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly budget: LeafletBudgetService,
    private readonly reader: LeafletReaderService,
    private readonly priceHistory: PriceHistoryService,
    private readonly pdf: ReceiptPdfService,
    private readonly promos: CommunityPromoService,
  ) {}

  async create(accountId: string, userId: string, dto: CreateLeafletRequest): Promise<{ id: string }> {
    await this.loadContext(accountId);
    const now = new Date();
    const leaflet = await this.prisma.leaflet.create({
      data: {
        accountId,
        userId,
        kind: 'personal',
        source: dto.source,
        platform: dto.platform ?? null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + DEFAULT_TTL_DAYS * DAY_MS),
      },
      select: { id: true },
    });
    return { id: leaflet.id };
  }

  async readPage(
    accountId: string,
    userId: string,
    leafletId: string,
    dto: LeafletPageRequest,
    isAdmin: boolean,
  ): Promise<LeafletPageResult> {
    const leaflet = await this.findOwned(accountId, leafletId);
    // R1: the cap is checked before the budget, so a PAGE_CAP page charges nothing.
    if (leaflet.pagesRead + leaflet.pagesUnreadable >= LEAFLET_PAGE_CAP) {
      await this.countDropped(leafletId, 1);
      throw new ConflictException({ message: `At most ${LEAFLET_PAGE_CAP} pages per leaflet.`, code: 'PAGE_CAP' });
    }
    const ctx = await this.loadContext(accountId);
    if (!isAdmin) {
      try {
        await this.budget.consume(userId, accountId, 1);
      } catch (err) {
        if (isLimitError(err)) await this.countDropped(leafletId, 1);
        throw err;
      }
    }
    return this.processPage(leafletId, userId, dto.imageBase64, dto.mimeType ?? 'image/jpeg', ctx, isAdmin, 'done');
  }

  async startPdf(
    accountId: string,
    userId: string,
    leafletId: string,
    dto: LeafletPdfRequest,
    isAdmin: boolean,
  ): Promise<{ id: string }> {
    await this.findOwned(accountId, leafletId);
    if (base64Bytes(dto.pdfBase64) > LEAFLET_PDF_MAX_BYTES) {
      throw new PayloadTooLargeException({
        message: 'Leaflet PDF is larger than 10 MB — share screenshots instead.',
        code: 'PDF_TOO_LARGE',
      });
    }
    // EMPTY_BASKET / ENCRYPTED_ACCOUNT answer synchronously, before anything starts.
    const ctx = await this.loadContext(accountId);
    // No pages left this month: refuse now so the client can open the paywall, rather than starting
    // a background read whose first page would be dropped silently. Admins are exempt (R3).
    if (!isAdmin) {
      const { used, limit } = await this.budget.get(userId);
      if (used >= limit) {
        await this.prisma.leaflet.update({ where: { id: leafletId }, data: { status: 'failed' } });
        throw new ForbiddenException({
          message: `Leaflet page limit reached (${limit} per month).`,
          code: 'LEAFLET_LIMIT',
        });
      }
    }
    const buf = Buffer.from(dto.pdfBase64, 'base64');
    await this.prisma.leaflet.update({ where: { id: leafletId }, data: { status: 'reading' } });
    void this.readPdf(accountId, userId, leafletId, buf, isAdmin, ctx).catch(
      logFireAndForget(this.logger, 'LeafletsService.readPdf'),
    );
    return { id: leafletId };
  }

  /** Background PDF read. Pages are metered one by one; LEAFLET_LIMIT stops it, the rest are dropped. */
  async readPdf(
    accountId: string,
    userId: string,
    leafletId: string,
    buf: Buffer,
    isAdmin: boolean,
    preloaded?: ReadContext,
  ): Promise<void> {
    this.activeReads.set(leafletId, Date.now());
    try {
      const [pages, total] = await Promise.all([
        this.pdf.renderToPngs(buf, undefined, LEAFLET_PAGE_CAP),
        this.pdf.countPages(buf),
      ]);
      // Pages past the render cap are never read; report them as dropped, not lost.
      const beyondCap = Math.max(0, (total ?? pages.length) - Math.max(pages.length, LEAFLET_PAGE_CAP));
      if (beyondCap > 0) await this.countDropped(leafletId, beyondCap);
      const ctx = preloaded ?? (await this.loadContext(accountId));
      const current = await this.prisma.leaflet.findUnique({ where: { id: leafletId } });
      let accepted = current ? current.pagesRead + current.pagesUnreadable : 0;
      for (let i = 0; i < pages.length; i++) {
        const remaining = pages.length - i;
        if (accepted >= LEAFLET_PAGE_CAP) {
          await this.countDropped(leafletId, remaining);
          break;
        }
        if (!isAdmin) {
          try {
            await this.budget.consume(userId, accountId, 1);
          } catch (err) {
            if (!isLimitError(err)) throw err;
            await this.countDropped(leafletId, remaining);
            break;
          }
        }
        await this.processPage(leafletId, userId, pages[i].toString('base64'), 'image/png', ctx, isAdmin, 'reading');
        this.activeReads.set(leafletId, Date.now());
        accepted++;
      }
      await this.prisma.leaflet.update({ where: { id: leafletId }, data: { status: 'done' } });
    } catch (err) {
      await this.prisma.leaflet.update({ where: { id: leafletId }, data: { status: 'failed' } });
      throw err;
    } finally {
      this.activeReads.delete(leafletId);
    }
  }

  async findOne(accountId: string, leafletId: string): Promise<LeafletResult> {
    const leaflet = await this.prisma.leaflet.findFirst({
      where: { id: leafletId, accountId, kind: 'personal' },
      include: { items: { orderBy: [{ page: 'asc' }, { name: 'asc' }] } },
    });
    if (!leaflet) throw new NotFoundException('Leaflet not found');
    await this.expireStaleRead(leaflet);
    return this.toResult(leaflet, leaflet.items);
  }

  async findActive(accountId: string): Promise<LeafletResult[]> {
    const leaflets = await this.prisma.leaflet.findMany({
      where: { accountId, kind: 'personal', expiresAt: { gt: new Date() } },
      include: { items: { orderBy: [{ page: 'asc' }, { name: 'asc' }] } },
      orderBy: { createdAt: 'desc' },
    });
    await Promise.all(leaflets.map((l) => this.expireStaleRead(l)));
    return leaflets.map((l) => this.toResult(l, l.items));
  }

  /** Stamps addedToListAt once; an item of another account is a 404. */
  async markAdded(accountId: string, itemId: string): Promise<void> {
    const { count } = await this.prisma.leafletItem.updateMany({
      where: { id: itemId, addedToListAt: null, leaflet: { accountId } },
      data: { addedToListAt: new Date() },
    });
    if (count > 0) return;
    const exists = await this.prisma.leafletItem.findFirst({
      where: { id: itemId, leaflet: { accountId } },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Leaflet item not found');
  }

  /**
   * Open tracking of the community promo push: stamps `openedAt` on the log row whose id is the
   * push's `pushKey`, only where that row belongs to the caller's own default account (the
   * account the push was computed for), and only the first time. Anything else is a silent no-op.
   */
  async markPushOpened(userId: string, pushKey: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { defaultAccountId: true } });
    if (!user?.defaultAccountId) return;
    await this.prisma.leafletNotificationLog.updateMany({
      where: { id: pushKey, accountId: user.defaultAccountId, openedAt: null },
      data: { openedAt: new Date() },
    });
  }

  // ── private ─────────────────────────────────────────────────────────────

  private async findOwned(accountId: string, leafletId: string) {
    const leaflet = await this.prisma.leaflet.findFirst({ where: { id: leafletId, accountId, kind: 'personal' } });
    if (!leaflet) throw new NotFoundException('Leaflet not found');
    return leaflet;
  }

  /** R12 for personal leaflets: see PERSONAL_STALE_READ_MS. Mutates `l.status` for the response. */
  private async expireStaleRead(l: { id: string; status: string; createdAt: Date }): Promise<void> {
    if (l.status !== 'reading') return;
    const lastProgress = this.activeReads.get(l.id) ?? l.createdAt.getTime();
    if (Date.now() - lastProgress <= PERSONAL_STALE_READ_MS) return;
    await this.prisma.leaflet.updateMany({ where: { id: l.id, status: 'reading' }, data: { status: 'failed' } });
    l.status = 'failed';
    this.logger.warn(`[Leaflet] ${l.id}: read made no progress for 30 min — marked failed`);
  }

  private async countDropped(leafletId: string, pages: number): Promise<void> {
    await this.prisma.leaflet.update({ where: { id: leafletId }, data: { pagesDropped: { increment: pages } } });
  }

  /** Account checks + the usual basket. Throws before any budget is touched. */
  private async loadContext(accountId: string): Promise<ReadContext> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { currencyCode: true, encryptionTier: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.encryptionTier >= 2) {
      throw new ForbiddenException({
        message: 'Usual prices cannot be computed because item prices are encrypted on this account.',
        code: 'ENCRYPTED_ACCOUNT',
      });
    }
    const { basket, rows } = await loadUsualBasket(this.prisma, this.priceHistory, accountId, new Date());
    if (basket.length === 0) {
      throw new UnprocessableEntityException({
        message: 'Scan a few receipts first — there is no usual basket to compare a leaflet with.',
        code: 'EMPTY_BASKET',
      });
    }
    return { basket, rows, currency: account.currencyCode };
  }

  private async processPage(
    leafletId: string,
    userId: string,
    imageBase64: string,
    mimeType: string,
    ctx: ReadContext,
    isAdmin: boolean,
    status: LeafletStatus,
  ): Promise<LeafletPageResult> {
    let read: NormalizedLeafletPage;
    try {
      read = await this.reader.readPage(imageBase64, mimeType, ctx.basket, ctx.currency);
    } catch (err) {
      this.logger.warn(`[Leaflet] page read failed for ${leafletId}: ${err instanceof Error ? err.message : err}`);
      read = { readable: false, chain: null, validFrom: null, validTo: null, items: [] };
    }

    const current = await this.prisma.leaflet.findUnique({ where: { id: leafletId } });
    const pageNo = (current ? current.pagesRead + current.pagesUnreadable : 0) + 1;

    if (!read.readable) {
      if (!isAdmin) await this.budget.refund(userId, 1);
      await this.prisma.leaflet.update({
        where: { id: leafletId },
        data: { pagesUnreadable: { increment: 1 }, status },
      });
      this.logger.log(`[Leaflet] ${leafletId} page ${pageNo}: unreadable`);
      return { page: pageNo, readable: false, matches: [], unmatchedCount: 0 };
    }

    const now = new Date();
    const used = new Set<number>();
    const items = read.items.map((item) => {
      const basketName = item.basketIndex == null ? null : resolveBasketIndex(item.basketIndex, ctx.basket, used);
      return {
        id: randomUUID(),
        leafletId,
        page: pageNo,
        name: item.name,
        canonicalName: item.canonicalName,
        promoPrice: item.promoPrice,
        regularPrice: item.regularPrice,
        currencyCode: item.currencyCode,
        condition: item.condition,
        validFrom: item.validFrom ? ymdToDate(item.validFrom) : null,
        validTo: item.validTo ? ymdToDate(item.validTo) : null,
        basketName,
        usualPrice: basketName ? usualPrice(ctx.rows, basketName, item.currencyCode, now) : null,
      };
    });
    await this.prisma.leafletItem.createMany({ data: items });

    // First non-null value across pages wins.
    const header: {
      chain?: string;
      validFrom?: Date;
      validTo?: Date;
      expiresAt?: Date;
      currencyCode?: string;
    } = {};
    const chain = normalizeCommunityMerchant(read.chain);
    if (!current?.chain && chain) header.chain = chain;
    if (!current?.validFrom && read.validFrom) header.validFrom = ymdToDate(read.validFrom);
    if (!current?.validTo && read.validTo) {
      header.validTo = ymdToDate(read.validTo);
      header.expiresAt = new Date(header.validTo.getTime() + DAY_MS);
    }
    if (!current?.currencyCode && items[0]) header.currencyCode = items[0].currencyCode;

    await this.prisma.leaflet.update({
      where: { id: leafletId },
      data: { ...header, pagesRead: { increment: 1 }, status },
    });

    // Community promo layer: fire-and-forget, never awaited — it can neither fail nor slow the page.
    // The leaflet-level chain and validity (first non-null across pages) apply to every item.
    void this.promos
      .contribute(
        userId,
        current?.chain ?? chain,
        read.items,
        dateToYmd(current?.validFrom ?? null) ?? read.validFrom,
        dateToYmd(current?.validTo ?? null) ?? read.validTo,
        { isAdmin, leafletId },
      )
      .catch(logFireAndForget(this.logger, 'LeafletsService.contributePromos'));

    const matches = items.filter((i) => i.basketName != null).map((i) => this.toMatch(i));
    const unmatchedCount = items.length - matches.length;
    // Counts only — product names never reach the logs.
    this.logger.log(`[Leaflet] ${leafletId} page ${pageNo}: ${items.length} items, ${matches.length} matched, ${unmatchedCount} unmatched`);
    return { page: pageNo, readable: true, matches, unmatchedCount };
  }

  private toMatch(i: ItemRow): LeafletMatch {
    return {
      itemId: i.id,
      name: i.name,
      promoPrice: Number(i.promoPrice),
      regularPrice: num(i.regularPrice),
      currencyCode: i.currencyCode,
      condition: i.condition,
      basketName: i.basketName as string,
      usualPrice: num(i.usualPrice),
    };
  }

  private toResult(leaflet: LeafletRow, items: ItemRow[]): LeafletResult {
    const matches = items.filter((i) => i.basketName != null).map((i) => this.toMatch(i));
    return {
      id: leaflet.id,
      chain: leaflet.chain,
      validFrom: dateToYmd(leaflet.validFrom),
      validTo: dateToYmd(leaflet.validTo),
      status: leaflet.status as LeafletStatus,
      pagesRead: leaflet.pagesRead,
      pagesUnreadable: leaflet.pagesUnreadable,
      pagesDropped: leaflet.pagesDropped,
      matches,
      unmatchedCount: items.length - matches.length,
    };
  }
}
