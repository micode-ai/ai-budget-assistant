import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  ShoppingList, ShoppingListItem,
  CreateShoppingListDto, UpdateShoppingListDto,
  CreateShoppingListItemDto, UpdateShoppingListItemDto,
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
      const created = await this.prisma.shoppingList.create({
        data: { accountId, clientId: `default-${accountId}`, name: 'My List', isDefault: true, createdByUserId: userId },
        include: { items: itemsInclude },
      });
      lists = [created];
    }
    return lists.map(toList);
  }

  async createList(accountId: string, userId: string, dto: CreateShoppingListDto): Promise<ShoppingList> {
    const existing = await this.prisma.shoppingList.findUnique({ where: { accountId_clientId: { accountId, clientId: dto.clientId } } });
    if (existing) return toList({ ...existing, items: [] });
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

  async updateList(accountId: string, id: string, dto: UpdateShoppingListDto): Promise<ShoppingList> {
    const list = await this.prisma.shoppingList.findFirst({ where: { id, accountId, isDeleted: false } });
    if (!list) throw new NotFoundException('List not found');
    const updated = await this.prisma.shoppingList.update({
      where: { id },
      data: { name: dto.name, isArchived: dto.isArchived, sortOrder: dto.sortOrder, syncVersion: { increment: 1 } },
      include: { items: { where: { isDeleted: false } } },
    });
    return toList(updated);
  }

  async deleteList(accountId: string, id: string): Promise<void> {
    const list = await this.prisma.shoppingList.findFirst({ where: { id, accountId, isDeleted: false } });
    if (!list) throw new NotFoundException('List not found');
    await this.prisma.$transaction([
      this.prisma.shoppingList.update({ where: { id }, data: { isDeleted: true, syncVersion: { increment: 1 } } }),
      this.prisma.shoppingListItem.updateMany({ where: { accountId, shoppingListId: id, isDeleted: false }, data: { isDeleted: true, syncVersion: { increment: 1 } } }),
    ]);
  }

  async addItem(accountId: string, userId: string, listId: string, dto: CreateShoppingListItemDto): Promise<ShoppingListItem> {
    const list = await this.prisma.shoppingList.findFirst({ where: { id: listId, accountId, isDeleted: false } });
    if (!list) throw new NotFoundException('List not found');
    const existing = await this.prisma.shoppingListItem.findUnique({ where: { accountId_clientId: { accountId, clientId: dto.clientId } } });
    if (existing) return toItem(existing);
    try {
      const created = await this.prisma.shoppingListItem.create({
        data: {
          accountId, shoppingListId: listId, clientId: dto.clientId,
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
    const item = await this.prisma.shoppingListItem.findFirst({ where: { id: itemId, accountId, isDeleted: false } });
    if (!item) throw new NotFoundException('Item not found');
    const updated = await this.prisma.shoppingListItem.update({
      where: { id: itemId },
      data: {
        isChecked: dto.isChecked, quantity: dto.quantity, rawLabel: dto.rawLabel,
        note: dto.note, sortOrder: dto.sortOrder, syncVersion: { increment: 1 },
      },
    });
    return toItem(updated);
  }

  async deleteItem(accountId: string, itemId: string): Promise<void> {
    const item = await this.prisma.shoppingListItem.findFirst({ where: { id: itemId, accountId, isDeleted: false } });
    if (!item) throw new NotFoundException('Item not found');
    await this.prisma.shoppingListItem.update({ where: { id: itemId }, data: { isDeleted: true, syncVersion: { increment: 1 } } });
  }

  async clearChecked(accountId: string, listId: string): Promise<{ cleared: number }> {
    const res = await this.prisma.shoppingListItem.updateMany({
      where: { accountId, shoppingListId: listId, isChecked: true, isDeleted: false },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    return { cleared: res.count };
  }
}
