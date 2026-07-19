import { AiToolsService } from './ai-tools.service';

function buildService(shoppingListService: any) {
  return new AiToolsService(
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
    shoppingListService as any,
    undefined as any, // inflationShieldService
  );
}

describe('AiToolsService remove_from_shopping_list / get_shopping_suggestions', () => {
  it('registers both new tool schemas', () => {
    const svc = buildService({});
    const names = svc.getToolDefinitions().map((t) => t.function.name);
    expect(names).toContain('remove_from_shopping_list');
    expect(names).toContain('get_shopping_suggestions');
  });

  it('does NOT treat either new action as a write action requiring confirmation', () => {
    const svc = buildService({});
    expect(svc.isWriteAction('remove_from_shopping_list')).toBe(false);
    expect(svc.isWriteAction('get_shopping_suggestions')).toBe(false);
  });

  it('executeAction dispatches remove_from_shopping_list to the service and returns removedLabels/notFoundLabels', async () => {
    const shoppingListService = {
      removeItemsByName: jest.fn().mockResolvedValue({ removedLabels: ['Milk'], notFoundLabels: ['Eggs'] }),
    };
    const svc = buildService(shoppingListService);
    const res = await svc.executeAction('remove_from_shopping_list', { items: ['Milk', 'Eggs'] }, 'a1', 'u1');
    expect(shoppingListService.removeItemsByName).toHaveBeenCalledWith('a1', ['Milk', 'Eggs']);
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ removedLabels: ['Milk'], notFoundLabels: ['Eggs'] });
  });

  it('executeAction returns success:false with "No items to remove" when items is empty', async () => {
    const shoppingListService = { removeItemsByName: jest.fn() };
    const svc = buildService(shoppingListService);
    const res = await svc.executeAction('remove_from_shopping_list', { items: [] }, 'a1', 'u1');
    expect(res.success).toBe(false);
    expect(res.errorMessage).toBe('No items to remove');
    expect(shoppingListService.removeItemsByName).not.toHaveBeenCalled();
  });

  it('executeAction returns success:false when items is missing entirely', async () => {
    const shoppingListService = { removeItemsByName: jest.fn() };
    const svc = buildService(shoppingListService);
    const res = await svc.executeAction('remove_from_shopping_list', {}, 'a1', 'u1');
    expect(res.success).toBe(false);
    expect(res.errorMessage).toBe('No items to remove');
  });

  it('executeAction dispatches get_shopping_suggestions and caps each list at 5', async () => {
    const restock = Array.from({ length: 8 }, (_, i) => ({ canonicalName: `P${i}`, lastPurchase: '2026-07-01', medianGapDays: 7, dueInDays: -1, purchaseCount: 3 }));
    const deals = Array.from({ length: 7 }, (_, i) => ({ canonicalName: `D${i}`, merchant: 'Lidl', price: 1, avgPrice: 2, dropPct: 50, currency: 'PLN' }));
    const shoppingListService = {
      getRestockSuggestions: jest.fn().mockResolvedValue(restock),
      getDeals: jest.fn().mockResolvedValue(deals),
    };
    const svc = buildService(shoppingListService);
    const res = await svc.executeAction('get_shopping_suggestions', {}, 'a1', 'u1');
    expect(shoppingListService.getRestockSuggestions).toHaveBeenCalledWith('a1');
    expect(shoppingListService.getDeals).toHaveBeenCalledWith('a1');
    expect(res.success).toBe(true);
    expect((res.data as any).restock).toHaveLength(5);
    expect((res.data as any).deals).toHaveLength(5);
  });
});
