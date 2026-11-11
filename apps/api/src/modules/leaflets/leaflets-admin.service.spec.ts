import { ConfigService } from '@nestjs/config';
import { LeafletsAdminService } from './leaflets-admin.service';
import { CommunityPromoService } from './community-promo.service';
import { LeafletBudgetService } from './leaflet-budget.service';
import { computeContributorKey } from '../community-prices/community-price.util';
import type { NormalizedLeafletPage } from './leaflet-page.util';

const NOW = new Date('2026-11-12T10:00:00.000Z');
const SALT = 's'.repeat(40);
const ADMIN = 'admin-user';

type Row = Record<string, any>;

/** Applies `{ increment }` and plain values the way Prisma does. */
function apply(row: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in v) row[k] = (row[k] ?? 0) + v.increment;
    else row[k] = v;
  }
}

const OBS_KEY = ['chain', 'canonicalName', 'promoPrice', 'currencyCode', 'validFrom', 'validTo', 'contributorKey'];
const obsKey = (r: Row) =>
  OBS_KEY.map((k) => (r[k] instanceof Date ? r[k].toISOString() : String(Number.isNaN(Number(r[k])) ? r[k] : Number(r[k])))).join('|');

/** In-memory Prisma for leaflets, items and promo observations (with the real dedup unique key). */
function fakePrisma() {
  const leaflets = new Map<string, Row>();
  const items: Row[] = [];
  const obs: Row[] = [];
  let seq = 0;
  const withItems = (l: Row) => ({ ...l, items: items.filter((i) => i.leafletId === l.id) });
  const prisma: any = {
    leaflets,
    items,
    obs,
    user: {
      findUnique: jest.fn(async () => ({ currencyCode: 'PLN' })),
      findMany: jest.fn(async () => []),
    },
    account: { findUnique: jest.fn(), findMany: jest.fn(async () => []) },
    expense: { findMany: jest.fn(async () => []) },
    leaflet: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: `lf-${++seq}`,
          chain: null,
          validFrom: null,
          validTo: null,
          currencyCode: null,
          status: 'reading',
          pagesRead: 0,
          pagesUnreadable: 0,
          pagesDropped: 0,
          publishedAt: null,
          unpublishedAt: null,
          ...data,
        };
        leaflets.set(row.id, row);
        return { id: row.id };
      }),
      findUnique: jest.fn(async ({ where }: { where: Row }) => leaflets.get(where.id) ?? null),
      findFirst: jest.fn(async ({ where, include }: { where: Row; include?: Row }) => {
        const l = leaflets.get(where.id);
        if (!l || (where.kind && l.kind !== where.kind)) return null;
        return include?.items ? withItems(l) : l;
      }),
      findMany: jest.fn(async ({ where }: { where: Row }) =>
        [...leaflets.values()]
          .filter((l) => {
            if (where?.kind && l.kind !== where.kind) return false;
            if (where?.id?.in && !where.id.in.includes(l.id)) return false;
            return true;
          })
          .map((l) => ({ ...l, _count: { items: items.filter((i) => i.leafletId === l.id).length } })),
      ),
      update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const l = leaflets.get(where.id);
        if (!l) throw new Error('not found');
        apply(l, data);
        return l;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const l = leaflets.get(where.id);
        if (!l || (where.status && l.status !== where.status)) return { count: 0 };
        apply(l, data);
        return { count: 1 };
      }),
    },
    leafletItem: {
      createMany: jest.fn(async ({ data }: { data: Row[] }) => {
        for (const d of data) items.push({ id: d.id ?? `it-${++seq}`, ...d });
        return { count: data.length };
      }),
      findFirst: jest.fn(
        async ({ where }: { where: Row }) =>
          items.find((i) => i.id === where.id && (!where.leafletId || i.leafletId === where.leafletId)) ?? null,
      ),
      update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const i = items.find((x) => x.id === where.id)!;
        apply(i, data);
        return i;
      }),
      delete: jest.fn(async ({ where }: { where: Row }) => {
        const idx = items.findIndex((x) => x.id === where.id);
        return items.splice(idx, 1)[0];
      }),
    },
    communityPromoObservation: {
      createMany: jest.fn(async ({ data }: { data: Row[] }) => {
        let count = 0;
        for (const d of data) {
          if (obs.some((o) => obsKey(o) === obsKey(d))) continue;
          obs.push({ ...d });
          count++;
        }
        return { count };
      }),
      deleteMany: jest.fn(async ({ where }: { where: Row }) => {
        let count = 0;
        for (let i = obs.length - 1; i >= 0; i--) {
          if (obs[i].adminLeafletId === where.adminLeafletId) {
            obs.splice(i, 1);
            count++;
          }
        }
        return { count };
      }),
      findMany: jest.fn(async ({ where }: { where: Row }) =>
        obs.filter((o) => o.validTo.getTime() >= where.validTo.gte.getTime()).map((o) => ({ ...o })),
      ),
    },
    leafletNotificationLog: { count: jest.fn(async () => 0) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

function page(over: Partial<NormalizedLeafletPage> = {}): NormalizedLeafletPage {
  return {
    readable: true,
    chain: 'Biedronka',
    validFrom: '2026-11-10',
    validTo: '2026-11-16',
    items: [
      {
        name: 'Masło Łaciate 200g',
        canonicalName: 'Masło 200g',
        promoPrice: 4.99,
        regularPrice: 7.49,
        currencyCode: 'PLN',
        condition: 'z aplikacją',
        validFrom: null,
        validTo: null,
        basketIndex: null,
      },
    ],
    ...over,
  };
}

const img = (n = 1) =>
  Array.from({ length: n }, (_, i) => ({ buffer: Buffer.from(`img${i}`), mimetype: 'image/jpeg', size: 4 }));

describe('LeafletsAdminService', () => {
  const OLD_ADMIN = process.env.ADMIN_EMAILS;
  let prisma: ReturnType<typeof fakePrisma>;
  let env: Record<string, string | undefined>;
  let reader: { readPage: jest.Mock };
  let pdf: { renderToPngs: jest.Mock; renderPageChunks: jest.Mock; countPages: jest.Mock };
  let promos: CommunityPromoService;
  let service: LeafletsAdminService;
  let readSpy: jest.SpyInstance;

  /** Upload, then wait for the background read it started. */
  async function uploadAndRead(files: { buffer: Buffer; mimetype: string; size: number }[]): Promise<string> {
    const { id } = await service.upload(ADMIN, files);
    await readSpy.mock.results[readSpy.mock.results.length - 1].value;
    return id;
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    prisma = fakePrisma();
    env = { COMMUNITY_PRICE_SALT: SALT };
    const config = { get: (k: string) => env[k] } as unknown as ConfigService;
    reader = { readPage: jest.fn(async () => page()) };
    pdf = { renderToPngs: jest.fn(), renderPageChunks: jest.fn(), countPages: jest.fn() };
    promos = new CommunityPromoService(prisma, config, {} as any);
    service = new LeafletsAdminService(prisma, config, reader as any, pdf as any, promos);
    readSpy = jest.spyOn(service, 'readAll');
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env.ADMIN_EMAILS = OLD_ADMIN;
  });

  describe('upload', () => {
    it('creates an admin leaflet with no account and reads every image with an empty basket', async () => {
      const id = await uploadAndRead(img(2));
      const l = prisma.leaflets.get(id);
      expect(l).toMatchObject({ kind: 'admin', accountId: null, userId: ADMIN, source: 'admin' });
      expect(reader.readPage).toHaveBeenCalledTimes(2);
      expect(reader.readPage).toHaveBeenCalledWith(expect.any(String), 'image/jpeg', [], 'PLN');
      expect(l).toMatchObject({ status: 'done', pagesRead: 2, chain: 'biedronka' });
      expect(prisma.items).toHaveLength(2);
      expect(prisma.items[0]).toMatchObject({ basketName: null, usualPrice: null, canonicalName: 'Masło 200g' });
    });

    it('does not call LeafletBudgetService', async () => {
      const consume = jest.spyOn(LeafletBudgetService.prototype, 'consume');
      const refund = jest.spyOn(LeafletBudgetService.prototype, 'refund');
      reader.readPage.mockResolvedValueOnce(page({ readable: false, items: [] }));
      await uploadAndRead(img(2));
      expect(consume).not.toHaveBeenCalled();
      expect(refund).not.toHaveBeenCalled();
    });

    it('counts an unreadable page and a failed read as unreadable, keeps going', async () => {
      reader.readPage.mockResolvedValueOnce(page({ readable: false, items: [] })).mockRejectedValueOnce(new Error('x'));
      const id = await uploadAndRead(img(3));
      expect(prisma.leaflets.get(id)).toMatchObject({ pagesRead: 1, pagesUnreadable: 2, status: 'done' });
    });

    /** A fake chunked renderer: yields `sizes` chunks of PNGs, then throws `fail` if given. */
    function chunks(sizes: number[], fail?: Error) {
      return async function* () {
        for (const n of sizes) yield Array.from({ length: n }, () => Buffer.from('png'));
        if (fail) throw fail;
      };
    }
    const pdfFile = () => {
      const buf = Buffer.from('%PDF');
      return { buf, file: { buffer: buf, mimetype: 'application/pdf', size: buf.length } };
    };

    it('61st PDF page is not rendered — it is counted as dropped', async () => {
      pdf.countPages.mockResolvedValue(61);
      pdf.renderPageChunks.mockImplementation(chunks(Array.from({ length: 12 }, () => 5)));
      const { buf, file } = pdfFile();
      const id = await uploadAndRead([file]);
      expect(pdf.renderPageChunks).toHaveBeenCalledWith(buf, 60);
      expect(pdf.renderToPngs).not.toHaveBeenCalled();
      expect(reader.readPage).toHaveBeenCalledTimes(60);
      expect(reader.readPage).toHaveBeenCalledWith(expect.any(String), 'image/png', [], 'PLN');
      expect(prisma.leaflets.get(id)).toMatchObject({ pagesRead: 60, pagesDropped: 1, status: 'done' });
    });

    it('counts the pages before rendering, never in parallel with it', async () => {
      pdf.countPages.mockResolvedValue(3);
      pdf.renderPageChunks.mockImplementation(chunks([3]));
      await uploadAndRead([pdfFile().file]);
      expect(pdf.renderPageChunks).toHaveBeenCalledWith(expect.any(Buffer), 3);
      expect(pdf.countPages.mock.invocationCallOrder[0]).toBeLessThan(pdf.renderPageChunks.mock.invocationCallOrder[0]);
    });

    it('reads each chunk before the next one is rendered', async () => {
      pdf.countPages.mockResolvedValue(7);
      const order: string[] = [];
      reader.readPage.mockImplementation(async () => {
        order.push('read');
        return page();
      });
      pdf.renderPageChunks.mockImplementation(async function* () {
        order.push('render 1-5');
        yield Array.from({ length: 5 }, () => Buffer.from('png'));
        order.push('render 6-7');
        yield Array.from({ length: 2 }, () => Buffer.from('png'));
      });
      await uploadAndRead([pdfFile().file]);
      expect(order).toEqual(['render 1-5', 'read', 'read', 'read', 'read', 'read', 'render 6-7', 'read', 'read']);
    });

    it('a failing chunk keeps the pages already read and counts the rest as dropped', async () => {
      pdf.countPages.mockResolvedValue(12);
      pdf.renderPageChunks.mockImplementation(chunks([5], new Error('pdftoppm timed out')));
      const id = await uploadAndRead([pdfFile().file]);
      expect(reader.readPage).toHaveBeenCalledTimes(5);
      expect(prisma.leaflets.get(id)).toMatchObject({ pagesRead: 5, pagesDropped: 7, status: 'done' });
    });

    it('unknown page count: renders up to the cap and drops nothing it cannot count', async () => {
      pdf.countPages.mockResolvedValue(null);
      pdf.renderPageChunks.mockImplementation(chunks([5, 1]));
      const id = await uploadAndRead([pdfFile().file]);
      expect(pdf.renderPageChunks).toHaveBeenCalledWith(expect.any(Buffer), 60);
      expect(prisma.leaflets.get(id)).toMatchObject({ pagesRead: 6, pagesDropped: 0, status: 'done' });
    });

    it('honours LEAFLET_ADMIN_MAX_PAGES for images: pages past the cap are dropped, not read', async () => {
      env.LEAFLET_ADMIN_MAX_PAGES = '2';
      const id = await uploadAndRead(img(3));
      expect(reader.readPage).toHaveBeenCalledTimes(2);
      expect(prisma.leaflets.get(id)).toMatchObject({ pagesRead: 2, pagesDropped: 1 });
    });

    it('rejects uploads over LEAFLET_ADMIN_MAX_MB with 413, and bad mixes with 400', async () => {
      env.LEAFLET_ADMIN_MAX_MB = '1';
      await expect(
        service.upload(ADMIN, [{ buffer: Buffer.alloc(1), mimetype: 'image/png', size: 2 * 1024 * 1024 }]),
      ).rejects.toMatchObject({ status: 413 });
      env.LEAFLET_ADMIN_MAX_MB = undefined;
      await expect(service.upload(ADMIN, [])).rejects.toMatchObject({ status: 400 });
      const pdfFile = { buffer: Buffer.from('%PDF'), mimetype: 'application/pdf', size: 4 };
      await expect(service.upload(ADMIN, [pdfFile, pdfFile])).rejects.toMatchObject({ status: 400 });
      await expect(service.upload(ADMIN, [pdfFile, ...img(1)])).rejects.toMatchObject({ status: 400 });
      await expect(
        service.upload(ADMIN, [{ buffer: Buffer.from('x'), mimetype: 'text/plain', size: 1 }]),
      ).rejects.toMatchObject({ status: 400 });
      expect(prisma.leaflet.create).not.toHaveBeenCalled();
    });

    it('marks the leaflet failed when the PDF cannot be rendered', async () => {
      pdf.countPages.mockResolvedValue(null);
      pdf.renderPageChunks.mockImplementation(async function* () {
        yield* [];
        throw new Error('pdftoppm');
      });
      const { id } = await service.upload(ADMIN, [{ buffer: Buffer.from('%PDF'), mimetype: 'application/pdf', size: 4 }]);
      await expect(readSpy.mock.results[0].value).rejects.toThrow('pdftoppm');
      expect(prisma.leaflets.get(id)!.status).toBe('failed');
    });
  });

  describe('publish', () => {
    it('publish without validTo → 400', async () => {
      reader.readPage.mockResolvedValue(page({ validTo: null }));
      const id = await uploadAndRead(img(1));
      await expect(service.publish(id, ADMIN)).rejects.toMatchObject({ status: 400 });
      expect(prisma.obs).toHaveLength(0);
    });

    it('refuses an ended validity, a missing chain or no items', async () => {
      reader.readPage.mockResolvedValue(page({ validTo: '2026-11-11' }));
      const ended = await uploadAndRead(img(1));
      await expect(service.publish(ended, ADMIN)).rejects.toMatchObject({ status: 400 });

      reader.readPage.mockResolvedValue(page({ chain: null }));
      const noChain = await uploadAndRead(img(1));
      await expect(service.publish(noChain, ADMIN)).rejects.toMatchObject({ status: 400 });

      reader.readPage.mockResolvedValue(page({ items: [] }));
      const empty = await uploadAndRead(img(1));
      await expect(service.publish(empty, ADMIN)).rejects.toMatchObject({ status: 400 });
    });

    it('publish writes isAdmin+trusted rows with no account or user id', async () => {
      const id = await uploadAndRead(img(1));
      await service.publish(id, ADMIN);
      expect(prisma.obs).toHaveLength(1);
      const row = prisma.obs[0];
      expect(row).toEqual({
        chain: 'biedronka',
        canonicalName: 'Masło 200g',
        promoPrice: 4.99,
        currencyCode: 'PLN',
        condition: 'z aplikacją',
        validFrom: new Date('2026-11-10T00:00:00.000Z'),
        validTo: new Date('2026-11-16T00:00:00.000Z'),
        contributorKey: computeContributorKey(SALT, `${ADMIN}:${id}`),
        trusted: true,
        isAdmin: true,
        adminLeafletId: id,
      });
      expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['accountId']));
      expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['userId']));
      expect(JSON.stringify(row)).not.toContain(ADMIN);
      expect(prisma.leaflets.get(id)!.publishedAt).toEqual(NOW);
    });

    it('works with COMMUNITY_PROMOS_ENABLED off, and confirms the promo on its own', async () => {
      env.COMMUNITY_PROMOS_ENABLED = undefined;
      const id = await uploadAndRead(img(1));
      await service.publish(id, ADMIN);
      expect(prisma.obs).toHaveLength(1);
      const active = await promos.confirmedActive(NOW);
      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({ chain: 'biedronka', canonicalName: 'Masło 200g', promoPrice: 4.99 });
    });

    it('publishing twice does not duplicate rows, and reports the rows actually written', async () => {
      const id = await uploadAndRead(img(1));
      await expect(service.publish(id, ADMIN)).resolves.toMatchObject({ promosWritten: 1 });
      await expect(service.publish(id, ADMIN)).resolves.toMatchObject({ promosWritten: 1 });
      expect(prisma.obs).toHaveLength(1);
    });

    it('B published after A was unpublished still shows K in confirmedActive', async () => {
      const a = await uploadAndRead(img(1));
      await service.publish(a, ADMIN);
      await service.unpublish(a);
      const b = await uploadAndRead(img(1)); // the corrected re-upload, same promo
      await expect(service.publish(b, ADMIN)).resolves.toMatchObject({ promosWritten: 1 });
      expect(prisma.obs.filter((o: Row) => o.adminLeafletId === b)).toHaveLength(1);
      const active = await promos.confirmedActive(NOW);
      expect(active.map((p) => p.canonicalName)).toEqual(['Masło 200g']);
    });

    it("unpublishing A keeps B's K", async () => {
      const a = await uploadAndRead(img(1));
      const b = await uploadAndRead(img(1));
      await service.publish(a, ADMIN);
      await service.publish(b, ADMIN);
      expect(prisma.obs).toHaveLength(2);
      await service.unpublish(a);
      expect(await promos.confirmedActive(NOW)).toHaveLength(1);
      await service.unpublish(b);
      expect(await promos.confirmedActive(NOW)).toHaveLength(0);
    });

    it('refuses publish without a usable COMMUNITY_PRICE_SALT', async () => {
      env.COMMUNITY_PRICE_SALT = 'short';
      const id = await uploadAndRead(img(1));
      await expect(service.publish(id, ADMIN)).rejects.toMatchObject({ status: 400 });
    });

    it('refuses publish while the leaflet is still being read', async () => {
      const id = await uploadAndRead(img(1));
      prisma.leaflets.get(id)!.status = 'reading';
      await expect(service.publish(id, ADMIN)).rejects.toMatchObject({ status: 409 });
    });

    it('drops an item whose own validity has ended and uses its own dates otherwise', async () => {
      const base = page().items[0];
      reader.readPage.mockResolvedValue(
        page({
          items: [
            { ...base, canonicalName: 'Old', validFrom: '2026-11-01', validTo: '2026-11-05' },
            { ...base, canonicalName: 'Weekend', validFrom: '2026-11-14', validTo: '2026-11-15' },
          ],
        }),
      );
      const id = await uploadAndRead(img(1));
      await service.publish(id, ADMIN);
      expect(prisma.obs.map((o: Row) => o.canonicalName)).toEqual(['Weekend']);
      expect(prisma.obs[0].validFrom).toEqual(new Date('2026-11-14T00:00:00.000Z'));
    });
  });

  describe('stale reads', () => {
    it('a reading leaflet with no progress for 30 min (API restarted) is failed, and publish is no longer blocked', async () => {
      const id = await uploadAndRead(img(1));
      const l = prisma.leaflets.get(id)!;
      l.status = 'reading';
      l.createdAt = new Date(NOW.getTime() - 29 * 60_000);
      await expect(service.findOne(id)).resolves.toMatchObject({ status: 'reading' });
      await expect(service.publish(id, ADMIN)).rejects.toMatchObject({ status: 409 });

      l.createdAt = new Date(NOW.getTime() - 31 * 60_000);
      await expect(service.list()).resolves.toEqual([expect.objectContaining({ id, status: 'failed' })]);
      expect(l.status).toBe('failed');
      await expect(service.publish(id, ADMIN)).resolves.toMatchObject({ promosWritten: 1 });
    });

    it('a read still progressing in this process is not expired by its age', async () => {
      let release!: (p: NormalizedLeafletPage) => void;
      reader.readPage.mockImplementationOnce(() => new Promise((r) => (release = r)));
      const { id } = await service.upload(ADMIN, img(1));
      const l = prisma.leaflets.get(id)!;
      l.createdAt = new Date(NOW.getTime() - 60 * 60_000);
      await expect(service.findOne(id)).resolves.toMatchObject({ status: 'reading' });
      release(page());
      await readSpy.mock.results[0].value;
      expect(l.status).toBe('done');
    });
  });

  describe('unpublish and edits', () => {
    it('unpublish hides promos from confirmedActive', async () => {
      const id = await uploadAndRead(img(1));
      await service.publish(id, ADMIN);
      expect(await promos.confirmedActive(NOW)).toHaveLength(1);
      await service.unpublish(id);
      expect(prisma.leaflets.get(id)!.unpublishedAt).toEqual(NOW);
      expect(await promos.confirmedActive(NOW)).toHaveLength(0);
    });

    it('refuses edits while published (409); unpublish → edit → publish replaces the rows', async () => {
      const id = await uploadAndRead(img(1));
      const itemId = prisma.items[0].id;
      await service.publish(id, ADMIN);

      await expect(service.updateItem(id, itemId, { promoPrice: 3.99 })).rejects.toMatchObject({ status: 409 });
      await expect(service.deleteItem(id, itemId)).rejects.toMatchObject({ status: 409 });
      await expect(service.updateLeaflet(id, { chain: 'Lidl' })).rejects.toMatchObject({ status: 409 });

      await service.unpublish(id);
      await service.updateItem(id, itemId, { promoPrice: 3.99, condition: null });
      await service.publish(id, ADMIN);

      expect(prisma.obs).toHaveLength(1);
      expect(prisma.obs[0]).toMatchObject({ promoPrice: 3.99, condition: null, adminLeafletId: id });
      expect(prisma.leaflets.get(id)!.unpublishedAt).toBeNull();
      const active = await promos.confirmedActive(NOW);
      expect(active.map((p) => p.promoPrice)).toEqual([3.99]);
    });

    it('updateLeaflet normalizes the chain and parses dates', async () => {
      reader.readPage.mockResolvedValue(page({ chain: null, validTo: null }));
      const id = await uploadAndRead(img(1));
      await service.updateLeaflet(id, { chain: 'Lidl', validTo: '2026-11-20' });
      expect(prisma.leaflets.get(id)).toMatchObject({ chain: 'lidl', validTo: new Date('2026-11-20T00:00:00.000Z') });
    });

    it('an item of another leaflet is a 404', async () => {
      const a = await uploadAndRead(img(1));
      await uploadAndRead(img(1));
      const otherItem = prisma.items[1].id;
      await expect(service.updateItem(a, otherItem, { name: 'x' })).rejects.toMatchObject({ status: 404 });
      await expect(service.deleteItem(a, otherItem)).rejects.toMatchObject({ status: 404 });
    });

    it('a personal leaflet is not reachable through the admin routes', async () => {
      prisma.leaflets.set('personal-1', { id: 'personal-1', kind: 'personal' });
      await expect(service.findOne('personal-1')).rejects.toMatchObject({ status: 404 });
      await expect(service.publish('personal-1', ADMIN)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('recipients', () => {
    it('counts push candidates who bought at the chain in 90 days, skipping encrypted accounts', async () => {
      const id = await uploadAndRead(img(1));
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'u1', defaultAccountId: 'a1' },
        { id: 'u2', defaultAccountId: 'a2' },
        { id: 'u3', defaultAccountId: 'a3' },
      ]);
      prisma.account.findUnique.mockImplementation(async ({ where }: { where: Row }) => ({
        encryptionTier: where.id === 'a3' ? 2 : 0,
      }));
      prisma.expense.findMany.mockImplementation(async ({ where }: { where: Row }) =>
        where.accountId === 'a1' ? [{ merchant: 'BIEDRONKA' }] : where.accountId === 'a3' ? [{ merchant: 'Biedronka' }] : [{ merchant: 'Lidl' }],
      );
      await expect(service.recipients(id)).resolves.toEqual({ users: 1 });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, pushToken: { not: null }, notifyLeafletPromos: true, defaultAccountId: { not: null } },
        }),
      );
    });

    it('is 0 without a chain', async () => {
      reader.readPage.mockResolvedValue(page({ chain: null }));
      const id = await uploadAndRead(img(1));
      await expect(service.recipients(id)).resolves.toEqual({ users: 0 });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('stats', () => {
    it('stats exclude ADMIN_EMAILS accounts', async () => {
      process.env.ADMIN_EMAILS = 'Boss@example.com';
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'boss', defaultAccountId: 'boss-default' }]);
      prisma.account.findMany.mockResolvedValueOnce([{ id: 'boss-owned' }]);
      prisma.leaflet.count = jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2);
      prisma.leaflet.aggregate = jest
        .fn()
        .mockResolvedValue({ _sum: { pagesRead: 12, pagesUnreadable: 1, pagesDropped: 3 } });
      prisma.leafletItem.count = jest.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(4);
      prisma.leafletNotificationLog.count = jest.fn().mockResolvedValueOnce(9).mockResolvedValueOnce(6);

      await expect(service.stats(30)).resolves.toEqual({
        personalLeaflets: 5,
        sharesWithMatch: 2,
        pagesRead: 12,
        pagesUnreadable: 1,
        pagesDropped: 3,
        matchesShown: 7,
        addedToList: 4,
        pushesSent: 9,
        pushesOpened: 6,
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: { in: ['boss@example.com'], mode: 'insensitive' } } }),
      );
      const since = new Date(NOW.getTime() - 30 * 86_400_000);
      const leafletWhere = { kind: 'personal', createdAt: { gte: since }, userId: { notIn: ['boss'] } };
      expect(prisma.leaflet.count).toHaveBeenNthCalledWith(1, { where: leafletWhere });
      expect(prisma.leaflet.count).toHaveBeenNthCalledWith(2, {
        where: { ...leafletWhere, items: { some: { basketName: { not: null } } } },
      });
      expect(prisma.leaflet.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: leafletWhere }));
      expect(prisma.leafletItem.count).toHaveBeenCalledWith({
        where: { basketName: { not: null }, leaflet: leafletWhere },
      });
      const logWhere = {
        type: 'leaflet_promo',
        sentAt: { gte: since },
        accountId: { notIn: expect.arrayContaining(['boss-default', 'boss-owned']) },
      };
      expect(prisma.leafletNotificationLog.count).toHaveBeenNthCalledWith(1, { where: logWhere });
      expect(prisma.leafletNotificationLog.count).toHaveBeenNthCalledWith(2, {
        where: { ...logWhere, openedAt: { not: null } },
      });
    });

    it('applies no exclusion filter when ADMIN_EMAILS is empty, and clamps days', async () => {
      process.env.ADMIN_EMAILS = '';
      prisma.leaflet.count = jest.fn().mockResolvedValue(0);
      prisma.leaflet.aggregate = jest.fn().mockResolvedValue({ _sum: {} });
      prisma.leafletItem.count = jest.fn().mockResolvedValue(0);
      const stats = await service.stats(10_000);
      expect(stats.pagesRead).toBe(0);
      const since = new Date(NOW.getTime() - 365 * 86_400_000);
      expect(prisma.leaflet.count).toHaveBeenNthCalledWith(1, { where: { kind: 'personal', createdAt: { gte: since } } });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });
});
