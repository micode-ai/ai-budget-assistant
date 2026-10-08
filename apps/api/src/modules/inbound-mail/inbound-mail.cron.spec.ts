import { InboundMailCron } from './inbound-mail.cron';

function setup(flag: string | null = 'true') {
  const prisma: any = {
    inboundReceipt: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const config: any = { get: (k: string) => ({ INBOUND_MAIL_ENABLED: flag })[k] };
  const processor: any = { process: jest.fn().mockResolvedValue(undefined) };
  const cron = new InboundMailCron(prisma, config, processor);
  (cron as any).logger = { warn: jest.fn(), log: jest.fn() };
  return { prisma, processor, cron };
}

describe('InboundMailCron.requeueStuck', () => {
  it('no-ops while the flag is off', async () => {
    const { prisma, processor, cron } = setup(null);
    await cron.requeueStuck();
    expect(prisma.inboundReceipt.updateMany).not.toHaveBeenCalled();
    expect(prisma.inboundReceipt.findMany).not.toHaveBeenCalled();
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('re-runs rows stuck > 10 min with attempts < 3, and fails those at 3 attempts', async () => {
    const { prisma, processor, cron } = setup();
    prisma.inboundReceipt.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    await cron.requeueStuck();

    const failWhere = prisma.inboundReceipt.updateMany.mock.calls[0][0];
    expect(failWhere.where).toMatchObject({ status: { in: ['received', 'processing'] }, attempts: { gte: 3 } });
    expect(failWhere.data).toEqual({ status: 'failed', errorCode: 'MAX_ATTEMPTS' });
    const cutoff = failWhere.where.updatedAt.lt as Date;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(10 * 60 * 1000 - 1000);

    expect(prisma.inboundReceipt.findMany.mock.calls[0][0].where.attempts).toEqual({ lt: 3 });
    expect(processor.process).toHaveBeenCalledWith('a');
    expect(processor.process).toHaveBeenCalledWith('b');
  });

  it('one failing row does not stop the others', async () => {
    const { prisma, processor, cron } = setup();
    prisma.inboundReceipt.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    processor.process.mockRejectedValueOnce(new Error('boom'));

    await cron.requeueStuck();

    expect(processor.process).toHaveBeenCalledTimes(2);
  });
});

describe('InboundMailCron.purgeExpired', () => {
  it('hard-deletes rows past expiresAt in id-ordered pages', async () => {
    const { prisma, cron } = setup();
    prisma.inboundReceipt.findMany.mockResolvedValue([{ id: 'x' }, { id: 'y' }]);
    prisma.inboundReceipt.deleteMany.mockResolvedValue({ count: 2 });

    await cron.purgeExpired();

    expect(prisma.inboundReceipt.findMany.mock.calls[0][0]).toMatchObject({
      where: { expiresAt: { lt: expect.any(Date) } },
      orderBy: { id: 'asc' },
    });
    expect(prisma.inboundReceipt.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['x', 'y'] } } });
  });

  it('still purges with the flag off, so stored mail never outlives its retention', async () => {
    const { prisma, cron } = setup(null);
    prisma.inboundReceipt.findMany.mockResolvedValue([{ id: 'x' }]);

    await cron.purgeExpired();

    expect(prisma.inboundReceipt.deleteMany).toHaveBeenCalled();
  });
});
