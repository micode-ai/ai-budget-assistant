import { AdminController } from './admin.controller';

describe('AdminController investor metrics', () => {
  it('parses and clamps query params, delegates to the service', async () => {
    const investor = { getInvestorMetrics: jest.fn().mockResolvedValue({ ok: true }) } as any;
    const ctrl = new AdminController({} as any, {} as any, {} as any, {} as any, investor);
    const res = await ctrl.getInvestorMetrics('99', '99', '99'); // over clamp
    expect(investor.getInvestorMetrics).toHaveBeenCalledWith({ months: 24, weeks: 26, activationDays: 30 });
    expect(res).toEqual({ ok: true });
  });

  it('applies defaults when params are missing', async () => {
    const investor = { getInvestorMetrics: jest.fn().mockResolvedValue({}) } as any;
    const ctrl = new AdminController({} as any, {} as any, {} as any, {} as any, investor);
    await ctrl.getInvestorMetrics(undefined, undefined, undefined);
    expect(investor.getInvestorMetrics).toHaveBeenCalledWith({ months: 6, weeks: 12, activationDays: 3 });
  });
});
