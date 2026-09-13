import { AnomalyAlertWriterService } from './anomaly-alert-writer.service';

function makeWriter(overrides: {
  alertCreate?: jest.Mock;
  alertCount?: jest.Mock;
  sendToUser?: jest.Mock;
} = {}) {
  const prisma: any = {
    anomalyAlert: {
      create: overrides.alertCreate ?? jest.fn().mockResolvedValue({ id: 'alert-1' }),
      count: overrides.alertCount ?? jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const notifications: any = {
    sendToUser: overrides.sendToUser ?? jest.fn().mockResolvedValue(true),
  };
  const writer = new AnomalyAlertWriterService(prisma, notifications);
  return { writer, prisma, notifications };
}

describe('AnomalyAlertWriterService.createAlert', () => {
  const input = {
    accountId: 'acc-1',
    userId: 'user-1',
    type: 'duplicate_charge' as const,
    dedupKey: 'dup:e-1',
    params: { merchant: 'Netflix' },
    expenseId: 'e-1',
    pushTitle: () => 'title',
    pushBody: () => 'body',
  };

  it('creates the row and sends push when under the daily cap', async () => {
    const { writer, prisma, notifications } = makeWriter();
    await writer.createAlert(input);
    expect(prisma.anomalyAlert.create).toHaveBeenCalledTimes(1);
    expect(notifications.sendToUser).toHaveBeenCalledTimes(1);
    expect(prisma.anomalyAlert.update).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: { pushSent: true },
    });
  });

  it('silently skips on dedupKey collision (P2002)', async () => {
    const err: any = new Error('unique');
    err.code = 'P2002';
    const { writer, notifications } = makeWriter({ alertCreate: jest.fn().mockRejectedValue(err) });
    await expect(writer.createAlert(input)).resolves.toBeUndefined();
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('creates the feed row but skips push when the daily cap is reached', async () => {
    const { writer, prisma, notifications } = makeWriter({ alertCount: jest.fn().mockResolvedValue(3) });
    await writer.createAlert(input);
    expect(prisma.anomalyAlert.create).toHaveBeenCalledTimes(1);
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('does not stamp pushSent when the push fails', async () => {
    const { writer, prisma } = makeWriter({ sendToUser: jest.fn().mockResolvedValue(false) });
    await writer.createAlert(input);
    expect(prisma.anomalyAlert.update).not.toHaveBeenCalled();
  });

  it('rethrows non-P2002 errors so fire-and-forget callers can log them', async () => {
    const { writer } = makeWriter({ alertCreate: jest.fn().mockRejectedValue(new Error('boom')) });
    await expect(writer.createAlert(input)).rejects.toThrow('boom');
  });

  it('skips the push entirely when skipPush is set (feed-only alert)', async () => {
    const { writer, prisma, notifications } = makeWriter();
    await writer.createAlert({
      accountId: 'acc-1',
      userId: 'user-1',
      type: 'price_overcharge',
      dedupKey: 'overcharge:e-1',
      params: {},
      expenseId: 'e-1',
      skipPush: true,
    });
    expect(prisma.anomalyAlert.create).toHaveBeenCalledTimes(1);
    expect(prisma.anomalyAlert.count).not.toHaveBeenCalled();
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });
});
