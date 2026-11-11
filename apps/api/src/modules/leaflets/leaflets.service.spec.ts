import { ForbiddenException } from '@nestjs/common';
import { LeafletsService, LEAFLET_PAGE_CAP } from './leaflets.service';
import { LeafletPruneCron } from './leaflet-prune.cron';
import type { NormalizedLeafletPage } from './leaflet-page.util';

const NOW = new Date('2026-11-11T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function basketRows() {
  return [
    { resolvedName: 'Masło Łaciate 200g', date: daysAgo(3), unitPrice: 7, currency: 'PLN' },
    { resolvedName: 'Masło Łaciate 200g', date: daysAgo(10), unitPrice: 8, currency: 'PLN' },
    { resolvedName: 'Kawa Lavazza 1kg', date: daysAgo(5), unitPrice: 60, currency: 'PLN' },
    { resolvedName: 'Kawa Lavazza 1kg', date: daysAgo(20), unitPrice: 62, currency: 'PLN' },
  ];
}

function leafletRow(over: Record<string, unknown> = {}) {
  return {
    id: 'lf1',
    accountId: 'acc1',
    userId: 'u1',
    kind: 'personal',
    source: 'share',
    platform: 'android',
    chain: null,
    validFrom: null,
    validTo: null,
    currencyCode: null,
    status: 'reading',
    pagesRead: 0,
    pagesUnreadable: 0,
    pagesDropped: 0,
    expiresAt: new Date(NOW.getTime() + 7 * 86_400_000),
    createdAt: NOW,
    ...over,
  };
}

function page(over: Partial<NormalizedLeafletPage> = {}): NormalizedLeafletPage {
  return {
    readable: true,
    chain: 'Biedronka',
    validFrom: '2026-11-10',
    validTo: '2026-11-16',
    items: [
      { name: 'Masło Łaciate', canonicalName: 'Masło Łaciate 200g', promoPrice: 4.99, regularPrice: 7.49, currencyCode: 'PLN', condition: 'z aplikacją', validFrom: null, validTo: null, basketIndex: 1 },
      { name: 'Ser Gouda', canonicalName: 'Ser Gouda 150g', promoPrice: 3.99, regularPrice: null, currencyCode: 'PLN', condition: null, validFrom: null, validTo: null, basketIndex: null },
    ],
    ...over,
  };
}

function build() {
  const prisma: any = {
    account: { findUnique: jest.fn().mockResolvedValue({ currencyCode: 'PLN', encryptionTier: 0 }) },
    shoppingListItem: { findMany: jest.fn().mockResolvedValue([]) },
    leaflet: {
      create: jest.fn().mockResolvedValue({ id: 'lf1' }),
      findFirst: jest.fn().mockResolvedValue(leafletRow()),
      findUnique: jest.fn().mockResolvedValue(leafletRow()),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    leafletItem: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn(),
    },
  };
  const budget = {
    consume: jest.fn().mockResolvedValue(undefined),
    refund: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({ used: 0, limit: 20, resetAt: NOW.toISOString() }),
  };
  const reader = { readPage: jest.fn().mockResolvedValue(page()) };
  const priceHistory = { getBasketRows: jest.fn().mockResolvedValue(basketRows()) };
  const pdf = { renderToPngs: jest.fn(), countPages: jest.fn().mockResolvedValue(null) };
  const promos = { contribute: jest.fn().mockResolvedValue('ok') };
  const service = new LeafletsService(prisma, budget as any, reader as any, priceHistory as any, pdf as any, promos as any);
  return { service, prisma, budget, reader, priceHistory, pdf, promos };
}

