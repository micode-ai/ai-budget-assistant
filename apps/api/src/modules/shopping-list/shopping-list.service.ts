import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { predictRestock } from './restock-predictor';
import type {
  ShoppingList, ShoppingListItem,
  CreateShoppingListDto, UpdateShoppingListDto,
  CreateShoppingListItemDto, UpdateShoppingListItemDto,
  RestockSuggestion,
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
      where: { accountId, isArchived: false, isDeleted: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { items: itemsInclude },
    });
    if (lists.length === 0) {
      const defaultClientId = `default-${accountId}`;
      try {
        // upsert (not create) so an archived/soft-deleted default row is resurrected
        // instead of colliding on the deterministic clientId; catch the concurrent
        // P2002 race outside any transaction and re-fetch (ABA-314/ABA-316 pattern).
        lists = [
          await this.prisma.shoppingList.upsert({
            where: { accountId_clientId: { accountId, clientId: defaultClientId } },
            create: { accountId, clientId: defaultClientId, name: 'My List', isDefault: true, createdByUserId: userId },
            update: { isArchived: false, isDeleted: false },
            include: { items: itemsInclude },
          }),
        ];
      } catch (e) {
        if (!isP2002(e)) throw e;
        const row = await this.prisma.shoppingList.findUnique({
          where: { accountId_clientId: { accountId, clientId: defaultClientId } },
          include: { items: itemsInclude },
        });
        if (row) lists = [row];
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
    return this.prisma.shoppingList.findFirst({
      where: { accountId, isDeleted: false, OR: [{ id: idOrClientId }, { clientId: idOrClientId }] },
    });
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
}
