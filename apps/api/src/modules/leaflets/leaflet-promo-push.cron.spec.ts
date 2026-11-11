import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { LeafletPromoPushCron } from './leaflet-promo-push.cron';
import { LeafletNotificationLedger } from './leaflet-notification-ledger.service';
import type { ConfirmedPromo } from './community-promo.service';
import * as ni18n from '../notifications/notification-i18n';

const NOW = new Date('2026-11-12T09:00:00.000Z');
const DAY_MS = 86_400_000;

function promo(canonicalName: string, over: Partial<ConfirmedPromo> = {}): ConfirmedPromo {
  return {
    key: `key-${canonicalName}`,
    chain: 'Biedronka',
    canonicalName,
    promoPrice: 4.99,
    currencyCode: 'PLN',
    condition: null,
    validFrom: '2026-11-10',
    validTo: '2026-11-16',
    ...over,
  };
}

/** In-memory `leafletNotificationLog` delegate with the real unique (accountId, dedupKey). */
function fakeLog() {
  const rows: { id: string; accountId: string; type: string; dedupKey: string; sentAt: Date; openedAt: Date | null }[] = [];
  let seq = 0;
  let clock = NOW;
  return {
    rows,
    setClock(d: Date) {
      clock = d;
    },
    create: jest.fn(async ({ data }: { data: { accountId: string; type: string; dedupKey: string } }) => {
      if (rows.some((r) => r.accountId === data.accountId && r.dedupKey === data.dedupKey)) {
        throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' });
      }
      const row = { id: `log-${++seq}`, ...data, sentAt: clock, openedAt: null };
      rows.push(row);
      return row;
    }),
    findFirst: jest.fn(async ({ where }: { where: { accountId: string; type: string } }) => {
      const hits = rows
        .filter((r) => r.accountId === where.accountId && r.type === where.type)
        .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
      return hits[0] ? { sentAt: hits[0].sentAt } : null;
    }),
    findMany: jest.fn(async ({ where }: { where: { accountId: string; dedupKey: { in: string[] } } }) =>
      rows
        .filter((r) => r.accountId === where.accountId && where.dedupKey.in.includes(r.dedupKey))
        .map((r) => ({ dedupKey: r.dedupKey })),
    ),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  };
}

