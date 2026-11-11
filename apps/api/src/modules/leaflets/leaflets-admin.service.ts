import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  AdminLeafletDetail,
  AdminLeafletItem,
  AdminLeafletPublishResult,
  AdminLeafletStats,
  AdminLeafletSummary,
  LeafletStatus,
  UpdateAdminLeafletItemRequest,
  UpdateAdminLeafletRequest,
} from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { parseAdminEmails } from '../admin/admin-emails.util';
import { ReceiptPdfService } from '../ai/services/receipt-pdf.service';
import { normalizeCommunityMerchant } from '../community-prices/community-price.util';
import { CommunityPromoService, PROMO_MAX_CONDITION_LEN, PROMO_MAX_LABEL_LEN } from './community-promo.service';
import { LeafletReaderService } from './leaflet-reader.service';
import { pushCandidatePages, pushableChains } from './leaflet-push-candidates';
import type { NormalizedLeafletPage } from './leaflet-page.util';

/** Defaults for `LEAFLET_ADMIN_MAX_PAGES` / `LEAFLET_ADMIN_MAX_MB`. */
export const LEAFLET_ADMIN_MAX_PAGES = 60;
export const LEAFLET_ADMIN_MAX_MB = 50;

const DAY_MS = 86_400_000;
const PUSH_TYPE = 'leaflet_promo';
const LIST_LIMIT = 100;
const DEFAULT_STATS_DAYS = 30;
const MAX_STATS_DAYS = 365;
/** An unpublished admin leaflet is never pruned (the prune cron skips `kind: 'admin'`); this only fills the column. */
const DRAFT_TTL_DAYS = 30;
const FALLBACK_CURRENCY = 'PLN';
/**
 * A `reading` admin leaflet with no progress for this long is treated as failed: the API restarts on
 * every deploy, and a background read does not survive it. Progress is tracked in-process (the
 * table has no updatedAt); a read this process does not know about falls back to `createdAt`.
 */
export const STALE_READ_MS = 30 * 60 * 1000;
const IMAGE_MIME = /^image\/(png|jpeg|jpg|webp)$/;
const PDF_MIME = 'application/pdf';
const CURRENCY = /^[A-Z]{3}$/;

/** The subset of `Express.Multer.File` the service reads. */
export interface AdminLeafletFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/** What one background read works through: images as uploaded, or one PDF to render. */
export type AdminLeafletSource = { kind: 'images'; files: AdminLeafletFile[] } | { kind: 'pdf'; buffer: Buffer };

type AdminLeafletRow = {
  id: string;
  chain: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  currencyCode: string | null;
  status: string;
  pagesRead: number;
  pagesUnreadable: number;
  pagesDropped: number;
  publishedAt: Date | null;
  unpublishedAt: Date | null;
  createdAt: Date;
};

type AdminItemRow = {
  id: string;
  page: number;
  name: string;
  canonicalName: string;
  promoPrice: unknown;
  regularPrice: unknown;
  currencyCode: string;
  condition: string | null;
  validFrom: Date | null;
  validTo: Date | null;
};

const ymdToDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
const dateToYmd = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const todayUtc = (now: Date): Date => ymdToDate(now.toISOString().slice(0, 10));
const isLive = (l: { publishedAt: Date | null; unpublishedAt: Date | null }): boolean =>
  !!l.publishedAt && !l.unpublishedAt;

/**
 * Gazetka match, admin side (`/admin/leaflets`, `JwtAuthGuard + AdminGuard`). An admin uploads a
 * whole promo leaflet; every page is read in the background with an EMPTY basket (extraction only —
 * there is no account to match against), the extracted offers are reviewed and edited, and Publish
 * writes them as `isAdmin` + `trusted` community promo observations, which confirm on their own.
 *
 * Never persisted: the uploaded images and PDF. Only the extracted facts are stored.
 * Never charged: the leaflet page budget (`LeafletBudgetService` is not even injected) — admin
 * uploads need no budget and no consent.
 *
 * Edit rule: a LIVE leaflet (published and not unpublished) is read-only — item and header edits
 * answer 409. To correct one: unpublish → edit → publish; publish replaces every observation row
 * of that leaflet (`adminLeafletId`), so it is idempotent and an edit is never left half-applied.
 */
