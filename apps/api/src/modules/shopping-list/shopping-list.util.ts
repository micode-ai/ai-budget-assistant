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

// Same base + env var as ReceiptSplitService.buildGuestUrl
// (modules/receipt-split/receipt-split.service.ts) — deliberately not
// imported from there, since the two guest surfaces are unrelated features
// and this is a one-line formula, not worth coupling them for.
const GUEST_LINK_BASE = process.env.APP_PUBLIC_URL || 'https://api.ai-budget.pl';

/** Public guest-page URL for a shopping-list share token (shopping-list-guest-share-link). */
export function buildGuestListUrl(token: string): string {
  return `${GUEST_LINK_BASE}/sl/${token}`;
}
