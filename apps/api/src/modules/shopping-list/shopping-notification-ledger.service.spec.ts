import { Prisma } from '@prisma/client';
import { ShoppingNotificationLedger } from './shopping-notification-ledger.service';

function makePrisma() {
  return {
    shoppingNotificationLog: {
      create: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

const P2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });

describe('ShoppingNotificationLedger', () => {
  it('tryRecord returns true when the row is newly inserted', async () => {
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.create.mockResolvedValue({ id: 'r1' });
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.tryRecord('a1', 'shopping_reminder', 'restock:Bread:2026-07-13')).resolves.toBe(true);
    expect(prisma.shoppingNotificationLog.create).toHaveBeenCalledWith({
      data: { accountId: 'a1', type: 'shopping_reminder', dedupKey: 'restock:Bread:2026-07-13' },
    });
  });

  it('tryRecord returns false on P2002 (already sent this cycle)', async () => {
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.create.mockRejectedValue(P2002);
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.tryRecord('a1', 'shopping_reminder', 'k')).resolves.toBe(false);
  });

  it('tryRecord rethrows non-P2002 errors', async () => {
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.create.mockRejectedValue(new Error('db down'));
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.tryRecord('a1', 'shopping_deal', 'k')).rejects.toThrow('db down');
  });

  it('withinFloor is false when minGapDays <= 0 (floor disabled), without querying', async () => {
    const prisma = makePrisma();
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.withinFloor('a1', 'shopping_reminder', 0)).resolves.toBe(false);
    expect(prisma.shoppingNotificationLog.findFirst).not.toHaveBeenCalled();
  });

  it('withinFloor is false when no prior send exists', async () => {
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.findFirst.mockResolvedValue(null);
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.withinFloor('a1', 'shopping_reminder', 2)).resolves.toBe(false);
  });

  it('withinFloor is true when the last send is within the gap window', async () => {
    const now = new Date('2026-07-17T10:00:00Z');
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.findFirst.mockResolvedValue({ sentAt: new Date('2026-07-16T10:00:00Z') }); // 1 day ago
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.withinFloor('a1', 'shopping_reminder', 2, now)).resolves.toBe(true);
  });

  it('withinFloor is false when the last send is older than the gap window', async () => {
    const now = new Date('2026-07-17T10:00:00Z');
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.findFirst.mockResolvedValue({ sentAt: new Date('2026-07-14T09:00:00Z') }); // >2 days ago
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.withinFloor('a1', 'shopping_reminder', 2, now)).resolves.toBe(false);
  });

  it('deleteOlderThan deletes rows older than N days and returns the count', async () => {
    const now = new Date('2026-07-17T00:00:00Z');
    const prisma = makePrisma();
    prisma.shoppingNotificationLog.deleteMany.mockResolvedValue({ count: 5 });
    const led = new ShoppingNotificationLedger(prisma as any);
    await expect(led.deleteOlderThan(90, now)).resolves.toBe(5);
    const arg = prisma.shoppingNotificationLog.deleteMany.mock.calls[0][0];
    expect(arg.where.sentAt.lt).toEqual(new Date('2026-04-18T00:00:00Z')); // now - 90 days
  });
});
