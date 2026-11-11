import type { PrismaService } from '../../database/prisma.service';
import type { PriceHistoryService } from '../price-history/price-history.service';
import { buildUsualBasket, type BasketProduct } from './leaflet-basket.util';

export type BasketRow = { resolvedName: string; date: Date; unitPrice: number; currency: string };

/**
 * One account's usual basket plus the price rows behind it — the leaflet read and the community
 * push both compare against this, so they load it the same way: receipt line items (resolved
 * names) and the unchecked shopping-list items that carry a `canonicalName`.
 */
export async function loadUsualBasket(
  prisma: PrismaService,
  priceHistory: PriceHistoryService,
  accountId: string,
  now: Date,
): Promise<{ basket: BasketProduct[]; rows: BasketRow[] }> {
  const [rows, listItems] = await Promise.all([
    priceHistory.getBasketRows(accountId),
    prisma.shoppingListItem.findMany({
      where: {
        accountId,
        isChecked: false,
        isDeleted: false,
        canonicalName: { not: null },
        shoppingList: { isDeleted: false, isArchived: false },
      },
      select: { canonicalName: true },
    }),
  ]);
  const listNames = listItems.map((i) => i.canonicalName).filter((n): n is string => !!n);
  return { basket: buildUsualBasket(rows, listNames, now), rows };
}