describe('LeafletPromoPushCron', () => {
  let flag: string | undefined;
  let log: ReturnType<typeof fakeLog>;
  let prisma: {
    user: { findMany: jest.Mock };
    account: { findUnique: jest.Mock };
    expense: { findMany: jest.Mock };
    shoppingListItem: { findMany: jest.Mock };
    leafletNotificationLog: ReturnType<typeof fakeLog>;
  };
  let promos: { confirmedActive: jest.Mock };
  let priceHistory: { getBasketRows: jest.Mock };
  let matcher: { match: jest.Mock };
  let notifications: { sendToUser: jest.Mock };
  let cron: LeafletPromoPushCron;

  const basketRows = [
    { resolvedName: 'Masło Łaciate 200g', date: new Date(NOW.getTime() - 3 * DAY_MS), unitPrice: 7.49, currency: 'PLN' },
    { resolvedName: 'Masło Łaciate 200g', date: new Date(NOW.getTime() - 10 * DAY_MS), unitPrice: 7.49, currency: 'PLN' },
    { resolvedName: 'Mleko 1L', date: new Date(NOW.getTime() - 3 * DAY_MS), unitPrice: 3.2, currency: 'PLN' },
    { resolvedName: 'Mleko 1L', date: new Date(NOW.getTime() - 9 * DAY_MS), unitPrice: 3.2, currency: 'PLN' },
  ];

  beforeEach(() => {
    flag = 'true';
    log = fakeLog();
    prisma = {
      user: {
        findMany: jest.fn(async ({ cursor }: { cursor?: unknown }) =>
          cursor ? [] : [{ id: 'user-1', defaultAccountId: 'acc-1' }],
        ),
      },
      account: { findUnique: jest.fn(async () => ({ encryptionTier: 0 })) },
      expense: { findMany: jest.fn(async () => [{ merchant: 'BIEDRONKA 1234 WARSZAWA' }]) },
      shoppingListItem: { findMany: jest.fn(async () => []) },
      leafletNotificationLog: log,
    };
    promos = { confirmedActive: jest.fn(async () => [promo('Masło Łaciate 200g')]) };
    priceHistory = { getBasketRows: jest.fn(async () => basketRows) };
    matcher = {
      match: jest.fn(async (_basket: unknown, ps: ConfirmedPromo[]) =>
        ps.map((p, i) => ({ promoIndex: i, basketName: p.canonicalName })),
      ),
    };
    notifications = { sendToUser: jest.fn(async () => true) };
    const config = { get: (k: string) => (k === 'COMMUNITY_PROMOS_ENABLED' ? flag : undefined) } as unknown as ConfigService;
    const ledger = new LeafletNotificationLedger(prisma as never);
    cron = new LeafletPromoPushCron(
      prisma as never,
      config,
      promos as never,
      priceHistory as never,
      matcher as never,
      ledger,
      notifications as never,
    );
  });

  it('flag off → no queries', async () => {
    flag = undefined;
    await cron.run(NOW);
    expect(promos.confirmedActive).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('pushes a matched promo once, with type leaflet_promo, the pushKey and the usual price', async () => {
    await cron.run(NOW);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          notifyLeafletPromos: true,
          pushToken: { not: null },
          defaultAccountId: { not: null },
        }),
        orderBy: { id: 'asc' },
      }),
    );
    expect(notifications.sendToUser).toHaveBeenCalledTimes(1);
    const [userId, title, body, data, type] = notifications.sendToUser.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(type).toBe('leaflet_promo');
    expect(data).toEqual({ type: 'leaflet_promo', pushKey: log.rows[0].id });
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toMatchObject({ accountId: 'acc-1', type: 'leaflet_promo', dedupKey: 'key-Masło Łaciate 200g' });
    expect(title('en')).toBe(ni18n.leafletPromoTitle('en'));
    const text = body('en');
    expect(text).toContain('Masło Łaciate 200g');
    expect(text).toContain('4.99 PLN');
    expect(text).toContain('7.49 PLN');
    expect(text).toContain('Biedronka');
  });

  it('omits the usual price when it does not exist in the promo currency', async () => {
    promos.confirmedActive.mockResolvedValue([promo('Masło Łaciate 200g', { currencyCode: 'EUR', key: 'k-eur' })]);
    await cron.run(NOW);
    const body = notifications.sendToUser.mock.calls[0][2];
    expect(body('en')).toContain('4.99 EUR');
    expect(body('en')).not.toContain('7.49');
  });

  it('user who never shopped at the chain → no push', async () => {
    prisma.expense.findMany.mockResolvedValue([{ merchant: 'Lidl sp. z o.o.' }]);
    await cron.run(NOW);
    expect(matcher.match).not.toHaveBeenCalled();
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('only looks at merchants of that account from the last 90 days', async () => {
    await cron.run(NOW);
    const args = prisma.expense.findMany.mock.calls[0][0];
    expect(args.where.accountId).toBe('acc-1');
    expect(args.where.date.gte.getTime()).toBe(NOW.getTime() - 90 * DAY_MS);
  });

  it('expired promo never pushed', async () => {
    promos.confirmedActive.mockResolvedValue([promo('Masło Łaciate 200g', { validTo: '2026-11-11' })]);
    await cron.run(NOW);
    expect(matcher.match).not.toHaveBeenCalled();
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('a promo that starts tomorrow is not pushed today, and is pushed on its start day', async () => {
    promos.confirmedActive.mockResolvedValue([promo('Masło Łaciate 200g', { validFrom: '2026-11-13' })]);
    await cron.run(NOW);
    expect(matcher.match).not.toHaveBeenCalled();
    expect(notifications.sendToUser).not.toHaveBeenCalled();
    expect(log.rows).toHaveLength(0);

    const startDay = new Date('2026-11-13T09:00:00.000Z');
    log.setClock(startDay);
    await cron.run(startDay);
    expect(notifications.sendToUser).toHaveBeenCalledTimes(1);
  });

  it('the push says until when the promo runs', async () => {
    await cron.run(NOW);
    expect(notifications.sendToUser.mock.calls[0][2]('en')).toContain('until 16.11');
  });

  it('second run same day → no second push', async () => {
    await cron.run(NOW);
    promos.confirmedActive.mockResolvedValue([promo('Masło Łaciate 200g'), promo('Mleko 1L')]);
    log.setClock(new Date(NOW.getTime() + 3 * 3_600_000));
    await cron.run(new Date(NOW.getTime() + 3 * 3_600_000));
    expect(notifications.sendToUser).toHaveBeenCalledTimes(1);
  });

  it('next day: a new promo is pushed, an already-pushed one never again', async () => {
    await cron.run(NOW);
    const tomorrow = new Date(NOW.getTime() + DAY_MS - 5 * 60_000); // cron start jitter
    log.setClock(tomorrow);
    promos.confirmedActive.mockResolvedValue([promo('Masło Łaciate 200g'), promo('Mleko 1L')]);
    await cron.run(tomorrow);
    expect(notifications.sendToUser).toHaveBeenCalledTimes(2);
    // The already-pushed promo is not even offered to the model again.
    const offered: ConfirmedPromo[] = matcher.match.mock.calls[1][1];
    expect(offered.map((p) => p.canonicalName)).toEqual(['Mleko 1L']);
    const body = notifications.sendToUser.mock.calls[1][2];
    expect(body('en')).toContain('Mleko 1L');
    expect(body('en')).not.toContain('Masło');
  });

  it('lists at most 3 matches in one push', async () => {
    const names = ['A 1', 'B 2', 'C 3', 'D 4', 'E 5'];
    promos.confirmedActive.mockResolvedValue(names.map((n) => promo(n)));
    await cron.run(NOW);
    expect(notifications.sendToUser).toHaveBeenCalledTimes(1);
    expect(log.rows).toHaveLength(3);
    const body = notifications.sendToUser.mock.calls[0][2]('en');
    expect(body).toContain('A 1');
    expect(body).toContain('C 3');
    expect(body).not.toContain('D 4');
  });

  it('encrypted account skipped', async () => {
    prisma.account.findUnique.mockResolvedValue({ encryptionTier: 2 });
    await cron.run(NOW);
    expect(priceHistory.getBasketRows).not.toHaveBeenCalled();
    expect(matcher.match).not.toHaveBeenCalled();
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('no model match → no push and nothing recorded', async () => {
    matcher.match.mockResolvedValue([]);
    await cron.run(NOW);
    expect(notifications.sendToUser).not.toHaveBeenCalled();
    expect(log.rows).toHaveLength(0);
  });

  it('a failing user does not stop the run', async () => {
    prisma.user.findMany.mockImplementation(async ({ cursor }: { cursor?: unknown }) =>
      cursor
        ? []
        : [
            { id: 'user-1', defaultAccountId: 'acc-1' },
            { id: 'user-2', defaultAccountId: 'acc-2' },
          ],
    );
    priceHistory.getBasketRows.mockRejectedValueOnce(new Error('db down'));
    await cron.run(NOW);
    expect(notifications.sendToUser).toHaveBeenCalledTimes(1);
    expect(notifications.sendToUser.mock.calls[0][0]).toBe('user-2');
  });
});