describe('LeafletsService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['setImmediate', 'nextTick'] });
  });
  afterEach(() => jest.useRealTimers());

  describe('create', () => {
    it('create returns EMPTY_BASKET and does not touch the budget when the basket is empty', async () => {
      const d = build();
      d.priceHistory.getBasketRows.mockResolvedValue([]);
      await expect(d.service.create('acc1', 'u1', { source: 'share', platform: 'android' })).rejects.toMatchObject({
        status: 422,
        response: { code: 'EMPTY_BASKET' },
      });
      expect(d.budget.consume).not.toHaveBeenCalled();
      expect(d.prisma.leaflet.create).not.toHaveBeenCalled();
    });

    it('create returns ENCRYPTED_ACCOUNT for encryptionTier 2', async () => {
      const d = build();
      d.prisma.account.findUnique.mockResolvedValue({ currencyCode: 'PLN', encryptionTier: 2 });
      await expect(d.service.create('acc1', 'u1', { source: 'share', platform: null })).rejects.toMatchObject({
        status: 403,
        response: { code: 'ENCRYPTED_ACCOUNT' },
      });
      expect(d.priceHistory.getBasketRows).not.toHaveBeenCalled();
    });

    it('counts unchecked shopping-list items as basket products', async () => {
      const d = build();
      d.priceHistory.getBasketRows.mockResolvedValue([]);
      d.prisma.shoppingListItem.findMany.mockResolvedValue([{ canonicalName: 'Jajka L 10szt' }]);
      await expect(d.service.create('acc1', 'u1', { source: 'picker', platform: 'web' })).resolves.toEqual({ id: 'lf1' });
      const where = d.prisma.shoppingListItem.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ accountId: 'acc1', isChecked: false, isDeleted: false });
    });

    it('creates a personal leaflet that expires 7 days after creation by default', async () => {
      const d = build();
      await d.service.create('acc1', 'u1', { source: 'share', platform: 'android' });
      const data = d.prisma.leaflet.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ accountId: 'acc1', userId: 'u1', kind: 'personal', source: 'share', platform: 'android' });
      expect(data.expiresAt.toISOString()).toBe('2026-11-18T12:00:00.000Z');
    });
  });

  describe('readPage', () => {
    it('page read stores items, returns only matched items with basketName and usualPrice', async () => {
      const d = build();
      const res = await d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc', mimeType: 'image/png' }, false);

      expect(d.budget.consume).toHaveBeenCalledWith('u1', 'acc1', 1);
      const stored = d.prisma.leafletItem.createMany.mock.calls[0][0].data;
      expect(stored).toHaveLength(2);
      expect(stored[1]).toMatchObject({ leafletId: 'lf1', page: 1, canonicalName: 'Ser Gouda 150g', basketName: null });
      expect(res.readable).toBe(true);
      expect(res.page).toBe(1);
      expect(res.unmatchedCount).toBe(1);
      expect(res.matches).toEqual([
        {
          itemId: stored[0].id,
          name: 'Masło Łaciate',
          promoPrice: 4.99,
          regularPrice: 7.49,
          currencyCode: 'PLN',
          condition: 'z aplikacją',
          basketName: 'Masło Łaciate 200g',
          usualPrice: 7.5,
        },
      ]);
      // The reader never receives purchase rows — only the basket names.
      const readerArgs = d.reader.readPage.mock.calls[0];
      expect(readerArgs[2]).toEqual([
        { name: 'Kawa Lavazza 1kg', count: 2 },
        { name: 'Masło Łaciate 200g', count: 2 },
      ]);
      expect(readerArgs[3]).toBe('PLN');
    });

    it('usualPrice is null when the leaflet currency differs from all purchases', async () => {
      const d = build();
      const p = page();
      p.items = [{ ...p.items[0], currencyCode: 'EUR' }];
      d.reader.readPage.mockResolvedValue(p);
      const res = await d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc' }, false);
      expect(res.matches).toHaveLength(1);
      expect(res.matches[0].usualPrice).toBeNull();
      expect(res.matches[0].currencyCode).toBe('EUR');
    });

    it('drops a duplicate basket index on one page instead of guessing', async () => {
      const d = build();
      const p = page();
      p.items = [p.items[0], { ...p.items[0], name: 'Masło Extra' }];
      d.reader.readPage.mockResolvedValue(p);
      const res = await d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc' }, false);
      expect(res.matches).toHaveLength(1);
      expect(res.unmatchedCount).toBe(1);
    });

    it('sets chain and dates from the first page that has them; expiresAt = validTo + 1 day', async () => {
      const d = build();
      await d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc' }, false);
      const data = d.prisma.leaflet.update.mock.calls.at(-1)[0].data;
      expect(data.chain).toBe('biedronka');
      expect(data.validFrom.toISOString()).toBe('2026-11-10T00:00:00.000Z');
      expect(data.validTo.toISOString()).toBe('2026-11-16T00:00:00.000Z');
      expect(data.expiresAt.toISOString()).toBe('2026-11-17T00:00:00.000Z');
      expect(data.currencyCode).toBe('PLN');
      expect(data.pagesRead).toEqual({ increment: 1 });
    });

    it('keeps the earlier chain and dates when a later page has different ones', async () => {
      const d = build();
      const existing = leafletRow({ chain: 'lidl', validFrom: new Date('2026-11-09'), validTo: new Date('2026-11-12'), currencyCode: 'PLN', pagesRead: 1 });
      d.prisma.leaflet.findFirst.mockResolvedValue(existing);
      d.prisma.leaflet.findUnique.mockResolvedValue(existing);
      const res = await d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc' }, false);
      expect(res.page).toBe(2);
      const data = d.prisma.leaflet.update.mock.calls.at(-1)[0].data;
      expect(data.chain).toBeUndefined();
      expect(data.validTo).toBeUndefined();
      expect(data.expiresAt).toBeUndefined();
    });

    it('no validTo keeps createdAt + 7 days', async () => {
      const d = build();
      d.reader.readPage.mockResolvedValue(page({ validTo: null, validFrom: null }));
      await d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc' }, false);
      const data = d.prisma.leaflet.update.mock.calls.at(-1)[0].data;
      expect(data.expiresAt).toBeUndefined();
      const created = await (async () => {
        const e = build();
        await e.service.create('acc1', 'u1', { source: 'share', platform: null });
        return e.prisma.leaflet.create.mock.calls[0][0].data.expiresAt as Date;
      })();
      expect(created.getTime() - NOW.getTime()).toBe(7 * 86_400_000);
    });

    it('unreadable page is refunded and counted in pagesUnreadable', async () => {
      const d = build();
      d.reader.readPage.mockResolvedValue({ readable: false, chain: null, validFrom: null, validTo: null, items: [] });
      const res = await d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc' }, false);
      expect(res).toEqual({ page: 1, readable: false, matches: [], unmatchedCount: 0 });
      expect(d.budget.consume).toHaveBeenCalledWith('u1', 'acc1', 1);
      expect(d.budget.refund).toHaveBeenCalledWith('u1', 1);
      expect(d.prisma.leafletItem.createMany).not.toHaveBeenCalled();
      expect(d.prisma.leaflet.update.mock.calls.at(-1)[0].data.pagesUnreadable).toEqual({ increment: 1 });
    });

    it('a model failure is treated as an unreadable page and refunded', async () => {
      const d = build();
      d.reader.readPage.mockRejectedValue(new Error('openai down'));
      const res = await d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc' }, false);
      expect(res.readable).toBe(false);
      expect(d.budget.refund).toHaveBeenCalledWith('u1', 1);
    });

    it('11th page returns PAGE_CAP and is not charged', async () => {
      const d = build();
      d.prisma.leaflet.findFirst.mockResolvedValue(leafletRow({ pagesRead: 8, pagesUnreadable: 2 }));
      await expect(d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc' }, false)).rejects.toMatchObject({
        status: 409,
        response: { code: 'PAGE_CAP' },
      });
      expect(LEAFLET_PAGE_CAP).toBe(10);
      expect(d.budget.consume).not.toHaveBeenCalled();
      expect(d.reader.readPage).not.toHaveBeenCalled();
      expect(d.prisma.leaflet.update).toHaveBeenCalledWith({ where: { id: 'lf1' }, data: { pagesDropped: { increment: 1 } } });
    });

    it('LEAFLET_LIMIT is passed through and the page counted as dropped', async () => {
      const d = build();
      d.budget.consume.mockRejectedValue(new ForbiddenException({ code: 'LEAFLET_LIMIT' }));
      await expect(d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc' }, false)).rejects.toMatchObject({
        status: 403,
        response: { code: 'LEAFLET_LIMIT' },
      });
      expect(d.reader.readPage).not.toHaveBeenCalled();
      expect(d.prisma.leaflet.update).toHaveBeenCalledWith({ where: { id: 'lf1' }, data: { pagesDropped: { increment: 1 } } });
    });

    it('an admin skips the page budget entirely (no consume, no refund)', async () => {
      const d = build();
      d.reader.readPage.mockResolvedValue({ readable: false, chain: null, validFrom: null, validTo: null, items: [] });
      await d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc' }, true);
      expect(d.budget.consume).not.toHaveBeenCalled();
      expect(d.budget.refund).not.toHaveBeenCalled();
    });

    it('a leaflet of another account returns 404', async () => {
      const d = build();
      d.prisma.leaflet.findFirst.mockResolvedValue(null);
      await expect(d.service.readPage('acc2', 'u2', 'lf1', { imageBase64: 'abc' }, false)).rejects.toMatchObject({ status: 404 });
      expect(d.prisma.leaflet.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'lf1', accountId: 'acc2' });
      expect(d.budget.consume).not.toHaveBeenCalled();
    });
  });

  describe('pdf', () => {
    it('pdf over 10 MB returns PDF_TOO_LARGE', async () => {
      const d = build();
      const big = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64');
      await expect(d.service.startPdf('acc1', 'u1', 'lf1', { pdfBase64: big }, false)).rejects.toMatchObject({
        status: 413,
        response: { code: 'PDF_TOO_LARGE' },
      });
      expect(d.pdf.renderToPngs).not.toHaveBeenCalled();
    });

    it('starts the background read and returns the id immediately', async () => {
      const d = build();
      d.pdf.renderToPngs.mockResolvedValue([]);
      const res = await d.service.startPdf('acc1', 'u1', 'lf1', { pdfBase64: Buffer.from('%PDF').toString('base64') }, false);
      expect(res).toEqual({ id: 'lf1' });
      expect(d.prisma.leaflet.update).toHaveBeenCalledWith({ where: { id: 'lf1' }, data: { status: 'reading' } });
      await new Promise((r) => setImmediate(r));
      expect(d.pdf.renderToPngs).toHaveBeenCalledWith(expect.any(Buffer), undefined, 10);
    });

    it('no pages left this month → 403 LEAFLET_LIMIT synchronously, nothing rendered, leaflet failed', async () => {
      const d = build();
      d.budget.get.mockResolvedValue({ used: 20, limit: 20, resetAt: NOW.toISOString() });
      await expect(
        d.service.startPdf('acc1', 'u1', 'lf1', { pdfBase64: Buffer.from('%PDF').toString('base64') }, false),
      ).rejects.toMatchObject({ status: 403, response: { code: 'LEAFLET_LIMIT' } });
      await new Promise((r) => setImmediate(r));
      expect(d.pdf.renderToPngs).not.toHaveBeenCalled();
      expect(d.prisma.leaflet.update).toHaveBeenCalledWith({ where: { id: 'lf1' }, data: { status: 'failed' } });
    });

    it('an admin with no pages left still starts the PDF read (R3)', async () => {
      const d = build();
      d.budget.get.mockResolvedValue({ used: 20, limit: 20, resetAt: NOW.toISOString() });
      d.pdf.renderToPngs.mockResolvedValue([]);
      await expect(
        d.service.startPdf('acc1', 'u1', 'lf1', { pdfBase64: Buffer.from('%PDF').toString('base64') }, true),
      ).resolves.toEqual({ id: 'lf1' });
      expect(d.budget.get).not.toHaveBeenCalled();
    });

    it('pdf stops at LEAFLET_LIMIT and counts the rest as dropped', async () => {
      const d = build();
      d.pdf.renderToPngs.mockResolvedValue([Buffer.from('p1'), Buffer.from('p2'), Buffer.from('p3'), Buffer.from('p4')]);
      d.budget.consume
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new ForbiddenException({ code: 'LEAFLET_LIMIT' }));
      await d.service.readPdf('acc1', 'u1', 'lf1', Buffer.from('%PDF'), false);

      expect(d.reader.readPage).toHaveBeenCalledTimes(1);
      expect(d.budget.consume).toHaveBeenCalledTimes(2);
      const updates = d.prisma.leaflet.update.mock.calls.map((c: any[]) => c[0].data);
      expect(updates).toContainEqual({ pagesDropped: { increment: 3 } });
      expect(updates.at(-1)).toEqual({ status: 'done' });
    });

    it('a 12-page PDF reads 10 pages and counts 2 as dropped', async () => {
      const d = build();
      d.pdf.countPages.mockResolvedValue(12);
      d.pdf.renderToPngs.mockResolvedValue(Array.from({ length: 10 }, (_, i) => Buffer.from(`p${i}`)));
      await d.service.readPdf('acc1', 'u1', 'lf1', Buffer.from('%PDF'), false);
      expect(d.reader.readPage).toHaveBeenCalledTimes(10);
      const updates = d.prisma.leaflet.update.mock.calls.map((c: any[]) => c[0].data);
      expect(updates).toContainEqual({ pagesDropped: { increment: 2 } });
      expect(updates.at(-1)).toEqual({ status: 'done' });
    });

    it('a PDF whose extra pages hit LEAFLET_LIMIT counts both the unrendered and the refused pages', async () => {
      const d = build();
      d.pdf.countPages.mockResolvedValue(12);
      d.pdf.renderToPngs.mockResolvedValue(Array.from({ length: 10 }, (_, i) => Buffer.from(`p${i}`)));
      d.budget.consume
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new ForbiddenException({ code: 'LEAFLET_LIMIT' }));
      await d.service.readPdf('acc1', 'u1', 'lf1', Buffer.from('%PDF'), false);
      const dropped = d.prisma.leaflet.update.mock.calls
        .map((c: any[]) => c[0].data.pagesDropped?.increment ?? 0)
        .reduce((a: number, b: number) => a + b, 0);
      expect(dropped).toBe(11); // 2 never rendered + 9 refused
    });

    it('a render failure marks the leaflet failed', async () => {
      const d = build();
      d.pdf.renderToPngs.mockRejectedValue(new Error('pdftoppm'));
      await expect(d.service.readPdf('acc1', 'u1', 'lf1', Buffer.from('%PDF'), false)).rejects.toThrow('pdftoppm');
      expect(d.prisma.leaflet.update).toHaveBeenLastCalledWith({ where: { id: 'lf1' }, data: { status: 'failed' } });
    });
  });

  describe('read', () => {
    it('GET /leaflets/:id of another account returns 404', async () => {
      const d = build();
      d.prisma.leaflet.findFirst.mockResolvedValue(null);
      await expect(d.service.findOne('acc2', 'lf1')).rejects.toMatchObject({ status: 404 });
      expect(d.prisma.leaflet.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'lf1', accountId: 'acc2' });
    });

    it('returns matches and the unmatched count', async () => {
      const d = build();
      d.prisma.leaflet.findFirst.mockResolvedValue({
        ...leafletRow({ chain: 'biedronka', validTo: new Date('2026-11-16T00:00:00Z'), status: 'done', pagesRead: 1 }),
        items: [
          { id: 'i1', page: 1, name: 'Masło', promoPrice: '4.99', regularPrice: null, currencyCode: 'PLN', condition: null, basketName: 'Masło Łaciate 200g', usualPrice: '7.50' },
          { id: 'i2', page: 1, name: 'Ser', promoPrice: '3.99', regularPrice: null, currencyCode: 'PLN', condition: null, basketName: null, usualPrice: null },
        ],
      });
      const res = await d.service.findOne('acc1', 'lf1');
      expect(res).toMatchObject({ id: 'lf1', chain: 'biedronka', validTo: '2026-11-16', validFrom: null, status: 'done', unmatchedCount: 1 });
      expect(res.matches).toEqual([
        { itemId: 'i1', name: 'Masło', promoPrice: 4.99, regularPrice: null, currencyCode: 'PLN', condition: null, basketName: 'Masło Łaciate 200g', usualPrice: 7.5 },
      ]);
    });

    it('lists only active personal leaflets of the account, newest first', async () => {
      const d = build();
      await d.service.findActive('acc1');
      const args = d.prisma.leaflet.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ accountId: 'acc1', kind: 'personal', expiresAt: { gt: NOW } });
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('a personal read with no progress for 30 min (API restarted mid-PDF) reads as failed', async () => {
      const d = build();
      const stale = leafletRow({ status: 'reading', pagesRead: 2, createdAt: new Date(NOW.getTime() - 31 * 60_000) });
      d.prisma.leaflet.findFirst.mockResolvedValue({ ...stale, items: [] });
      await expect(d.service.findOne('acc1', 'lf1')).resolves.toMatchObject({ status: 'failed' });
      expect(d.prisma.leaflet.updateMany).toHaveBeenCalledWith({
        where: { id: 'lf1', status: 'reading' },
        data: { status: 'failed' },
      });

      d.prisma.leaflet.findMany.mockResolvedValue([{ ...stale, items: [] }]);
      await expect(d.service.findActive('acc1')).resolves.toMatchObject([{ status: 'failed' }]);
    });

    it('an orphan leaflet whose PDF upload never arrived reads as failed after 30 min', async () => {
      const d = build();
      const orphan = leafletRow({ status: 'reading', createdAt: new Date(NOW.getTime() - 31 * 60_000) });
      d.prisma.leaflet.findMany.mockResolvedValue([{ ...orphan, items: [] }]);
      await expect(d.service.findActive('acc1')).resolves.toMatchObject([{ status: 'failed', pagesRead: 0 }]);
    });

    it('a read that is younger than 30 min, or still making progress in this process, stays reading', async () => {
      const d = build();
      const young = leafletRow({ status: 'reading', createdAt: new Date(NOW.getTime() - 29 * 60_000) });
      d.prisma.leaflet.findFirst.mockResolvedValue({ ...young, items: [] });
      await expect(d.service.findOne('acc1', 'lf1')).resolves.toMatchObject({ status: 'reading' });
      expect(d.prisma.leaflet.updateMany).not.toHaveBeenCalled();

      // A long PDF read: started 40 min ago, but its last page finished a minute ago.
      const old = leafletRow({ status: 'reading', createdAt: new Date(NOW.getTime() - 40 * 60_000) });
      d.prisma.leaflet.findUnique.mockResolvedValue(old);
      d.pdf.renderToPngs.mockResolvedValue([Buffer.from('p1')]);
      d.reader.readPage.mockImplementation(async () => {
        const res = await d.service.findOne('acc1', 'lf1');
        expect(res.status).toBe('reading');
        return page();
      });
      d.prisma.leaflet.findFirst.mockResolvedValue({ ...old, items: [] });
      await d.service.readPdf('acc1', 'u1', 'lf1', Buffer.from('%PDF'), false);
      expect(d.prisma.leaflet.updateMany).not.toHaveBeenCalled();
    });

    it('marks an item added once, scoped to the account', async () => {
      const d = build();
      await d.service.markAdded('acc1', 'i1');
      expect(d.prisma.leafletItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'i1', addedToListAt: null, leaflet: { accountId: 'acc1' } },
        data: { addedToListAt: NOW },
      });
    });

    it('marking an item of another account returns 404', async () => {
      const d = build();
      d.prisma.leafletItem.updateMany.mockResolvedValue({ count: 0 });
      d.prisma.leafletItem.findFirst.mockResolvedValue(null);
      await expect(d.service.markAdded('acc2', 'i1')).rejects.toMatchObject({ status: 404 });
    });
  });
});

