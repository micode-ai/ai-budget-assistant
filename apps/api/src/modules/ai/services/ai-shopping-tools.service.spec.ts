import { AiShoppingToolsService } from './ai-shopping-tools.service';

/**
 * Split off AiToolsService (tech-debt ai-tools-service-god-file) — was
 * ai-tools.shopping.spec.ts + ai-tools.shield.spec.ts (both owned by
 * AiShoppingToolsService). The schema-registration / isWriteAction checks
 * moved to ai-tools.service.spec.ts since this provider has no schema surface.
 */
function buildService(shoppingListService: any, inflationShieldService: any = undefined) {
  return new AiShoppingToolsService(
    shoppingListService as any,
    inflationShieldService as any,
  );
}

describe('AiShoppingToolsService.executeRemoveFromShoppingList / executeGetShoppingSuggestions', () => {
  it('dispatches remove_from_shopping_list to the service and returns removedLabels/notFoundLabels', async () => {
    const shoppingListService = {
      removeItemsByName: jest.fn().mockResolvedValue({ removedLabels: ['Milk'], notFoundLabels: ['Eggs'] }),
    };
    const svc = buildService(shoppingListService);
    const res = await svc.executeRemoveFromShoppingList({ items: ['Milk', 'Eggs'] }, 'a1');
    expect(shoppingListService.removeItemsByName).toHaveBeenCalledWith('a1', ['Milk', 'Eggs']);
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ removedLabels: ['Milk'], notFoundLabels: ['Eggs'] });
  });

  it('returns success:false with "No items to remove" when items is empty', async () => {
    const shoppingListService = { removeItemsByName: jest.fn() };
    const svc = buildService(shoppingListService);
    const res = await svc.executeRemoveFromShoppingList({ items: [] }, 'a1');
    expect(res.success).toBe(false);
    expect(res.errorMessage).toBe('No items to remove');
    expect(shoppingListService.removeItemsByName).not.toHaveBeenCalled();
  });

  it('returns success:false when items is missing entirely', async () => {
    const shoppingListService = { removeItemsByName: jest.fn() };
    const svc = buildService(shoppingListService);
    const res = await svc.executeRemoveFromShoppingList({}, 'a1');
    expect(res.success).toBe(false);
    expect(res.errorMessage).toBe('No items to remove');
  });

  it('dispatches get_shopping_suggestions and caps each list at 5', async () => {
    const restock = Array.from({ length: 8 }, (_, i) => ({ canonicalName: `P${i}`, lastPurchase: '2026-07-01', medianGapDays: 7, dueInDays: -1, purchaseCount: 3 }));
    const deals = Array.from({ length: 7 }, (_, i) => ({ canonicalName: `D${i}`, merchant: 'Lidl', price: 1, avgPrice: 2, dropPct: 50, currency: 'PLN' }));
    const shoppingListService = {
      getRestockSuggestions: jest.fn().mockResolvedValue(restock),
      getDeals: jest.fn().mockResolvedValue(deals),
    };
    const svc = buildService(shoppingListService);
    const res = await svc.executeGetShoppingSuggestions('a1');
    expect(shoppingListService.getRestockSuggestions).toHaveBeenCalledWith('a1');
    expect(shoppingListService.getDeals).toHaveBeenCalledWith('a1');
    expect(res.success).toBe(true);
    expect((res.data as any).restock).toHaveLength(5);
    expect((res.data as any).deals).toHaveLength(5);
  });
});

describe('AiShoppingToolsService.executeGetInflationShield', () => {
  it('executes the shield read and returns the response as the tool result', async () => {
    const shield = { getShield: jest.fn().mockResolvedValue({ items: [{ canonicalName: 'Masło' }], savedSoFar: 12, baseCurrency: 'PLN' }) };
    const svc = buildService(undefined, shield);
    const res = await svc.executeGetInflationShield('a1', 'u1', 'PLN');
    expect(shield.getShield).toHaveBeenCalledWith('a1', 'u1', 'PLN');
    expect(res.success).toBe(true);
    expect((res.data as any).savedSoFar).toBe(12);
  });
});
