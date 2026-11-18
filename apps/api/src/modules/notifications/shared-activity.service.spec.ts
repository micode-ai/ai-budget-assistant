import { SharedActivityService } from './shared-activity.service';

describe('SharedActivityService dedup', () => {
  const build = () => {
    const seen = new Set<string>();
    const cache = {
      setIfAbsentStrict: jest.fn(async (k: string) => (seen.has(k) ? false : (seen.add(k), true))),
      del: jest.fn(async (k: string) => void seen.delete(k)),
    };
    const prisma = {
      account: { findUnique: jest.fn().mockResolvedValue({ name: 'A', type: 'shared' }) },
      accountMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u2' }]) },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Bob' }) },
    };
    const notifications = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
    const svc = new SharedActivityService(prisma as never, notifications as never, cache as never);
    return { svc, cache, notifications };
  };

  it('suppresses a duplicate within the window', async () => {
    const { svc, notifications } = build();
    await svc.notifyExpenseCreated('a', 'u1', 'e1', 5, 'USD');
    await svc.notifyExpenseCreated('a', 'u1', 'e1', 5, 'USD');
    expect(notifications.sendToUsers).toHaveBeenCalledTimes(1);
  });

  it('releases the stamp on failure so a retry notifies', async () => {
    const { svc, notifications } = build();
    notifications.sendToUsers.mockRejectedValueOnce(new Error('boom'));
    await svc.notifyExpenseCreated('a', 'u1', 'e1', 5, 'USD');
    await svc.notifyExpenseCreated('a', 'u1', 'e1', 5, 'USD');
    expect(notifications.sendToUsers).toHaveBeenCalledTimes(2);
  });

  it('fails open when Redis is down', async () => {
    const { svc, cache, notifications } = build();
    cache.setIfAbsentStrict.mockRejectedValue(new Error('down'));
    await svc.notifyExpenseCreated('a', 'u1', 'e1', 5, 'USD');
    expect(notifications.sendToUsers).toHaveBeenCalledTimes(1);
  });
});
