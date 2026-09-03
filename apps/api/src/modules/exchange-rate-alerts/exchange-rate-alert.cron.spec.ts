import { ExchangeRateAlertCron } from './exchange-rate-alert.cron';

function makeWatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'watch-1',
    userId: 'user-1',
    fromCurrency: 'USD',
    toCurrency: 'PLN',
    targetRate: 4.35,
    direction: 'above',
    ...overrides,
  };
}

function makeCron(watches: ReturnType<typeof makeWatch>[], rates: Record<string, number>) {
  const update = jest.fn().mockResolvedValue(undefined);
  const prisma: any = {
    exchangeRateWatch: {
      findMany: jest.fn().mockResolvedValue(watches),
      update,
    },
  };
  const sendToUser = jest.fn().mockResolvedValue(true);
  const notificationsService: any = { sendToUser };
  const getRates = jest.fn().mockResolvedValue({ base: 'USD', rates, updatedAt: new Date().toISOString() });
  const exchangeRateService: any = { getRates };

  const cron = new ExchangeRateAlertCron(prisma, notificationsService, exchangeRateService);
  return { cron, prisma, sendToUser, getRates, update };
}

describe('ExchangeRateAlertCron.checkWatches', () => {
  it('fires and deactivates an "above" watch once the rate has risen past target', async () => {
    const { cron, update, sendToUser } = makeCron([makeWatch({ direction: 'above', targetRate: 4.3 })], { PLN: 4.35 });
    await cron.checkWatches();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'watch-1' },
      data: { isActive: false, triggeredAt: expect.any(Date), triggeredRate: 4.35 },
    });
    expect(sendToUser).toHaveBeenCalledTimes(1);
    expect(sendToUser.mock.calls[0][4]).toBe('rate_watch_hit');
  });

  it('does not fire an "above" watch while the rate is still below target', async () => {
    const { cron, update, sendToUser } = makeCron([makeWatch({ direction: 'above', targetRate: 4.4 })], { PLN: 4.35 });
    await cron.checkWatches();
    expect(update).not.toHaveBeenCalled();
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('fires a "below" watch once the rate has dropped to or under target', async () => {
    const { cron, update } = makeCron([makeWatch({ direction: 'below', targetRate: 4.35 })], { PLN: 4.35 });
    await cron.checkWatches();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('skips a watch whose toCurrency has no known rate, without throwing', async () => {
    const { cron, update } = makeCron([makeWatch({ toCurrency: 'GBP' })], { PLN: 4.35 });
    await expect(cron.checkWatches()).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });

  it('calls getRates once per distinct fromCurrency, not once per watch', async () => {
    const { cron, getRates } = makeCron(
      [makeWatch({ id: 'w1' }), makeWatch({ id: 'w2' }), makeWatch({ id: 'w3', fromCurrency: 'EUR' })],
      { PLN: 1 },
    );
    await cron.checkWatches();
    expect(getRates).toHaveBeenCalledTimes(2);
  });

  it('rolls back isActive to true when the push send fails, so the next run retries', async () => {
    const { cron, update, sendToUser } = makeCron([makeWatch({ targetRate: 4.3 })], { PLN: 4.35 });
    sendToUser.mockResolvedValueOnce(false);
    await cron.checkWatches();
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'watch-1' },
      data: { isActive: false, triggeredAt: expect.any(Date), triggeredRate: 4.35 },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'watch-1' },
      data: { isActive: true, triggeredAt: null, triggeredRate: null },
    });
  });

  it('one watch throwing does not stop the rest of the batch', async () => {
    const { cron, update, sendToUser } = makeCron(
      [makeWatch({ id: 'w1', targetRate: 4.3 }), makeWatch({ id: 'w2', targetRate: 4.3 })],
      { PLN: 4.35 },
    );
    update.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(undefined);
    await expect(cron.checkWatches()).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledTimes(2);
    expect(sendToUser).toHaveBeenCalledTimes(1);
  });
});
