import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma.service';

describe('UsersService notification preferences', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UsersService);
  });

  describe('notification preferences — trip settle-up', () => {
    it('includes tripSettleUp in getNotificationPreferences', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue({
        notifyBudgetAlerts: true,
        notifySharedActivity: true,
        notifyDebtReminders: true,
        notifyRecurringExpenses: true,
        notifySubscriptionRenewals: true,
        notifyAnomalyAlerts: true,
        notifyTrackingGap: true,
        notifyPurchaseRequests: true,
        notifyTripSettleUp: true,
      });
      const prefs = await service.getNotificationPreferences('user-1');
      expect(prefs.tripSettleUp).toBe(true);
    });

    it('updates notifyTripSettleUp via updateNotificationPreferences', async () => {
      prisma.user.update = jest.fn().mockResolvedValue({ notifyTripSettleUp: false });
      prisma.user.findUnique = jest.fn().mockResolvedValue({ notifyTripSettleUp: false });
      await service.updateNotificationPreferences('user-1', { tripSettleUp: false });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ notifyTripSettleUp: false }) }),
      );
    });
  });
});

describe('UsersService.search', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UsersService);
  });

  it('returns [] without querying the DB for a query shorter than 2 characters', async () => {
    const result = await service.search('user-1', 'a');
    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('excludes the caller and inactive users, matches name or email, caps at 20', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-2', name: 'Anna', email: 'anna@example.com' },
    ]);

    const result = await service.search('user-1', 'ann');

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { not: 'user-1' },
        isActive: true,
        OR: [
          { name: { contains: 'ann', mode: 'insensitive' } },
          { email: { contains: 'ann', mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true },
      take: 20,
    });
    expect(result).toEqual([{ id: 'user-2', name: 'Anna', email: 'anna@example.com' }]);
  });
});

/**
 * A lightweight in-memory fake of the `userPaymentMethod` Prisma delegate — real
 * mutation, not just call-recording — so "replacing truly removes the previous
 * entries" is a falsifiable assertion on the resulting data, not a mock-call check
 * that would still pass if the delete were silently dropped. `$transaction` here just
 * awaits whatever array it's given; `deleteMany`/`createMany` mutate `rows`
 * synchronously (no internal `await`) so by the time the transaction array literal is
 * built, both operations have already run in delete-then-create order — mirroring how
 * Prisma's real array-form `$transaction` executes its statements in sequence.
 */
function makeInMemoryPaymentMethodPrisma() {
  let rows: { id: string; userId: string; method: string; handle: string; sortOrder: number }[] = [];
  let nextId = 0;
  // Legacy single-pair state per userId, so a test can seed a pre-existing legacy
  // value and then assert `replacePaymentMethods` actually nulled it out — a real
  // mutation, not just a call-recording spy.
  const legacyPairs = new Map<string, { paymentMethod: string | null; paymentHandle: string | null }>();

  const userPaymentMethod = {
    deleteMany: jest.fn(async ({ where }: { where: { userId: string } }) => {
      const before = rows.length;
      rows = rows.filter((r) => r.userId !== where.userId);
      return { count: before - rows.length };
    }),
    createMany: jest.fn(async ({ data }: { data: { userId: string; method: string; handle: string; sortOrder: number }[] }) => {
      for (const d of data) {
        rows.push({ id: `pm-${++nextId}`, ...d });
      }
      return { count: data.length };
    }),
    findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
      rows
        .filter((r) => r.userId === where.userId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((r) => ({ method: r.method, handle: r.handle })),
    ),
  };

  const user = {
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: { paymentMethod?: string | null; paymentHandle?: string | null } }) => {
      const current = legacyPairs.get(where.id) ?? { paymentMethod: null, paymentHandle: null };
      const next = {
        paymentMethod: 'paymentMethod' in data ? data.paymentMethod ?? null : current.paymentMethod,
        paymentHandle: 'paymentHandle' in data ? data.paymentHandle ?? null : current.paymentHandle,
      };
      legacyPairs.set(where.id, next);
      return { id: where.id, ...next };
    }),
  };

  return {
    userPaymentMethod,
    user,
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    _rows: () => rows,
    _seedLegacyPair: (userId: string, pair: { paymentMethod: string | null; paymentHandle: string | null }) =>
      legacyPairs.set(userId, pair),
    _legacyPair: (userId: string) => legacyPairs.get(userId) ?? { paymentMethod: null, paymentHandle: null },
  };
}