describe('LeafletsService community promo contribution', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['setImmediate', 'nextTick'] });
  });
  afterEach(() => jest.useRealTimers());

  it('contributes every read page with the normalized chain, the leaflet dates and all items', async () => {
    const d = build();
    await d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc', mimeType: 'image/png' }, false);
    expect(d.promos.contribute).toHaveBeenCalledTimes(1);
    const [userId, chain, items, from, to, opts] = d.promos.contribute.mock.calls[0];
    expect(userId).toBe('u1');
    expect(chain).toBe('biedronka');
    expect(items).toHaveLength(2);
    expect(from).toBe('2026-11-10');
    expect(to).toBe('2026-11-16');
    expect(opts).toEqual({ isAdmin: false, leafletId: 'lf1' });
  });

  it('a later page uses the chain and dates already stored on the leaflet', async () => {
    const d = build();
    d.prisma.leaflet.findUnique.mockResolvedValue(
      leafletRow({
        chain: 'lidl',
        validFrom: new Date('2026-11-09T00:00:00.000Z'),
        validTo: new Date('2026-11-15T00:00:00.000Z'),
        pagesRead: 1,
      }),
    );
    d.prisma.leaflet.findFirst.mockResolvedValue(leafletRow({ pagesRead: 1 }));
    d.reader.readPage.mockResolvedValue(page({ chain: null, validFrom: null, validTo: null }));
    await d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc', mimeType: 'image/png' }, false);
    const [, chain, , from, to] = d.promos.contribute.mock.calls[0];
    expect(chain).toBe('lidl');
    expect(from).toBe('2026-11-09');
    expect(to).toBe('2026-11-15');
  });

  it('passes the admin flag through (R3)', async () => {
    const d = build();
    await d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc', mimeType: 'image/png' }, true);
    expect(d.promos.contribute.mock.calls[0][5]).toEqual({ isAdmin: true, leafletId: 'lf1' });
  });

  it('an unreadable page contributes nothing', async () => {
    const d = build();
    d.reader.readPage.mockResolvedValue(page({ readable: false, items: [] }));
    await d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc', mimeType: 'image/png' }, false);
    expect(d.promos.contribute).not.toHaveBeenCalled();
  });

  it('a failing or hanging contribution never fails or delays the page response', async () => {
    const d = build();
    d.promos.contribute.mockRejectedValue(new Error('boom'));
    await expect(
      d.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc', mimeType: 'image/png' }, false),
    ).resolves.toMatchObject({ readable: true });

    const hang = build();
    hang.promos.contribute.mockReturnValue(new Promise(() => undefined));
    await expect(
      hang.service.readPage('acc1', 'u1', 'lf1', { imageBase64: 'abc', mimeType: 'image/png' }, false),
    ).resolves.toMatchObject({ readable: true });
  });
});

