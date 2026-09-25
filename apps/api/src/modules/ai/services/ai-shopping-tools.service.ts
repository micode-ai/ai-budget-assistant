import { Injectable } from '@nestjs/common';
import { ShoppingListService } from '../../shopping-list/shopping-list.service';
import { InflationShieldService } from '../../insights/inflation-shield.service';
import type { ChatActionResult } from '@budget/shared-types';

/**
 * The shopping-list/inflation-shield chat tools: add_to_shopping_list,
 * remove_from_shopping_list, get_shopping_suggestions, get_inflation_shield.
 * Extracted from AiToolsService (tech-debt ai-tools-service-god-file) — see
 * AiToolsService.executeAction for the dispatch switch that calls into this class.
 */
@Injectable()
export class AiShoppingToolsService {
  constructor(
    private readonly shoppingListService: ShoppingListService,
    private readonly inflationShieldService: InflationShieldService,
  ) {}

  async executeAddToShoppingList(
    data: Record<string, unknown>,
    accountId: string,
    userId: string,
  ): Promise<ChatActionResult> {
    // Accept both `items: string[]` (the schema) and a lone `item: string`
    // (some models emit the singular form) — normalize to a string array.
    const raw = Array.isArray(data.items)
      ? data.items
      : data.item != null
        ? [data.item]
        : [];
    const names = raw.map((x) => String(x));
    if (names.filter((n) => n.trim().length > 0).length === 0) {
      return { actionType: 'add_to_shopping_list', success: false, errorMessage: 'No items to add' };
    }
    const { listName, addedLabels } = await this.shoppingListService.addItemsByName(accountId, userId, names);
    return {
      actionType: 'add_to_shopping_list',
      success: true,
      data: { listName, items: addedLabels, count: addedLabels.length },
    };
  }

  async executeRemoveFromShoppingList(
    data: Record<string, unknown>,
    accountId: string,
  ): Promise<ChatActionResult> {
    // Accept both `items: string[]` (the schema) and a lone `item: string`
    // (some models emit the singular form) — normalize to a string array,
    // mirroring executeAddToShoppingList.
    const raw = Array.isArray(data.items)
      ? data.items
      : data.item != null
        ? [data.item]
        : [];
    const names = raw.map((x) => String(x));
    if (names.filter((n) => n.trim().length > 0).length === 0) {
      return { actionType: 'remove_from_shopping_list', success: false, errorMessage: 'No items to remove' };
    }
    const { removedLabels, notFoundLabels } = await this.shoppingListService.removeItemsByName(accountId, names);
    return {
      actionType: 'remove_from_shopping_list',
      success: true,
      data: { removedLabels, notFoundLabels },
    };
  }

  /**
   * READ action: what the user is running low on (restock) + current deals on
   * their regular purchases. Executes immediately via executeWithCache (same
   * treatment as get_inflation_shield), never a confirmation. Capped at the
   * top 5 of each list — mirrors the mobile card's display limit.
   */
  async executeGetShoppingSuggestions(accountId: string): Promise<ChatActionResult> {
    const [restock, deals] = await Promise.all([
      this.shoppingListService.getRestockSuggestions(accountId),
      this.shoppingListService.getDeals(accountId),
    ]);
    return {
      actionType: 'get_shopping_suggestions',
      success: true,
      data: {
        restock: restock.slice(0, 5),
        deals: deals.slice(0, 5),
      },
    };
  }

  async executeGetInflationShield(
    accountId: string,
    userId: string,
    baseCurrency?: string,
  ): Promise<ChatActionResult> {
    const shield = await this.inflationShieldService.getShield(accountId, userId, baseCurrency || 'USD');
    return { actionType: 'get_inflation_shield', success: true, data: shield as unknown as Record<string, unknown> };
  }
}