describe('UsersService.replacePaymentMethods / getPaymentMethods', () => {
  it('happy path: stores the list in the order given and getPaymentMethods returns it ordered by sortOrder', async () => {
    const prisma = makeInMemoryPaymentMethodPrisma();
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = module.get(UsersService);

    const result = await service.replacePaymentMethods('user-1', [
      { method: 'revolut' as any, handle: 'rev-handle' },
      { method: 'blik' as any, handle: '+48 123 456 789' },
    ]);

    expect(result).toEqual([
      { method: 'revolut', handle: 'rev-handle' },
      { method: 'blik', handle: '+48 123 456 789' },
    ]);
    expect(await service.getPaymentMethods('user-1')).toEqual(result);
  });

  it('replacing truly removes the previous entries — a second call with a disjoint list leaves none of the first list behind', async () => {
    const prisma = makeInMemoryPaymentMethodPrisma();
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = module.get(UsersService);

    await service.replacePaymentMethods('user-1', [
      { method: 'revolut' as any, handle: 'old-revolut' },
      { method: 'paypal' as any, handle: 'old-paypal' },
    ]);
    expect(prisma._rows()).toHaveLength(2);

    const second = await service.replacePaymentMethods('user-1', [{ method: 'blik' as any, handle: 'new-blik' }]);

    expect(second).toEqual([{ method: 'blik', handle: 'new-blik' }]);
    // The old rows are gone from the underlying store, not just absent from this response.
    expect(prisma._rows()).toEqual([
      expect.objectContaining({ userId: 'user-1', method: 'blik', handle: 'new-blik' }),
    ]);
    expect(prisma._rows().some((r) => r.handle === 'old-revolut' || r.handle === 'old-paypal')).toBe(false);

    const fetched = await service.getPaymentMethods('user-1');
    expect(fetched).toEqual([{ method: 'blik', handle: 'new-blik' }]);
  });

  it("replacing one user's list never touches another user's rows", async () => {
    const prisma = makeInMemoryPaymentMethodPrisma();
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = module.get(UsersService);

    await service.replacePaymentMethods('user-1', [{ method: 'revolut' as any, handle: 'user1-rev' }]);
    await service.replacePaymentMethods('user-2', [{ method: 'paypal' as any, handle: 'user2-pp' }]);

    await service.replacePaymentMethods('user-1', []);

    expect(await service.getPaymentMethods('user-1')).toEqual([]);
    expect(await service.getPaymentMethods('user-2')).toEqual([{ method: 'paypal', handle: 'user2-pp' }]);
  });

  it('clears the legacy paymentMethod/paymentHandle pair in the same transaction — closes the stale-fallback trap', async () => {
    const prisma = makeInMemoryPaymentMethodPrisma();
    prisma._seedLegacyPair('user-1', { paymentMethod: 'revolut', paymentHandle: 'legacy-revolut' });
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = module.get(UsersService);

    await service.replacePaymentMethods('user-1', [{ method: 'blik' as any, handle: 'blik-x' }]);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { paymentMethod: null, paymentHandle: null },
    });
    expect(prisma._legacyPair('user-1')).toEqual({ paymentMethod: null, paymentHandle: null });
    // The clear runs even though the new list is non-empty — the legacy pair must not
    // survive ANY save through this endpoint, not just a save-to-empty.
    expect(await service.getPaymentMethods('user-1')).toEqual([{ method: 'blik', handle: 'blik-x' }]);
  });

  it('the legacy-pair clear and the list write are in the SAME $transaction call (atomic, not a second write)', async () => {
    const prisma = makeInMemoryPaymentMethodPrisma();
    prisma._seedLegacyPair('user-1', { paymentMethod: 'revolut', paymentHandle: 'legacy-revolut' });
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = module.get(UsersService);

    await service.replacePaymentMethods('user-1', []);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(3);
  });

  it("clearing to an empty list also clears the legacy pair — a later delete of the last row can't resurrect it", async () => {
    const prisma = makeInMemoryPaymentMethodPrisma();
    prisma._seedLegacyPair('user-1', { paymentMethod: 'revolut', paymentHandle: 'legacy-revolut' });
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = module.get(UsersService);

    // Step 1: user adds one entry via the new list editor and saves.
    await service.replacePaymentMethods('user-1', [{ method: 'blik' as any, handle: 'blik-x' }]);
    // Step 2: later, they remove it — the list is now empty.
    await service.replacePaymentMethods('user-1', []);

    expect(await service.getPaymentMethods('user-1')).toEqual([]);
    expect(prisma._legacyPair('user-1')).toEqual({ paymentMethod: null, paymentHandle: null });
  });
});
