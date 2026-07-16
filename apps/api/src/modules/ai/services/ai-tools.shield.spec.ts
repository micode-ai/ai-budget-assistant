import { AiToolsService } from './ai-tools.service';

describe('AiToolsService get_inflation_shield', () => {
  it('executes the shield read and returns the response as the tool result', async () => {
    const shield = { getShield: jest.fn().mockResolvedValue({ items: [{ canonicalName: 'Masło' }], savedSoFar: 12, baseCurrency: 'PLN' }) };
    // Only inflationShieldService matters for this action; other deps unused → undefined.
    const svc = new AiToolsService(
      undefined as any, // expensesService
      undefined as any, // incomesService
      undefined as any, // budgetsService
      undefined as any, // categoriesService
      undefined as any, // analyticsService
      undefined as any, // cacheService
      undefined as any, // debtsService
      undefined as any, // goalPlannerService
      undefined as any, // exchangeRateService
      undefined as any, // safeToSpendService
      undefined as any, // shoppingListService
      shield as any, // inflationShieldService
    );
    const res = await (svc as any).executeAction('get_inflation_shield', {}, 'a1', 'u1', 'PLN');
    expect(shield.getShield).toHaveBeenCalledWith('a1', 'u1', 'PLN');
    expect(res.success).toBe(true);
    expect((res.data as any).savedSoFar).toBe(12);
  });
});
