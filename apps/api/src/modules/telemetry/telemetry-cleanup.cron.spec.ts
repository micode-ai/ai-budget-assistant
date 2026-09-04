import { TelemetryCleanupCron } from './telemetry-cleanup.cron';

describe('TelemetryCleanupCron', () => {
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
