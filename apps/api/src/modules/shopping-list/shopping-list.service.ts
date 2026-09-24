import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { predictRestock } from './restock-predictor';
import { detectDeals, DealRow } from './deal-detector';
import { normalizeProductName } from '../merchant-rules/product-rules.service';
import { resolveShoppingList, buildGuestListUrl } from './shopping-list.util';
import type {
  ShoppingList, ShoppingListItem,
  CreateShoppingListDto, UpdateShoppingListDto,
  CreateShoppingListItemDto, UpdateShoppingListItemDto,
  RestockSuggestion,
  DealSuggestion,
  ShoppingListGuestLinkResponse,
} from '@budget/shared-types';

function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

function toItem(row: any): ShoppingListItem {
  return {
    id: row.id, shoppingListId: row.shoppingListId, clientId: row.clientId,
    canonicalName: row.canonicalName ?? null, rawLabel: row.rawLabel,
    quantity: Number(row.quantity), note: row.note ?? null,
    isChecked: row.isChecked, addedByUserId: row.addedByUserId, sortOrder: row.sortOrder,
  };
}

function toList(row: any): ShoppingList {
  return {
    id: row.id, accountId: row.accountId, clientId: row.clientId, name: row.name,
    isDefault: row.isDefault, isArchived: row.isArchived, sortOrder: row.sortOrder,
    createdByUserId: row.createdByUserId,
    items: (row.items ?? []).map(toItem),
  };
}

@Injectable()
export class ShoppingListService {
  constructor(private readonly prisma: PrismaService) {}

  async getLists(accountId: string, userId: string): Promise<ShoppingList[]> {
    const itemsInclude = { where: { isDeleted: false }, orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] };
    let lists = await this.prisma.shoppingList.findMany({
      where: { accountId, isDeleted: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { items: itemsInclude },
    });
    // Materialize a default list ONLY for a brand-new account with NO lists at
    // all (onboarding) — NOT when the account merely has zero *non-archived*
    // lists. Archiving your last list is an explicit user action; resurrecting
    // it here (via the un-archiving upsert below) made an archived list pop
    // back with all its items on the next pull (ABA reported: "archive a list,
    // it disappears then comes back"). Returning the archived rows without
    // recreating a default lets the client show an empty "create a list" state.
    if (lists.length === 0) {
      const defaultClientId = `default-${accountId}`;
      try {
        // upsert (not create) so a soft-deleted default row is revived instead
        // of colliding on the deterministic clientId; catch the concurrent
        // P2002 race outside any transaction and re-fetch (ABA-314/ABA-316 pattern).
        const upserted = await this.prisma.shoppingList.upsert({
          where: { accountId_clientId: { accountId, clientId: defaultClientId } },
          create: { accountId, clientId: defaultClientId, name: 'My List', isDefault: true, createdByUserId: userId },
          update: { isArchived: false, isDeleted: false },
          include: { items: itemsInclude },
        });
        lists = [...lists.filter((l) => l.id !== upserted.id), upserted];
      } catch (e) {
        if (!isP2002(e)) throw e;
        const row = await this.prisma.shoppingList.findUnique({
          where: { accountId_clientId: { accountId, clientId: defaultClientId } },
          include: { items: itemsInclude },
        });
        if (row) lists = [...lists.filter((l) => l.id !== row.id), row];
      }
    }
    return lists.map(toList);
  }

  async createList(accountId: string, userId: string, dto: CreateShoppingListDto): Promise<ShoppingList> {
    const existing = await this.prisma.shoppingList.findUnique({
      where: { accountId_clientId: { accountId, clientId: dto.clientId } },
      include: { items: { where: { isDeleted: false } } },
    });
    if (existing) return toList(existing);
    try {
      const created = await this.prisma.shoppingList.create({
        data: { accountId, clientId: dto.clientId, name: dto.name, createdByUserId: userId },
        include: { items: true },
      });
      return toList(created);
    } catch (e) {
      if (isP2002(e)) {
        const row = await this.prisma.shoppingList.findUnique({ where: { accountId_clientId: { accountId, clientId: dto.clientId } }, include: { items: true } });
        if (row) return toList(row);
      }
      throw e;
    }
  }

  private async resolveList(accountId: string, idOrClientId: string) {
    return resolveShoppingList(this.prisma, accountId, idOrClientId);
  }