@Injectable()
export class LeafletsAdminService {
  private readonly logger = new Logger(LeafletsAdminService.name);
  /** leafletId → time of the last page progress, for reads running in THIS process. */
  private readonly activeReads = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly reader: LeafletReaderService,
    private readonly pdf: ReceiptPdfService,
    private readonly promos: CommunityPromoService,
  ) {}

  /** Validates the files, creates the leaflet and starts the background read. */
  async upload(adminUserId: string, files: AdminLeafletFile[]): Promise<{ id: string }> {
    const source = this.toSource(files);
    const maxBytes = this.intEnv('LEAFLET_ADMIN_MAX_MB', LEAFLET_ADMIN_MAX_MB) * 1024 * 1024;
    const total = files.reduce((sum, f) => sum + (f.size ?? f.buffer.length), 0);
    if (total > maxBytes) {
      throw new PayloadTooLargeException({
        message: `A leaflet upload is limited to ${maxBytes / 1024 / 1024} MB.`,
        code: 'LEAFLET_TOO_LARGE',
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: adminUserId }, select: { currencyCode: true } });
    const currency = user?.currencyCode ?? FALLBACK_CURRENCY;
    const now = new Date();
    const leaflet = await this.prisma.leaflet.create({
      data: {
        accountId: null,
        userId: adminUserId,
        kind: 'admin',
        source: 'admin',
        platform: null,
        status: 'reading',
        createdAt: now,
        expiresAt: new Date(now.getTime() + DRAFT_TTL_DAYS * DAY_MS),
      },
      select: { id: true },
    });
    void this.readAll(leaflet.id, source, currency).catch(logFireAndForget(this.logger, 'LeafletsAdminService.readAll'));
    return { id: leaflet.id };
  }

  /**
   * Background read of every page (progress is visible through `GET /admin/leaflets/:id`). Pages
   * past `LEAFLET_ADMIN_MAX_PAGES` are never rendered or read; they are counted as dropped.
   */
  async readAll(leafletId: string, source: AdminLeafletSource, currency: string): Promise<void> {
    const maxPages = this.intEnv('LEAFLET_ADMIN_MAX_PAGES', LEAFLET_ADMIN_MAX_PAGES);
    this.activeReads.set(leafletId, Date.now());
    try {
      const { read, dropped } =
        source.kind === 'pdf'
          ? await this.readPdf(leafletId, source.buffer, maxPages, currency)
          : await this.readImages(leafletId, source.files, maxPages, currency);
      // Only from `reading`: a read already declared stale (failed) stays failed.
      await this.prisma.leaflet.updateMany({ where: { id: leafletId, status: 'reading' }, data: { status: 'done' } });
      this.logger.log(`[Leaflet admin] ${leafletId}: read ${read} page(s), ${dropped} dropped`);
    } catch (err) {
      await this.prisma.leaflet.update({ where: { id: leafletId }, data: { status: 'failed' } });
      throw err;
    } finally {
      this.activeReads.delete(leafletId);
    }
  }

  private async readImages(
    leafletId: string,
    files: AdminLeafletFile[],
    maxPages: number,
    currency: string,
  ): Promise<{ read: number; dropped: number }> {
    const pages = files.slice(0, maxPages).map((f) => ({ buffer: f.buffer, mimeType: f.mimetype }));
    const dropped = files.length - pages.length;
    await this.addDropped(leafletId, dropped);
    for (let i = 0; i < pages.length; i++) {
      const { buffer, mimeType } = pages[i];
      // Let each page's bytes go as soon as it is read — nothing is kept.
      pages[i] = { buffer: Buffer.alloc(0), mimeType };
      await this.readOne(leafletId, i + 1, buffer.toString('base64'), mimeType, currency);
      this.activeReads.set(leafletId, Date.now());
    }
    return { read: pages.length, dropped };
  }

  /**
   * The page count comes first (never in parallel with rendering), then the pages are rendered a
   * few at a time (`renderPageChunks`, one pdftoppm spawn and timeout per chunk) and each chunk is
   * read and released before the next is rendered — a 60-page leaflet never sits in memory whole.
   * A chunk that fails after some pages were read ends the read there: the pages read stay, the
   * rest are counted as dropped (when the total is known). A failure before any page was read
   * fails the leaflet.
   */
  private async readPdf(
    leafletId: string,
    pdf: Buffer,
    maxPages: number,
    currency: string,
  ): Promise<{ read: number; dropped: number }> {
    const count = await this.pdf.countPages(pdf);
    const last = count == null ? maxPages : Math.min(count, maxPages);
    let dropped = count == null ? 0 : count - last;
    await this.addDropped(leafletId, dropped);
    let pageNo = 0;
    try {
      for await (const chunk of this.pdf.renderPageChunks(pdf, last)) {
        for (let i = 0; i < chunk.length && pageNo < last; i++) {
          const buffer = chunk[i];
          chunk[i] = Buffer.alloc(0);
          pageNo++;
          await this.readOne(leafletId, pageNo, buffer.toString('base64'), 'image/png', currency);
          this.activeReads.set(leafletId, Date.now());
        }
      }
    } catch (err) {
      if (pageNo === 0) throw err;
      const lost = count == null ? 0 : last - pageNo;
      this.logger.warn(
        `[Leaflet admin] ${leafletId}: rendering stopped after page ${pageNo} (${lost} more dropped): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await this.addDropped(leafletId, lost);
      dropped += lost;
    }
    return { read: pageNo, dropped };
  }

  private async addDropped(leafletId: string, n: number): Promise<void> {
    if (n > 0) {
      await this.prisma.leaflet.update({ where: { id: leafletId }, data: { pagesDropped: { increment: n } } });
    }
  }

  async list(): Promise<AdminLeafletSummary[]> {
    const rows = await this.prisma.leaflet.findMany({
      where: { kind: 'admin' },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    await Promise.all(rows.map((l) => this.expireStaleRead(l)));
    return rows.map((l) => this.toSummary(l, l._count.items));
  }

  async findOne(id: string): Promise<AdminLeafletDetail> {
    const l = await this.findAdmin(id);
    return { ...this.toSummary(l, l.items.length), items: l.items.map((i) => this.toItem(i)) };
  }

  async updateLeaflet(id: string, dto: UpdateAdminLeafletRequest): Promise<AdminLeafletDetail> {
    const l = await this.findAdmin(id);
    this.assertEditable(l);
    const data: { chain?: string; validFrom?: Date | null; validTo?: Date | null; expiresAt?: Date } = {};
    if (dto.chain !== undefined) {
      const chain = normalizeCommunityMerchant(dto.chain);
      if (!chain || chain.length > PROMO_MAX_LABEL_LEN) {
        throw new BadRequestException({ message: 'Unrecognised chain name.', code: 'INVALID_CHAIN' });
      }
      data.chain = chain;
    }
    if (dto.validFrom !== undefined) data.validFrom = dto.validFrom ? ymdToDate(dto.validFrom) : null;
    if (dto.validTo !== undefined) {
      data.validTo = dto.validTo ? ymdToDate(dto.validTo) : null;
      if (data.validTo) data.expiresAt = new Date(data.validTo.getTime() + DAY_MS);
    }
    await this.prisma.leaflet.update({ where: { id }, data });
    return this.findOne(id);
  }

  async updateItem(id: string, itemId: string, dto: UpdateAdminLeafletItemRequest): Promise<AdminLeafletItem> {
    const l = await this.findAdmin(id);
    this.assertEditable(l);
    const item = await this.findItem(id, itemId);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.canonicalName !== undefined) data.canonicalName = dto.canonicalName;
    if (dto.promoPrice !== undefined) data.promoPrice = Math.round(dto.promoPrice * 100) / 100;
    if (dto.regularPrice !== undefined) {
      data.regularPrice = dto.regularPrice == null ? null : Math.round(dto.regularPrice * 100) / 100;
    }
    if (dto.condition !== undefined) data.condition = dto.condition ? dto.condition : null;
    const updated = await this.prisma.leafletItem.update({ where: { id: item.id }, data });
    return this.toItem(updated);
  }

  async deleteItem(id: string, itemId: string): Promise<void> {
    const l = await this.findAdmin(id);
    this.assertEditable(l);
    const item = await this.findItem(id, itemId);
    await this.prisma.leafletItem.delete({ where: { id: item.id } });
  }

  /**
   * How many users the community push would reach for this leaflet's chain — the push cron's own
   * candidate filters (`notifyLeafletPromos`, push token, not encrypted, bought at the chain in 90
   * days), without the per-user model match or the daily floor. An upper bound.
   */
  async recipients(id: string, now = new Date()): Promise<{ users: number }> {
    const l = await this.findAdmin(id);
    const chain = normalizeCommunityMerchant(l.chain);
    if (!chain) return { users: 0 };
    let users = 0;
    for await (const batch of pushCandidatePages(this.prisma)) {
      for (const u of batch) {
        if (!u.defaultAccountId) continue;
        const chains = await pushableChains(this.prisma, u.defaultAccountId, now);
        if (chains?.has(chain)) users++;
      }
    }
    return { users };
  }

  /**
   * Requires a chain, both validity dates (`validTo >= today`) and at least one publishable item.
   * Replaces this leaflet's observation rows and stamps `publishedAt` in one transaction; works
   * while `COMMUNITY_PROMOS_ENABLED` is off (the rows wait for the flag).
   */
  async publish(id: string, adminUserId: string, now = new Date()): Promise<AdminLeafletPublishResult> {
    const l = await this.findAdmin(id);
    if (l.status === 'reading') {
      throw new ConflictException({ message: 'The leaflet is still being read.', code: 'LEAFLET_READING' });
    }
    const chain = normalizeCommunityMerchant(l.chain);
    if (!chain || chain.length > PROMO_MAX_LABEL_LEN) this.invalid('A chain is required to publish.', 'CHAIN_REQUIRED');
    if (!l.validFrom || !l.validTo) this.invalid('Both validity dates are required to publish.', 'VALIDITY_REQUIRED');
    const today = todayUtc(now);
    if (l.validFrom.getTime() > l.validTo.getTime()) this.invalid('validFrom is after validTo.', 'VALIDITY_INVALID');
    if (l.validTo.getTime() < today.getTime()) this.invalid('This leaflet has already ended.', 'VALIDITY_ENDED');
    if (l.items.length === 0) this.invalid('There are no items to publish.', 'NO_ITEMS');
    // Keyed PER LEAFLET: the observation unique key ends in contributorKey, so one key for all of an
    // admin's leaflets would let leaflet B's identical promo be dropped as a duplicate of A's — and
    // unpublishing A would then hide it. Admin rows confirm on their own, so this changes no verdict.
    const contributorKey = this.promos.contributorKeyFor(`${adminUserId}:${id}`);
    if (!contributorKey) {
      this.invalid('COMMUNITY_PRICE_SALT is not configured (32+ characters).', 'COMMUNITY_SALT_MISSING');
    }

    const rows = [];
    for (const item of l.items) {
      const name = item.canonicalName?.trim();
      if (!name || name.length > PROMO_MAX_LABEL_LEN) continue;
      const price = Math.round(Number(item.promoPrice) * 100) / 100;
      if (!Number.isFinite(price) || price <= 0) continue;
      if (!CURRENCY.test(item.currencyCode ?? '')) continue;
      // An item's own validity overrides the leaflet's; an item that has already ended is not published.
      const from = item.validFrom ?? l.validFrom;
      const to = item.validTo ?? l.validTo;
      if (from.getTime() > to.getTime() || to.getTime() < today.getTime()) continue;
      const condition = item.condition?.trim();
      rows.push({
        chain,
        canonicalName: name,
        promoPrice: price,
        currencyCode: item.currencyCode,
        condition: condition && condition.length <= PROMO_MAX_CONDITION_LEN ? condition : null,
        validFrom: from,
        validTo: to,
        contributorKey,
        trusted: true,
        isAdmin: true,
        adminLeafletId: id,
      });
    }
    if (rows.length === 0) this.invalid('None of the items can be published.', 'NO_ITEMS');

    const [, created] = await this.prisma.$transaction([
      this.prisma.communityPromoObservation.deleteMany({ where: { adminLeafletId: id } }),
      this.prisma.communityPromoObservation.createMany({ data: rows, skipDuplicates: true }),
      this.prisma.leaflet.update({
        where: { id },
        data: { publishedAt: now, unpublishedAt: null, expiresAt: new Date(l.validTo.getTime() + DAY_MS) },
      }),
    ]);
    this.logger.log(`[Leaflet admin] ${id}: published ${created.count} of ${rows.length} promo(s)`);
    return { ...(await this.findOne(id)), promosWritten: created.count };
  }

  /** `confirmedActive` stops returning this leaflet's promos; its rows stay for a later re-publish. */
  async unpublish(id: string, now = new Date()): Promise<AdminLeafletDetail> {
    const l = await this.findAdmin(id);
    if (!isLive(l)) {
      throw new ConflictException({ message: 'The leaflet is not published.', code: 'NOT_PUBLISHED' });
    }
    await this.prisma.leaflet.update({ where: { id }, data: { unpublishedAt: now } });
    return this.findOne(id);
  }

  /**
   * Personal-leaflet usage and community pushes in the last `days` (1–365, default 30), with the
   * `ADMIN_EMAILS` users and their accounts left out. Personal leaflets are pruned the day after
   * they end, so the leaflet-based numbers cover only leaflets that still exist.
   */
  async stats(days: number, now = new Date()): Promise<AdminLeafletStats> {
    const window = Number.isFinite(days) && days >= 1 ? Math.min(Math.floor(days), MAX_STATS_DAYS) : DEFAULT_STATS_DAYS;
    const since = new Date(now.getTime() - window * DAY_MS);
    const { userIds, accountIds } = await this.internalIds();

    const leafletWhere = {
      kind: 'personal',
      createdAt: { gte: since },
      ...(userIds.length > 0 ? { userId: { notIn: userIds } } : {}),
    };
    const logWhere = {
      type: PUSH_TYPE,
      sentAt: { gte: since },
      ...(accountIds.length > 0 ? { accountId: { notIn: accountIds } } : {}),
    };

    const personalLeaflets = await this.prisma.leaflet.count({ where: leafletWhere });
    const sharesWithMatch = await this.prisma.leaflet.count({
      where: { ...leafletWhere, items: { some: { basketName: { not: null } } } },
    });
    const pages = await this.prisma.leaflet.aggregate({
      where: leafletWhere,
      _sum: { pagesRead: true, pagesUnreadable: true, pagesDropped: true },
    });
    const matchesShown = await this.prisma.leafletItem.count({
      where: { basketName: { not: null }, leaflet: leafletWhere },
    });
    const addedToList = await this.prisma.leafletItem.count({
      where: { addedToListAt: { not: null }, leaflet: leafletWhere },
    });
    const pushesSent = await this.prisma.leafletNotificationLog.count({ where: logWhere });
    const pushesOpened = await this.prisma.leafletNotificationLog.count({
      where: { ...logWhere, openedAt: { not: null } },
    });

    return {
      personalLeaflets,
      sharesWithMatch,
      pagesRead: pages._sum.pagesRead ?? 0,
      pagesUnreadable: pages._sum.pagesUnreadable ?? 0,
      pagesDropped: pages._sum.pagesDropped ?? 0,
      matchesShown,
      addedToList,
      pushesSent,
      pushesOpened,
    };
  }

  // ── private ─────────────────────────────────────────────────────────────

  private intEnv(key: string, fallback: number): number {
    const raw = parseInt(this.config.get<string>(key) ?? '', 10);
    return Number.isFinite(raw) && raw >= 1 ? raw : fallback;
  }

  private invalid(message: string, code: string): never {
    throw new BadRequestException({ message, code });
  }

  /** Images (any number) or exactly one PDF, nothing else. */
  private toSource(files: AdminLeafletFile[]): AdminLeafletSource {
    if (!files || files.length === 0) this.invalid('Upload leaflet images or one PDF.', 'NO_FILES');
    const pdfs = files.filter((f) => f.mimetype === PDF_MIME);
    if (pdfs.length > 0) {
      if (files.length > 1) this.invalid('Upload either images or exactly one PDF.', 'MIXED_FILES');
      return { kind: 'pdf', buffer: pdfs[0].buffer };
    }
    if (files.some((f) => !IMAGE_MIME.test(f.mimetype))) {
      this.invalid('Only PNG, JPEG or WebP images, or one PDF.', 'UNSUPPORTED_FILE');
    }
    return { kind: 'images', files };
  }

  /** One page: extraction only (empty basket), so `basketName`/`usualPrice` stay null. */
  private async readOne(
    leafletId: string,
    pageNo: number,
    imageBase64: string,
    mimeType: string,
    currency: string,
  ): Promise<void> {
    let read: NormalizedLeafletPage;
    try {
      read = await this.reader.readPage(imageBase64, mimeType, [], currency);
    } catch (err) {
      this.logger.warn(`[Leaflet admin] page read failed for ${leafletId}: ${err instanceof Error ? err.message : err}`);
      read = { readable: false, chain: null, validFrom: null, validTo: null, items: [] };
    }
    if (!read.readable) {
      await this.prisma.leaflet.update({ where: { id: leafletId }, data: { pagesUnreadable: { increment: 1 } } });
      return;
    }

    if (read.items.length > 0) {
      await this.prisma.leafletItem.createMany({
        data: read.items.map((item) => ({
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
          basketName: null,
          usualPrice: null,
        })),
      });
    }

    // First non-null value across pages wins; the admin can still correct it before publish.
    const current = await this.prisma.leaflet.findUnique({ where: { id: leafletId } });
    const header: { chain?: string; validFrom?: Date; validTo?: Date; currencyCode?: string } = {};
    const chain = normalizeCommunityMerchant(read.chain);
    if (!current?.chain && chain) header.chain = chain;
    if (!current?.validFrom && read.validFrom) header.validFrom = ymdToDate(read.validFrom);
    if (!current?.validTo && read.validTo) header.validTo = ymdToDate(read.validTo);
    if (!current?.currencyCode && read.items[0]) header.currencyCode = read.items[0].currencyCode;
    await this.prisma.leaflet.update({ where: { id: leafletId }, data: { ...header, pagesRead: { increment: 1 } } });
  }

  private async findAdmin(id: string) {
    const l = await this.prisma.leaflet.findFirst({
      where: { id, kind: 'admin' },
      include: { items: { orderBy: [{ page: 'asc' }, { name: 'asc' }] } },
    });
    if (!l) throw new NotFoundException('Leaflet not found');
    await this.expireStaleRead(l);
    return l;
  }

  /** Flips a `reading` leaflet with no progress for STALE_READ_MS to `failed` (in the row passed too). */
  private async expireStaleRead(l: { id: string; status: string; createdAt: Date }): Promise<void> {
    if (l.status !== 'reading') return;
    const lastProgress = this.activeReads.get(l.id) ?? l.createdAt.getTime();
    if (Date.now() - lastProgress <= STALE_READ_MS) return;
    await this.prisma.leaflet.updateMany({ where: { id: l.id, status: 'reading' }, data: { status: 'failed' } });
    l.status = 'failed';
    this.logger.warn(`[Leaflet admin] ${l.id}: read made no progress for 30 min (API restarted?) — marked failed`);
  }

  private async findItem(leafletId: string, itemId: string) {
    const item = await this.prisma.leafletItem.findFirst({ where: { id: itemId, leafletId } });
    if (!item) throw new NotFoundException('Leaflet item not found');
    return item;
  }

  private assertEditable(l: { publishedAt: Date | null; unpublishedAt: Date | null }): void {
    if (isLive(l)) {
      throw new ConflictException({
        message: 'Unpublish the leaflet before editing it; publishing again replaces its promos.',
        code: 'LEAFLET_PUBLISHED',
      });
    }
  }

  /** `ADMIN_EMAILS` users, and their accounts (owned or default), resolved to ids. */
  private async internalIds(): Promise<{ userIds: string[]; accountIds: string[] }> {
    const emails = parseAdminEmails();
    if (emails.length === 0) return { userIds: [], accountIds: [] };
    const users = await this.prisma.user.findMany({
      where: { email: { in: emails, mode: 'insensitive' } },
      select: { id: true, defaultAccountId: true },
    });
    if (users.length === 0) return { userIds: [], accountIds: [] };
    const userIds = users.map((u) => u.id);
    const owned = await this.prisma.account.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } });
    const accountIds = new Set<string>(owned.map((a) => a.id));
    for (const u of users) if (u.defaultAccountId) accountIds.add(u.defaultAccountId);
    return { userIds, accountIds: [...accountIds] };
  }

  private toSummary(l: AdminLeafletRow, itemCount: number): AdminLeafletSummary {
    return {
      id: l.id,
      chain: l.chain,
      validFrom: dateToYmd(l.validFrom),
      validTo: dateToYmd(l.validTo),
      currencyCode: l.currencyCode,
      status: l.status as LeafletStatus,
      pagesRead: l.pagesRead,
      pagesUnreadable: l.pagesUnreadable,
      pagesDropped: l.pagesDropped,
      itemCount,
      publishedAt: iso(l.publishedAt),
      unpublishedAt: iso(l.unpublishedAt),
      createdAt: l.createdAt.toISOString(),
    };
  }

  private toItem(i: AdminItemRow): AdminLeafletItem {
    return {
      id: i.id,
      page: i.page,
      name: i.name,
      canonicalName: i.canonicalName,
      promoPrice: Number(i.promoPrice),
      regularPrice: num(i.regularPrice),
      currencyCode: i.currencyCode,
      condition: i.condition,
      validFrom: dateToYmd(i.validFrom),
      validTo: dateToYmd(i.validTo),
    };
  }
}
