import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

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
      return this.prisma.category.update({
        where: { id: existing.id },
        data: {
          isDeleted: false,
          icon: dto.icon,
          color: dto.color,
          parentId: dto.parentId,
          userId,
        },
      });
    }

    return this.prisma.category.create({
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
  }

  async update(accountId: string, id: string, dto: any) {
    const category = await this.prisma.category.findFirst({
      where: {
        id,
        OR: [{ accountId }, { isSystem: true }],
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    return this.prisma.category.update({
      where: { id },
      data: dto,
    });
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
