import { Prisma } from '@prisma/client';
import { NotificationDedupLedger } from './notification-dedup-ledger';

function makeDelegate() {
  return {
    create: jest.fn(),
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
  };
}

const P2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });

describe('NotificationDedupLedger', () => {
  it('tryRecord returns true when the row is newly inserted', async () => {
    const delegate = makeDelegate();
    delegate.create.mockResolvedValue({ id: 'r1' });
    const ledger = new NotificationDedupLedger(delegate);
    await expect(ledger.tryRecord('a1', 'shopping_reminder', 'restock:Bread:2026-07-13')).resolves.toBe(true);
    expect(delegate.create).toHaveBeenCalledWith({
      data: { accountId: 'a1', type: 'shopping_reminder', dedupKey: 'restock:Bread:2026-07-13' },
    });
  });

  it('tryRecord returns false on P2002 (already sent this cycle)', async () => {
    const delegate = makeDelegate();
    delegate.create.mockRejectedValue(P2002);
    const ledger = new NotificationDedupLedger(delegate);
    await expect(ledger.tryRecord('a1', 'shopping_reminder', 'k')).resolves.toBe(false);
  });

  it('tryRecord rethrows non-P2002 errors', async () => {
    const delegate = makeDelegate();
    delegate.create.mockRejectedValue(new Error('db down'));
    const ledger = new NotificationDedupLedger(delegate);
    await expect(ledger.tryRecord('a1', 'shopping_deal', 'k')).rejects.toThrow('db down');
  });

  it('withinFloor is false when minGapDays <= 0 (floor disabled), without querying', async () => {
    const delegate = makeDelegate();
    const ledger = new NotificationDedupLedger(delegate);
    await expect(ledger.withinFloor('a1', 'shopping_reminder', 0)).resolves.toBe(false);
    expect(delegate.findFirst).not.toHaveBeenCalled();
  });

  it('withinFloor is false when no prior send exists', async () => {
    const delegate = makeDelegate();
    delegate.findFirst.mockResolvedValue(null);
    const ledger = new NotificationDedupLedger(delegate);
    await expect(ledger.withinFloor('a1', 'shopping_reminder', 2)).resolves.toBe(false);
  });

  it('withinFloor is true when the last send is within the gap window', async () => {
    const now = new Date('2026-07-17T10:00:00Z');
    const delegate = makeDelegate();
    delegate.findFirst.mockResolvedValue({ sentAt: new Date('2026-07-16T10:00:00Z') }); // 1 day ago
    const ledger = new NotificationDedupLedger(delegate);
    await expect(ledger.withinFloor('a1', 'shopping_reminder', 2, now)).resolves.toBe(true);
  });

  it('withinFloor is false when the last send is older than the gap window', async () => {
    const now = new Date('2026-07-17T10:00:00Z');
    const delegate = makeDelegate();
    delegate.findFirst.mockResolvedValue({ sentAt: new Date('2026-07-14T09:00:00Z') }); // >2 days ago
    const ledger = new NotificationDedupLedger(delegate);
    await expect(ledger.withinFloor('a1', 'shopping_reminder', 2, now)).resolves.toBe(false);
  });

  it('deleteOlderThan deletes rows older than N days and returns the count', async () => {
    const now = new Date('2026-07-17T00:00:00Z');
    const delegate = makeDelegate();
    delegate.deleteMany.mockResolvedValue({ count: 5 });
    const ledger = new NotificationDedupLedger(delegate);
    await expect(ledger.deleteOlderThan(90, now)).resolves.toBe(5);
    const arg = delegate.deleteMany.mock.calls[0][0];
    expect(arg.where.sentAt.lt).toEqual(new Date('2026-04-18T00:00:00Z')); // now - 90 days
  });
});
