import { PrismaService } from '../../database/prisma.service';

/**
 * Resolves a shopping list by its server id OR client-generated id — the
 * offline-first mobile client addresses a list by its local id until a pull
 * backfills the server id, so every route that takes a list id must accept
 * either. Shared between `ShoppingListService` and
 * `ShoppingListTemplateService` (the `apply` endpoint needs the exact same
 * resolution `addItem`/`updateList`/`deleteList` already use).
 */
export async function resolveShoppingList(
  prisma: PrismaService,
  accountId: string,
  idOrClientId: string,
) {
  return prisma.shoppingList.findFirst({
    where: { accountId, isDeleted: false, OR: [{ id: idOrClientId }, { clientId: idOrClientId }] },
  });
}