  private async resolveItem(accountId: string, idOrClientId: string) {
    return this.prisma.shoppingListItem.findFirst({
      where: { accountId, isDeleted: false, OR: [{ id: idOrClientId }, { clientId: idOrClientId }] },
    });
  }

  async updateList(accountId: string, id: string, dto: UpdateShoppingListDto): Promise<ShoppingList> {
    const list = await this.resolveList(accountId, id);
    if (!list) throw new NotFoundException('List not found');
    const updated = await this.prisma.shoppingList.update({
      where: { id: list.id },
      data: { name: dto.name, isArchived: dto.isArchived, sortOrder: dto.sortOrder, syncVersion: { increment: 1 } },
      include: { items: { where: { isDeleted: false } } },
    });
    return toList(updated);
  }

  async deleteList(accountId: string, id: string): Promise<void> {
    const list = await this.resolveList(accountId, id);
    if (!list) throw new NotFoundException('List not found');
    await this.prisma.$transaction([
      this.prisma.shoppingList.update({ where: { id: list.id }, data: { isDeleted: true, syncVersion: { increment: 1 } } }),
      this.prisma.shoppingListItem.updateMany({ where: { accountId, shoppingListId: list.id, isDeleted: false }, data: { isDeleted: true, syncVersion: { increment: 1 } } }),
    ]);
  }

  /**
   * Issues (or returns the already-active) public guest-share token for this
   * list — shopping-list-guest-share-link. Idempotent on purpose: re-tapping
   * "Share" after the link was already sent to someone must not invalidate
   * it, so an existing token is returned as-is rather than rotated. See
   * docs/contracts/shopping-list-guest-share-link.md.
   */
  async createGuestLink(accountId: string, id: string): Promise<ShoppingListGuestLinkResponse> {
    const list = await this.resolveList(accountId, id);
    if (!list) throw new NotFoundException('List not found');
    if (list.guestToken) {
      return { token: list.guestToken, url: buildGuestListUrl(list.guestToken) };
    }
    // 32 hex chars — same shape as ReceiptSplitParticipant.token.
    const token = randomBytes(16).toString('hex');
    await this.prisma.shoppingList.update({ where: { id: list.id }, data: { guestToken: token } });
    return { token, url: buildGuestListUrl(token) };
  }

  /**
   * Revokes this list's active guest link, if any. Safe no-op shape — the
   * mobile client tracks no local "is a link active" state (see the
   * contract's Mobile section), so this is called freely without first
   * checking whether a link exists.
   */
  async revokeGuestLink(accountId: string, id: string): Promise<void> {
    const list = await this.resolveList(accountId, id);
    if (!list) throw new NotFoundException('List not found');
    if (!list.guestToken) return;
    await this.prisma.shoppingList.update({ where: { id: list.id }, data: { guestToken: null } });
  }

  async addItem(accountId: string, userId: string, listId: string, dto: CreateShoppingListItemDto): Promise<ShoppingListItem> {
    const list = await this.resolveList(accountId, listId);
    if (!list) throw new NotFoundException('List not found');
    const existing = await this.prisma.shoppingListItem.findUnique({ where: { accountId_clientId: { accountId, clientId: dto.clientId } } });
    if (existing) {
      if (existing.isDeleted) {
        const revived = await this.prisma.shoppingListItem.update({ where: { id: existing.id }, data: { isDeleted: false, syncVersion: { increment: 1 } } });
        return toItem(revived);
      }
      return toItem(existing);
    }
    try {
      const created = await this.prisma.shoppingListItem.create({
        data: {
          accountId, shoppingListId: list.id, clientId: dto.clientId,
          canonicalName: dto.canonicalName ?? null, rawLabel: dto.rawLabel,
          quantity: dto.quantity ?? 1, note: dto.note ?? null, addedByUserId: userId,
        },
      });
      return toItem(created);
    } catch (e) {
      if (isP2002(e)) {
        const row = await this.prisma.shoppingListItem.findUnique({ where: { accountId_clientId: { accountId, clientId: dto.clientId } } });
        if (row) return toItem(row);
      }
      throw e;
    }
  }

