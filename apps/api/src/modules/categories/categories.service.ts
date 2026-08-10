import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import type { Category } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmbeddingService } from '../ai/services/embedding.service';
import { CacheService } from '../../common/cache/cache.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly cacheService: CacheService,
  ) {}

  private invalidateChatCache(accountId: string): void {
    if (!accountId) return;
    void this.cacheService.delByPrefix(`chat:get_category_breakdown:${accountId}:`);
    void this.cacheService.delByPrefix(`chat:get_expenses:${accountId}:`);
  }

  async findAll(accountId: string) {
    // Get system categories and account's custom categories
    return this.prisma.category.findMany({
      where: {
        OR: [
          { isSystem: true },
          { accountId },
        ],
        isDeleted: false,
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  /**
   * A category with this name+type already exists. Live one: return it as-is —
   * an existing category IS the correct answer to "create" it, and copying the
   * incoming icon/color over would silently restyle a category the user has
   * already customised. Soft-deleted one: revive it with the incoming values.
   */
  private async reuseExisting(existing: Category, accountId: string, userId: string, dto: any) {
    if (!existing.isDeleted) return existing;

    const revived = await this.prisma.category.update({
      where: { id: existing.id },
      data: {
        isDeleted: false,
        icon: dto.icon,
        color: dto.color,
        parentId: dto.parentId,
        userId,
      },
    });
    // Fire-and-forget: refresh embedding so semantic match picks it up.
    void this.embeddingService.embedAndStore('category', revived.id, revived.name);
    this.invalidateChatCache(accountId);
    return revived;
  }

  async create(accountId: string, userId: string, dto: any) {
    // Callers outside the controller (AI create_category, all three bots) pass a
    // bare object, so `type` carries no DTO validation. Default it the same way
    // the schema does, or an undefined would drop the type filter from the
    // lookup below and match a same-named category of the OTHER type.
    const type = dto.type ?? 'expense';

    // @@unique([accountId, name, type]) does not exclude soft-deleted rows, so
    // ANY existing row with this name+type blocks the insert — look for it
    // without filtering isDeleted. Only checking for soft-deleted ones (what
    // this did before) let a live duplicate fall through to create() and throw
    // P2002 as an unhandled 500: reachable from the app (same name typed
    // twice), from AI create_category, and from all three bots.
    const existing = await this.prisma.category.findFirst({
      where: { accountId, name: dto.name, type },
    });
    if (existing) return this.reuseExisting(existing, accountId, userId, dto);

    try {
      const created = await this.prisma.category.create({
        data: {
          accountId,
          userId,
          name: dto.name,
          icon: dto.icon,
          color: dto.color,
          type,
          parentId: dto.parentId,
        },
      });
      void this.embeddingService.embedAndStore('category', created.id, created.name);
      this.invalidateChatCache(accountId);
      return created;
    } catch (e: any) {
      // A concurrent request won the race between the read above and this
      // insert (double-tap, an offline retry, an AI confirm racing a manual
      // add). Re-read and reuse instead of surfacing a 500. Safe to catch
      // here because there is no $transaction to poison (ABA-313).
      if (e?.code !== 'P2002') throw e;
      const raced = await this.prisma.category.findFirst({
        where: { accountId, name: dto.name, type },
      });
      if (!raced) throw e;
      return this.reuseExisting(raced, accountId, userId, dto);
    }
  }

  async update(accountId: string, id: string, dto: any) {
    const category = await this.prisma.category.findFirst({
      where: {
        id,
        OR: [{ accountId }, { isSystem: true }],
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    const updated = await this.prisma.category.update({
      where: { id },
      data: dto,
    });
    if (dto.name && dto.name !== category.name) {
      // Name changed — refresh embedding.
      void this.embeddingService.embedAndStore('category', updated.id, updated.name);
    }
    this.invalidateChatCache(accountId);
    return updated;
  }

  async remove(accountId: string, id: string) {
    // System categories have accountId: null on server, but are seeded locally with accountId.
    // On the API side, system categories are global. Soft-deleting a system category
    // hides it for ALL accounts (findAll filters isDeleted: false).
    // This is intentional per spec — system categories can be deleted.
    const category = await this.prisma.category.findFirst({
      where: {
        id,
        OR: [{ accountId }, { isSystem: true }],
      },
    });
    if (!category) throw new NotFoundException('Category not found');

    // Check for related records
    const [expenses, incomes, budgetCategories, splits, children] =
      await Promise.all([
        this.prisma.expense.count({
          where: { categoryId: id, isDeleted: false },
        }),
        this.prisma.income.count({
          where: { categoryId: id, isDeleted: false },
        }),
        this.prisma.budgetCategory.count({
          where: { categoryId: id, isDeleted: false },
        }),
        this.prisma.expenseCategorySplit.count({
          where: { categoryId: id, isDeleted: false },
        }),
        this.prisma.category.count({
          where: { parentId: id, isDeleted: false },
        }),
      ]);

    const total = expenses + incomes + budgetCategories + splits + children;
    if (total > 0) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Category has related records',
        details: { expenses, incomes, budgetCategories, splits, children },
      });
    }

    const removed = await this.prisma.category.update({
      where: { id },
      data: { isDeleted: true },
    });
    this.invalidateChatCache(accountId);
    return removed;
  }
}
