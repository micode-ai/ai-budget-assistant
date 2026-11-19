import { TelemetryCleanupCron } from './telemetry-cleanup.cron';

describe('TelemetryCleanupCron', () => {
  it('prunes client errors on the same 90-day window, and never throws', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const cron = new TelemetryCleanupCron({ clientError: { deleteMany } } as never);

    await expect(cron.pruneClientErrors()).resolves.toBe(3);
    const cutoff = deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    expect(Math.round((Date.now() - cutoff.getTime()) / 86_400_000)).toBe(90);

    deleteMany.mockRejectedValue(new Error('db down'));
    await expect(cron.pruneClientErrors()).resolves.toBe(0);
  });

  it('the cron runs both prunes', async () => {
    const prisma = {
      telemetryEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      clientError: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    await new TelemetryCleanupCron(prisma as never).handleCron();
    expect(prisma.telemetryEvent.deleteMany).toHaveBeenCalled();
    expect(prisma.clientError.deleteMany).toHaveBeenCalled();
  });

  it('deletes rows older than the retention window and reports the count', async () => {
    const prisma = { telemetryEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 7 }) } };
    const cron = new TelemetryCleanupCron(prisma as never);

    const deleted = await cron.prune();

    expect(deleted).toBe(7);
    const cutoff = prisma.telemetryEvent.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    const days = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
  });

  it('never throws — a failed prune must not take the cron process down', async () => {
    const prisma = {
      telemetryEvent: { deleteMany: jest.fn().mockRejectedValue(new Error('db down')) },
    };
    const cron = new TelemetryCleanupCron(prisma as never);

    await expect(cron.prune()).resolves.toBe(0);
  });
});