  /**
   * Add free-text items to the account's active/default shopping list, used by
   * the AI chat `add_to_shopping_list` tool. Resolves the first non-archived
   * list, or revives/creates the deterministic default when none exist (so
   * asking the AI to add an item still works after the user archived every
   * list). Each item gets a fresh server-generated clientId — the offline-first
   * clients adopt these rows on their next pull, keyed by clientId.
   */
  async addItemsByName(
    accountId: string,
    userId: string,
    names: string[],
  ): Promise<{ listId: string; listName: string; addedLabels: string[] }> {
    const cleaned = names
      .map((n) => (typeof n === 'string' ? n.trim() : ''))
      .filter((n) => n.length > 0)
      .map((n) => n.slice(0, 120));
    if (cleaned.length === 0) {
      throw new NotFoundException('No items to add');
    }
    const list = await this.resolveOrCreateDefaultForAdd(accountId, userId);
    const addedLabels: string[] = [];
    for (const rawLabel of cleaned) {
      await this.prisma.shoppingListItem.create({
        data: {
          accountId,
          shoppingListId: list.id,
          clientId: randomUUID(),
          canonicalName: null,
          rawLabel,
          quantity: 1,
          addedByUserId: userId,
        },
      });
      addedLabels.push(rawLabel);
    }
    return { listId: list.id, listName: list.name, addedLabels };
  }

  /**
   * Remove free-text items from the account's shopping list(s), used by the AI
   * chat `remove_from_shopping_list` tool. Matches UNCHECKED, non-deleted items
   * across ALL non-archived lists, case-insensitive against `rawLabel`
   * (fallback `canonicalName`). First match per requested name is soft-deleted
   * (same isDeleted/syncVersion convention as `deleteItem`). Names with no
   * match are reported, never thrown as an error. Unlike `addItemsByName`,
   * this never creates a list — a zero-list account simply yields every name
   * in `notFoundLabels`.
   */
  async removeItemsByName(
    accountId: string,
    names: string[],
  ): Promise<{ removedLabels: string[]; notFoundLabels: string[] }> {
    const cleaned = names
      .map((n) => (typeof n === 'string' ? n.trim() : ''))
      .filter((n) => n.length > 0)
      .map((n) => n.slice(0, 120));
    if (cleaned.length === 0) {
      return { removedLabels: [], notFoundLabels: [] };
    }

    const candidates: Array<{ id: string; rawLabel: string; canonicalName: string | null }> =
      await this.prisma.shoppingListItem.findMany({
        where: {
          accountId,
          isDeleted: false,
          isChecked: false,
          shoppingList: { isArchived: false, isDeleted: false },
        },
        select: { id: true, rawLabel: true, canonicalName: true },
      });

    const consumed = new Set<string>();
    const removedLabels: string[] = [];
    const notFoundLabels: string[] = [];

    for (const name of cleaned) {
      const needle = name.toLowerCase();
      const match = candidates.find((it) =>
        !consumed.has(it.id) &&
        (it.rawLabel.toLowerCase() === needle || (it.canonicalName ?? '').toLowerCase() === needle),
      );
      if (!match) {
        notFoundLabels.push(name);
        continue;
      }
      consumed.add(match.id);
      await this.prisma.shoppingListItem.update({
        where: { id: match.id },
        data: { isDeleted: true, syncVersion: { increment: 1 } },
      });
      removedLabels.push(name);
    }

    return { removedLabels, notFoundLabels };
  }

