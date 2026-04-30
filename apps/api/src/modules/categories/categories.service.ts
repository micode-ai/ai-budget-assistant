import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EmbeddingService } from '../ai/services/embedding.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

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

  async create(accountId: string, userId: string, dto: any) {
    // Check if a soft-deleted category with the same name/type exists — revive it
    const existing = await this.prisma.category.findFirst({
      where: { accountId, name: dto.name, type: dto.type, isDeleted: true },
    });
    if (existing) {
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
      return revived;
    }

    const created = await this.prisma.category.create({
      data: {
        accountId,
        userId,
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        type: dto.type,
        parentId: dto.parentId,
      },
    });
    void this.embeddingService.embedAndStore('category', created.id, created.name);
    return created;
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
    const [expenses, incomes, budgets, budgetCategories, splits, children] =
      await Promise.all([
        this.prisma.expense.count({
          where: { categoryId: id, isDeleted: false },
        }),
        this.prisma.income.count({
          where: { categoryId: id, isDeleted: false },
        }),
        this.prisma.budget.count({
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

    const total = expenses + incomes + budgets + budgetCategories + splits + children;
    if (total > 0) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Category has related records',
        details: { expenses, incomes, budgets, budgetCategories, splits, children },
      });
    }

    return this.prisma.category.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}
