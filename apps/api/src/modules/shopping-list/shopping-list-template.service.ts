import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { normalizeProductName } from '../merchant-rules/product-rules.service';
import { resolveShoppingList } from './shopping-list.util';
import type {
  ShoppingListTemplate,
  ShoppingListTemplateItem,
  CreateShoppingListTemplateDto,
  UpdateShoppingListTemplateDto,
  ApplyShoppingListTemplateResponse,
} from '@budget/shared-types';

/** Sanity bounds — this is a free, ungated feature; these exist only to
 * keep the templates picker usable, not to monetize. See
 * docs/contracts/shopping-list-templates.md. */
export const MAX_SHOPPING_LIST_TEMPLATES = 20;

function toTemplateItem(row: any): ShoppingListTemplateItem {
  return {
    id: row.id,
    templateId: row.templateId,
    canonicalName: row.canonicalName ?? null,
    rawLabel: row.rawLabel,
    sortOrder: row.sortOrder,
  };
}

function toTemplate(row: any): ShoppingListTemplate {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    sortOrder: row.sortOrder,
    createdByUserId: row.createdByUserId,
    items: (row.items ?? []).map(toTemplateItem),
  };
}

/**
 * "My weekly staples" — save a named, ordered set of item labels and
 * re-apply (merge) them into any list in one tap.
 *
 * Deliberately a SIBLING of `ShoppingListService`, not a method added to
 * it — this codebase has hit the "regrowth after split" tech-debt pattern
 * before (expenses.service.ts, import-bank.service.ts) from exactly this
 * shape of "just add one more method" growth. `resolveShoppingList` is
 * shared via `shopping-list.util.ts` rather than injecting the sibling
 * service, since it's a single stateless query.
 */
@Injectable()
export class ShoppingListTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async list(accountId: string): Promise<ShoppingListTemplate[]> {
    const rows = await (this.prisma as any).shoppingListTemplate.findMany({
      where: { accountId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    return rows.map(toTemplate);
  }

  async create(
    accountId: string,
    userId: string,
    dto: CreateShoppingListTemplateDto,
  ): Promise<ShoppingListTemplate> {
    const count = await (this.prisma as any).shoppingListTemplate.count({ where: { accountId } });
    if (count >= MAX_SHOPPING_LIST_TEMPLATES) {
      throw new BadRequestException(
        `You can save at most ${MAX_SHOPPING_LIST_TEMPLATES} templates`,
      );
    }

    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Template name is required');

    const cleanedItems = (dto.items ?? [])
      .map((it) => ({
        rawLabel: (it.rawLabel ?? '').trim().slice(0, 120),
        canonicalName: it.canonicalName?.trim() || null,
      }))
      .filter((it) => it.rawLabel.length > 0);
    if (cleanedItems.length === 0) {
      throw new BadRequestException('A template needs at least one item');
    }

    const created = await (this.prisma as any).shoppingListTemplate.create({
      data: {
        accountId,
        name,
        createdByUserId: userId,
        sortOrder: count,
        items: {
          create: cleanedItems.map((it, i) => ({
            rawLabel: it.rawLabel,
            canonicalName: it.canonicalName,
            sortOrder: i,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    return toTemplate(created);
  }

  private async resolveTemplate(accountId: string, id: string) {
    const template = await (this.prisma as any).shoppingListTemplate.findFirst({
      where: { accountId, id },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async rename(
    accountId: string,
    id: string,
    dto: UpdateShoppingListTemplateDto,
  ): Promise<ShoppingListTemplate> {
    await this.resolveTemplate(accountId, id);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Template name is required');
    const updated = await (this.prisma as any).shoppingListTemplate.update({
      where: { id },
      data: { name },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    return toTemplate(updated);
  }

  async remove(accountId: string, id: string): Promise<void> {
    await this.resolveTemplate(accountId, id);
    // Hard delete — templates are a small reference-data table, same
    // convention as MerchantCategoryRule. Items cascade via the FK.
    await (this.prisma as any).shoppingListTemplate.delete({ where: { id } });
  }

  /**
   * Merges a template's items into an existing list — never replaces the
   * list, never creates a new one. An item is skipped when a non-deleted
   * item already on the target list normalizes (via the same
   * `normalizeProductName` key `product_category_rules` and the
   * receipt-reconciliation matcher use) to the same label.
   */
  async apply(
    accountId: string,
    userId: string,
    id: string,
    listId: string,
  ): Promise<ApplyShoppingListTemplateResponse> {
    const template = await (this.prisma as any).shoppingListTemplate.findFirst({
      where: { accountId, id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!template) throw new NotFoundException('Template not found');

    const list = await resolveShoppingList(this.prisma, accountId, listId);
    if (!list) throw new NotFoundException('List not found');

    const existing: Array<{ rawLabel: string; canonicalName: string | null }> =
      await this.prisma.shoppingListItem.findMany({
        where: { accountId, shoppingListId: list.id, isDeleted: false },
        select: { rawLabel: true, canonicalName: true },
      });
    const existingKeys = new Set(
      existing
        .map((it) => normalizeProductName(it.canonicalName?.trim() || it.rawLabel?.trim() || ''))
        .filter((k) => k.length > 0),
    );

    const addedLabels: string[] = [];
    const skippedLabels: string[] = [];

    for (const item of template.items as Array<{ rawLabel: string; canonicalName: string | null }>) {
      const label = item.canonicalName?.trim() || item.rawLabel.trim();
      const key = normalizeProductName(label);
      if (key.length > 0 && existingKeys.has(key)) {
        skippedLabels.push(item.rawLabel);
        continue;
      }
      await this.prisma.shoppingListItem.create({
        data: {
          accountId,
          shoppingListId: list.id,
          clientId: randomUUID(),
          canonicalName: item.canonicalName ?? null,
          rawLabel: item.rawLabel,
          quantity: 1,
          addedByUserId: userId,
        },
      });
      if (key.length > 0) existingKeys.add(key);
      addedLabels.push(item.rawLabel);
    }

    return { listId: list.id, listName: list.name, addedLabels, skippedLabels };
  }
}