  /**
   * Auto-check-off matching shopping-list items when a receipt is confirmed
   * via a bot (Telegram/WhatsApp/Slack) — the server-side counterpart of the
   * mobile app's own client-side `matchReceiptToShoppingList`
   * (`apps/mobile/src/features/shopping-list/receiptReconciliation.ts`).
   *
   * Deliberately NOT wired into `ExpensesService.create()` / the generic
   * post-create hook chain — see the plan's "Decision" section
   * (docs/plans/bot-receipt-shopping-list-reconciliation-plan.md) for why.
   * Each bot's `PhotoHandler.handleReceiptAddCallback` calls this directly,
   * awaited, right after `expensesService.create()` succeeds, so it can
   * report what got checked off in the SAME confirmation message.
   *
   * Same conservative match as the mobile client: EXACT match, after
   * `normalizeProductName` (the same normalization
   * `product_category_rules` is keyed on), against UNCHECKED items on
   * non-archived, non-deleted lists — never fuzzy/substring. A
   * false-positive auto-check (marking something bought that wasn't) is
   * worse than a missed one.
   *
   * Alias-aware (shopping-list-alias-aware-reconciliation): a receipt
   * line's `canonicalName` is resolved through the account's
   * `ProductAlias` table (rawName -> canonicalName) before matching —
   * mirroring the identical resolution `getRestockSuggestions`/`getDeals`
   * below already apply. OCR invents a fresh `canonicalName` per scan, so
   * without this, renaming/merging a product in Settings -> Products
   * (Personal Inflation Index) would silently break auto-check-off for
   * exactly that product on every later receipt. The item side of the
   * match needs no resolution — every write path that sets a non-null
   * `shoppingListItem.canonicalName` already stores the alias-resolved
   * name (see the contract). A line whose resolved name is the
   * `'__ignored__'` sentinel (the product was explicitly ignored in Price
   * History) contributes no match key at all, same as the two sibling
   * methods. See `docs/contracts/shopping-list-alias-aware-reconciliation.md`.
   */
  async reconcileWithReceipt(
    accountId: string,
    lines: Array<{ description?: string | null; canonicalName?: string | null }>,
  ): Promise<{ checkedLabels: string[] }> {
    // Collect each line's raw canonical name (if any) + fallback description
    // BEFORE touching the DB — a receipt with no usable line labels at all
    // (a non-receipt manual/voice expense) must short-circuit with zero DB
    // reads, same as before alias resolution was added.
    const rawLines = (lines ?? [])
      .map((line) => ({
        rawCanonical: line.canonicalName?.trim() || undefined,
        description: line.description?.trim() || '',
      }))
      .filter((line) => !!(line.rawCanonical || line.description));
    if (rawLines.length === 0) return { checkedLabels: [] };

    const aliases: Array<{ rawName: string; canonicalName: string }> =
      await (this.prisma as any).productAlias.findMany({
        where: { accountId },
        select: { rawName: true, canonicalName: true },
      });
    const aliasMap = new Map(aliases.map((a) => [a.rawName, a.canonicalName]));

    const receiptKeys = new Set<string>();
    for (const line of rawLines) {
      const resolved = line.rawCanonical ? aliasMap.get(line.rawCanonical) ?? line.rawCanonical : undefined;
      if (resolved === '__ignored__') continue;
      const label = resolved || line.description;
      const key = normalizeProductName(label);
      if (key) receiptKeys.add(key);
    }
    if (receiptKeys.size === 0) return { checkedLabels: [] };

    const candidates: Array<{ id: string; rawLabel: string; canonicalName: string | null }> =
      await this.prisma.shoppingListItem.findMany({
        where: {
          accountId,
          isDeleted: false,
          isChecked: false,
          shoppingList: { isArchived: false, isDeleted: false },
        },
        select: { id: true, rawLabel: true, canonicalName: true },
      });

    const matched = candidates.filter((it) => {
      const label = it.canonicalName?.trim() || it.rawLabel?.trim() || '';
      const key = normalizeProductName(label);
      return key.length > 0 && receiptKeys.has(key);
    });
    if (matched.length === 0) return { checkedLabels: [] };

    await this.prisma.shoppingListItem.updateMany({
      where: { id: { in: matched.map((m) => m.id) } },
      data: { isChecked: true, syncVersion: { increment: 1 } },
    });

    return { checkedLabels: matched.map((m) => m.rawLabel) };
  }

