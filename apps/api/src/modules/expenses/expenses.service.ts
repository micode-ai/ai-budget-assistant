import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto, CreateExpenseItemDto, UpdateExpenseItemDto } from './dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve categoryId: if it's a valid UUID, use as-is.
   * If it's a category name, look up by name. Otherwise return null.
   */
  private async resolveCategoryId(categoryId: string | undefined | null, accountId: string): Promise<string | null> {
    if (!categoryId) return null;
    // UUID v4 pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
      return categoryId;
    }
    // Try to find by name
    const category = await this.prisma.category.findFirst({
      where: { name: { equals: categoryId, mode: 'insensitive' } },
    });
    return category?.id ?? null;
  }

  async create(accountId: string, userId: string, dto: CreateExpenseDto) {
    return this.prisma.$transaction(async (tx) => {
      const receiptImage = dto.receiptImageBase64
        ? Buffer.from(dto.receiptImageBase64, 'base64')
        : undefined;

      const resolvedCategoryId = await this.resolveCategoryId(dto.categoryId, accountId);

      const expenseData = {
        accountId,
        userId,
        clientId: dto.localId,
        amount: dto.amount,
        discountAmount: dto.discountAmount,
        currencyCode: dto.currencyCode,
        description: dto.description,
        notes: dto.notes,
        categoryId: resolvedCategoryId,
        date: new Date(dto.date),
        time: dto.time,
        locationLat: dto.location?.lat,
        locationLng: dto.location?.lng,
        source: dto.source,
        receiptImage,
      };

      const expense = await tx.expense.upsert({
        where: { accountId_clientId: { accountId, clientId: dto.localId } },
        create: expenseData,
        update: {
          amount: dto.amount,
          discountAmount: dto.discountAmount,
          currencyCode: dto.currencyCode,
          description: dto.description,
          notes: dto.notes,
          categoryId: resolvedCategoryId,
          date: new Date(dto.date),
          source: dto.source,
          receiptImage,
          isDeleted: false,
        },
        include: { category: true },
      });

      if (dto.items && dto.items.length > 0) {
        await tx.expenseItem.createMany({
          data: dto.items.map((item, index) => ({
            expenseId: expense.id,
            description: item.description,
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice ?? 0,
            totalPrice: item.totalPrice,
            sortOrder: item.sortOrder ?? index,
          })),
          skipDuplicates: true,
        });
      }

      // Create tag associations if provided
      if (dto.tagIds && dto.tagIds.length > 0) {
        await tx.expenseTag.createMany({
          data: dto.tagIds.map(tagId => ({
            expenseId: expense.id,
            tagId,
          })),
          skipDuplicates: true,
        });
        // Increment usage counts
        await tx.tag.updateMany({
          where: { id: { in: dto.tagIds } },
          data: { usageCount: { increment: 1 } },
        });
      }

      return tx.expense.findUnique({
        where: { id: expense.id },
        include: {
          category: true,
          items: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
          expenseTags: { where: { isDeleted: false }, include: { tag: true } },
          categorySplits: { where: { isDeleted: false }, include: { category: true } },
        },
      });
    });
  }

  async findAll(accountId: string, filters: ExpenseFiltersDto) {
    const { page = 1, limit = 20, startDate, endDate, categoryId, search } = filters;
    const skip = (page - 1) * limit;

    const where: any = {
      accountId,
      isDeleted: false,
    };

    if (startDate) {
      where.date = { ...where.date, gte: new Date(startDate) };
    }
    if (endDate) {
      where.date = { ...where.date, lte: new Date(endDate) };
    }
    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        select: {
          id: true,
          userId: true,
          accountId: true,
          clientId: true,
          categoryId: true,
          amount: true,
          discountAmount: true,
          currencyCode: true,
          description: true,
          notes: true,
          date: true,
          time: true,
          locationLat: true,
          locationLng: true,
          receiptUrl: true,
          isRecurring: true,
          recurringId: true,
          source: true,
          isDeleted: true,
          syncVersion: true,
          createdAt: true,
          updatedAt: true,
          category: true,
          items: {
            where: { isDeleted: false },
            orderBy: { sortOrder: 'asc' },
          },
          expenseTags: {
            where: { isDeleted: false },
            include: { tag: true },
          },
          categorySplits: {
            where: { isDeleted: false },
            include: { category: true },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data: expenses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findOne(accountId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: {
        accountId,
        isDeleted: false,
        OR: [{ id }, { clientId: id }],
      },
      include: {
        category: true,
        items: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
        expenseTags: { where: { isDeleted: false }, include: { tag: true } },
        categorySplits: { where: { isDeleted: false }, include: { category: true } },
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return expense;
  }

  async update(accountId: string, id: string, dto: UpdateExpenseDto) {
    const expense = await this.findOne(accountId, id);
    const resolvedCategoryId = dto.categoryId !== undefined
      ? await this.resolveCategoryId(dto.categoryId, accountId)
      : undefined;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id: expense.id },
        data: {
          amount: dto.amount,
          discountAmount: dto.discountAmount,
          currencyCode: dto.currencyCode,
          description: dto.description,
          notes: dto.notes,
          categoryId: resolvedCategoryId,
          date: dto.date ? new Date(dto.date) : undefined,
          time: dto.time,
          locationLat: dto.location?.lat,
          locationLng: dto.location?.lng,
          syncVersion: { increment: 1 },
        },
      });

      // Update tag associations if provided
      if (dto.tagIds !== undefined) {
        // Soft-delete existing expense tags
        await tx.expenseTag.updateMany({
          where: { expenseId: expense.id, isDeleted: false },
          data: { isDeleted: true },
        });

        // Create new expense tags
        if (dto.tagIds.length > 0) {
          await tx.expenseTag.createMany({
            data: dto.tagIds.map(tagId => ({
              expenseId: expense.id,
              tagId,
            })),
            skipDuplicates: true,
          });
          // Increment usage counts
          await tx.tag.updateMany({
            where: { id: { in: dto.tagIds } },
            data: { usageCount: { increment: 1 } },
          });
        }
      }

      return tx.expense.findUnique({
        where: { id: expense.id },
        include: {
          category: true,
          items: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
          expenseTags: { where: { isDeleted: false }, include: { tag: true } },
          categorySplits: { where: { isDeleted: false }, include: { category: true } },
        },
      });
    });
  }

  async remove(accountId: string, id: string) {
    const expense = await this.findOne(accountId, id);

    await this.prisma.expense.update({
      where: { id: expense.id },
      data: {
        isDeleted: true,
        syncVersion: { increment: 1 },
      },
    });

    return { success: true };
  }

  async getByClientId(accountId: string, clientId: string) {
    return this.prisma.expense.findUnique({
      where: { accountId_clientId: { accountId, clientId } },
    });
  }

  // ---- Expense Items CRUD ----

  async getItems(accountId: string, expenseId: string) {
    await this.findOne(accountId, expenseId);
    return this.prisma.expenseItem.findMany({
      where: { expenseId, isDeleted: false },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createItem(accountId: string, expenseId: string, dto: CreateExpenseItemDto) {
    await this.findOne(accountId, expenseId);
    return this.prisma.expenseItem.create({
      data: {
        expenseId,
        description: dto.description,
        quantity: dto.quantity ?? 1,
        unitPrice: dto.unitPrice ?? 0,
        totalPrice: dto.totalPrice,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateItem(accountId: string, expenseId: string, itemId: string, dto: UpdateExpenseItemDto) {
    await this.findOne(accountId, expenseId);
    const item = await this.prisma.expenseItem.findFirst({
      where: { id: itemId, expenseId, isDeleted: false },
    });
    if (!item) throw new NotFoundException('Expense item not found');

    return this.prisma.expenseItem.update({
      where: { id: itemId },
      data: {
        description: dto.description,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        totalPrice: dto.totalPrice,
        sortOrder: dto.sortOrder,
        syncVersion: { increment: 1 },
      },
    });
  }

  async removeItem(accountId: string, expenseId: string, itemId: string) {
    await this.findOne(accountId, expenseId);
    const item = await this.prisma.expenseItem.findFirst({
      where: { id: itemId, expenseId, isDeleted: false },
    });
    if (!item) throw new NotFoundException('Expense item not found');

    await this.prisma.expenseItem.update({
      where: { id: itemId },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    return { success: true };
  }

  // ---- Receipt Image ----

  async getReceiptImage(accountId: string, expenseId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: {
        accountId,
        isDeleted: false,
        OR: [{ id: expenseId }, { clientId: expenseId }],
      },
      select: { receiptImage: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    if (!expense.receiptImage) throw new NotFoundException('No receipt image found');
    return { imageBase64: expense.receiptImage.toString('base64') };
  }

  async saveReceiptImage(accountId: string, expenseId: string, imageBase64: string) {
    await this.findOne(accountId, expenseId);
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    await this.prisma.expense.update({
      where: { id: expenseId },
      data: { receiptImage: imageBuffer, syncVersion: { increment: 1 } },
    });
    return { success: true };
  }

  async deleteReceiptImage(accountId: string, expenseId: string) {
    await this.findOne(accountId, expenseId);
    await this.prisma.expense.update({
      where: { id: expenseId },
      data: { receiptImage: null, syncVersion: { increment: 1 } },
    });
    return { success: true };
  }

  // ---- Category Splits ----

  async setSplits(
    accountId: string,
    expenseId: string,
    splits: Array<{ categoryId: string; amount: number; percentage: number; notes?: string }>,
  ) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, accountId, isDeleted: false },
    });
    if (!expense) throw new NotFoundException('Expense not found');

    return this.prisma.$transaction(async (tx) => {
      // Soft-delete existing splits
      await tx.expenseCategorySplit.updateMany({
        where: { expenseId, isDeleted: false },
        data: { isDeleted: true },
      });

      // Create new splits
      await tx.expenseCategorySplit.createMany({
        data: splits.map(split => ({
          expenseId,
          categoryId: split.categoryId,
          amount: split.amount,
          percentage: split.percentage,
          notes: split.notes,
        })),
      });

      return tx.expense.findUnique({
        where: { id: expenseId },
        include: {
          category: true,
          items: { where: { isDeleted: false } },
          expenseTags: { where: { isDeleted: false }, include: { tag: true } },
          categorySplits: { where: { isDeleted: false }, include: { category: true } },
        },
      });
    });
  }

  async removeSplits(accountId: string, expenseId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, accountId, isDeleted: false },
    });
    if (!expense) throw new NotFoundException('Expense not found');

    await this.prisma.expenseCategorySplit.updateMany({
      where: { expenseId, isDeleted: false },
      data: { isDeleted: true },
    });

    return { success: true };
  }
}