describe('LeafletPruneCron', () => {
  it('prune also deletes community promo observations that have ended', async () => {
    const prisma: any = {
      leaflet: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      communityPromoObservation: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
    };
    const cron = new LeafletPruneCron(prisma);
    await cron.prune();
    const where = prisma.communityPromoObservation.deleteMany.mock.calls[0][0].where;
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    expect(where).toEqual({ validTo: { lt: today } });
  });

  it('prune deletes only expired personal leaflets', async () => {
    const prisma: any = {
      leaflet: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      communityPromoObservation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const cron = new LeafletPruneCron(prisma);
    const before = Date.now();
    await cron.prune();
    const where = prisma.leaflet.deleteMany.mock.calls[0][0].where;
    expect(where.kind).toBe('personal');
    expect(where.expiresAt.lt).toBeInstanceOf(Date);
    expect(where.expiresAt.lt.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('LeafletsService.markPushOpened', () => {
  it("stamps openedAt only on the caller's own log row (id AND default account), once", async () => {
    const { service, prisma } = build();
    prisma.user = { findUnique: jest.fn().mockResolvedValue({ defaultAccountId: 'acc1' }) };
    prisma.leafletNotificationLog = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    await service.markPushOpened('u1', 'log-1');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, select: { defaultAccountId: true } });
    const args = prisma.leafletNotificationLog.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'log-1', accountId: 'acc1', openedAt: null });
    expect(args.data.openedAt).toBeInstanceOf(Date);
  });

  it('a user without a default account touches nothing', async () => {
    const { service, prisma } = build();
    prisma.user = { findUnique: jest.fn().mockResolvedValue({ defaultAccountId: null }) };
    prisma.leafletNotificationLog = { updateMany: jest.fn() };
    await service.markPushOpened('u1', 'log-1');
    expect(prisma.leafletNotificationLog.updateMany).not.toHaveBeenCalled();
  });
});