  private async resolveOrCreateDefaultForAdd(accountId: string, userId: string) {
    const existing = await this.prisma.shoppingList.findFirst({
      where: { accountId, isDeleted: false, isArchived: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (existing) return existing;
    const defaultClientId = `default-${accountId}`;
    try {
      return await this.prisma.shoppingList.upsert({
        where: { accountId_clientId: { accountId, clientId: defaultClientId } },
        create: { accountId, clientId: defaultClientId, name: 'My List', isDefault: true, createdByUserId: userId },
        update: { isArchived: false, isDeleted: false },
      });
    } catch (e) {
      if (!isP2002(e)) throw e;
      const row = await this.prisma.shoppingList.findUnique({
        where: { accountId_clientId: { accountId, clientId: defaultClientId } },
      });
      if (row) return row;
      throw e;
    }
  }

  async updateItem(accountId: string, itemId: string, dto: UpdateShoppingListItemDto): Promise<ShoppingListItem> {
    const item = await this.resolveItem(accountId, itemId);
    if (!item) throw new NotFoundException('Item not found');
    const updated = await this.prisma.shoppingListItem.update({
      where: { id: item.id },
      data: {
        isChecked: dto.isChecked, quantity: dto.quantity, rawLabel: dto.rawLabel,
        note: dto.note, sortOrder: dto.sortOrder, syncVersion: { increment: 1 },
      },
    });
    return toItem(updated);
  }

  async deleteItem(accountId: string, itemId: string): Promise<void> {
    const item = await this.resolveItem(accountId, itemId);
    if (!item) throw new NotFoundException('Item not found');
    await this.prisma.shoppingListItem.update({ where: { id: item.id }, data: { isDeleted: true, syncVersion: { increment: 1 } } });
  }

  async clearChecked(accountId: string, listId: string): Promise<{ cleared: number }> {
    const list = await this.resolveList(accountId, listId);
    if (!list) return { cleared: 0 };
    const res = await this.prisma.shoppingListItem.updateMany({
      where: { accountId, shoppingListId: list.id, isChecked: true, isDeleted: false },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    return { cleared: res.count };
  }

  async getRestockSuggestions(accountId: string): Promise<RestockSuggestion[]> {
    // Alias resolution (mirror price-history: alias.canonicalName overrides item.canonicalName)
    const aliases: Array<{ rawName: string; canonicalName: string }> =
      await (this.prisma as any).productAlias.findMany({ where: { accountId }, select: { rawName: true, canonicalName: true } });
    const aliasMap = new Map(aliases.map((a) => [a.rawName, a.canonicalName]));

    const items: Array<{ canonicalName: string; expense: { date: Date } }> =
      await (this.prisma as any).expenseItem.findMany({
        where: { expense: { accountId, isDeleted: false }, canonicalName: { not: null }, isDeleted: false },
        select: { canonicalName: true, expense: { select: { date: true } } },
      });

    const byProduct = new Map<string, Date[]>();
    for (const it of items) {
      const resolved = aliasMap.get(it.canonicalName) ?? it.canonicalName;
      if (resolved === '__ignored__') continue;
      const arr = byProduct.get(resolved) ?? [];
      arr.push(it.expense.date);
      byProduct.set(resolved, arr);
    }

    // Exclude products already present as a non-deleted item on any list in this account
    const onList: Array<{ canonicalName: string | null }> = await this.prisma.shoppingListItem.findMany({
      where: { accountId, isDeleted: false, canonicalName: { not: null } },
      select: { canonicalName: true },
    });
    const listed = new Set(onList.map((i) => i.canonicalName));

    return predictRestock(byProduct)
      .filter((s) => s.dueInDays <= 0 && !listed.has(s.canonicalName));
  }

  async getDeals(accountId: string): Promise<DealSuggestion[]> {
    const aliases: Array<{ rawName: string; canonicalName: string }> =
      await (this.prisma as any).productAlias.findMany({ where: { accountId }, select: { rawName: true, canonicalName: true } });
    const aliasMap = new Map(aliases.map((a) => [a.rawName, a.canonicalName]));

    const items: Array<{ canonicalName: string; unitPrice: number; quantity: number; totalPrice: number; expense: { date: Date; merchant: string | null; currencyCode: string } }> =
      await (this.prisma as any).expenseItem.findMany({
        where: { expense: { accountId, isDeleted: false }, canonicalName: { not: null }, isDeleted: false },
        select: { canonicalName: true, unitPrice: true, quantity: true, totalPrice: true, expense: { select: { date: true, merchant: true, currencyCode: true } } },
      });

    const rows: DealRow[] = [];
    for (const it of items) {
      const resolved = aliasMap.get(it.canonicalName) ?? it.canonicalName;
      if (resolved === '__ignored__') continue;
      const q = Number(it.quantity);
      rows.push({
        resolvedName: resolved,
        date: it.expense.date,
        unitPrice: q > 1 ? Number(it.totalPrice) / q : Number(it.unitPrice),
        merchant: it.expense.merchant ?? 'Unknown',
        currency: it.expense.currencyCode ?? 'PLN',
      });
    }
    // Exclude products already present as a non-deleted item on any list in this account
    const onList: Array<{ canonicalName: string | null }> = await this.prisma.shoppingListItem.findMany({
      where: { accountId, isDeleted: false, canonicalName: { not: null } },
      select: { canonicalName: true },
    });
    const listed = new Set(onList.map((i) => i.canonicalName));

    return detectDeals(rows).filter((deal) => !listed.has(deal.canonicalName));
  }
}
