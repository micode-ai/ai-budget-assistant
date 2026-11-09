import { AdminController } from './admin.controller';

describe('AdminController investor metrics', () => {
  it('parses and clamps query params, delegates to the service', async () => {
    const investor = { getInvestorMetrics: jest.fn().mockResolvedValue({ ok: true }) } as any;
    const ctrl = new AdminController({} as any, {} as any, {} as any, {} as any, investor, {} as any, {} as any);
    const res = await ctrl.getInvestorMetrics('99', '99', '99'); // over clamp
    expect(investor.getInvestorMetrics).toHaveBeenCalledWith({ months: 24, weeks: 26, activationDays: 30 });
    expect(res).toEqual({ ok: true });
  });

  it('applies defaults when params are missing', async () => {
    const investor = { getInvestorMetrics: jest.fn().mockResolvedValue({}) } as any;
    const ctrl = new AdminController({} as any, {} as any, {} as any, {} as any, investor, {} as any, {} as any);
    await ctrl.getInvestorMetrics(undefined, undefined, undefined);
    expect(investor.getInvestorMetrics).toHaveBeenCalledWith({ months: 6, weeks: 12, activationDays: 3 });
  });
});

describe('AdminController activation report (ABA-731)', () => {
  const make = () => {
    const activation = { getReport: jest.fn().mockResolvedValue({ ok: true }) } as any;
    const ctrl = new AdminController({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, activation);
    return { ctrl, activation };
  };

  it('defaults to 26 weeks with internal accounts excluded', async () => {
    const { ctrl, activation } = make();
    await ctrl.getActivationReport(undefined, undefined);
    expect(activation.getReport).toHaveBeenCalledWith({ weeks: 26, includeInternal: false });
  });

  it('clamps weeks and only includes internal accounts on an explicit true', async () => {
    const { ctrl, activation } = make();
    await ctrl.getActivationReport('999', 'true');
    expect(activation.getReport).toHaveBeenLastCalledWith({ weeks: 104, includeInternal: true });
    await ctrl.getActivationReport('1', 'yes');
    expect(activation.getReport).toHaveBeenLastCalledWith({ weeks: 4, includeInternal: false });
  });
});
