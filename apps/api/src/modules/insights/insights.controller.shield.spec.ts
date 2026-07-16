import { InsightsController } from './insights.controller';

describe('InsightsController — inflation-shield route', () => {
  it('passes accountId, userId and display currency to the service', async () => {
    const shield = { getShield: jest.fn().mockResolvedValue({ items: [], baseCurrency: 'PLN' }) };
    // Only the shield dependency matters for this route; others can be undefined.
    const ctrl = new InsightsController(
      undefined as any, undefined as any, undefined as any,
      undefined as any, undefined as any, undefined as any, shield as any,
    );
    const req: any = { accountId: 'a1', user: { id: 'u1', currencyCode: 'PLN' } };
    const res = await ctrl.getInflationShield(req);
    expect(shield.getShield).toHaveBeenCalledWith('a1', 'u1', 'PLN');
    expect(res.baseCurrency).toBe('PLN');
  });
});
