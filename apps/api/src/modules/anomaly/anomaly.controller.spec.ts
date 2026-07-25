import { AnomalyController } from './anomaly.controller';

describe('AnomalyController', () => {
  const service: any = {
    findAll: jest.fn().mockResolvedValue({ alerts: [], unreadCount: 0 }),
    markRead: jest.fn().mockResolvedValue({ success: true, updated: 1 }),
    markAllRead: jest.fn().mockResolvedValue({ success: true, updated: 1 }),
    dismiss: jest.fn().mockResolvedValue({ success: true, updated: 1 }),
    getPriceCheckSummary: jest.fn().mockResolvedValue({ totalsByCurrency: {}, alertCount: 0, since: '2026-01-01' }),
  };
  const controller = new AnomalyController(service);
  const req: any = { accountId: 'acc-1', user: { id: 'user-1' } };

  it('read-all is declared before :id routes (Express declaration order)', () => {
    const methods = Object.getOwnPropertyNames(AnomalyController.prototype);
    expect(methods.indexOf('markAllRead')).toBeLessThan(methods.indexOf('markRead'));
  });

  it('price-check-summary is declared before :id routes (Express declaration order)', () => {
    const methods = Object.getOwnPropertyNames(AnomalyController.prototype);
    expect(methods.indexOf('getPriceCheckSummary')).toBeLessThan(methods.indexOf('markRead'));
    expect(methods.indexOf('getPriceCheckSummary')).toBeLessThan(methods.indexOf('dismiss'));
  });

  it('scopes every call to req.accountId', async () => {
    await controller.findAll(req, 'true');
    expect(service.findAll).toHaveBeenCalledWith('acc-1', true);
    await controller.markRead(req, 'a-1');
    expect(service.markRead).toHaveBeenCalledWith('acc-1', 'a-1');
    await controller.markAllRead(req);
    expect(service.markAllRead).toHaveBeenCalledWith('acc-1');
    await controller.dismiss(req, 'a-1');
    expect(service.dismiss).toHaveBeenCalledWith('acc-1', 'a-1');
  });

  it('getPriceCheckSummary delegates to the service with the account id and a Jan-1 UTC since-date', async () => {
    const out = await controller.getPriceCheckSummary(req);
    expect(service.getPriceCheckSummary).toHaveBeenCalledTimes(1);
    const [accountId, since] = service.getPriceCheckSummary.mock.calls[0];
    expect(accountId).toBe('acc-1');
    expect(since).toBeInstanceOf(Date);
    expect(since.getUTCMonth()).toBe(0);
    expect(since.getUTCDate()).toBe(1);
    expect(out).toEqual({ totalsByCurrency: {}, alertCount: 0, since: '2026-01-01' });
  });
});
