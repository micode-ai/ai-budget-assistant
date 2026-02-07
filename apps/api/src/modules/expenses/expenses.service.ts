import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto, CreateExpenseItemDto, UpdateExpenseItemDto } from './dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateExpenseDto) {
    return this.prisma.$transaction(async (tx) => {
      const receiptImage = dto.receiptImageBase64
        ? Buffer.from(dto.receiptImageBase64, 'base64')
        : undefined;

      const expense = await tx.expense.create({
        data: {
          userId,
          clientId: dto.localId,
          amount: dto.amount,
          currencyCode: dto.currencyCode,
          description: dto.description,
          notes: dto.notes,
          categoryId: dto.categoryId,
          date: new Date(dto.date),
          time: dto.time,
          locationLat: dto.location?.lat,
          locationLng: dto.location?.lng,
          source: dto.source,
          receiptImage,
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
        });
      }

      return tx.expense.findUnique({
        where: { id: expense.id },
        include: {
          category: true,
          items: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
        },
      });
    });
  }

  async findAll(userId: string, filters: ExpenseFiltersDto) {
    const { page = 1, limit = 20, startDate, endDate, categoryId, search } = filters;
    const skip = (page - 1) * limit;

    const where: any = {
      userId,
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
          clientId: true,
          categoryId: true,
          amount: true,
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

  async findOne(userId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, userId, isDeleted: false },
      include: {
        category: true,
        items: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return expense;
  }

  async update(userId: string, id: string, dto: UpdateExpenseDto) {
    const expense = await this.findOne(userId, id);

    return this.prisma.expense.update({
      where: { id: expense.id },
      data: {
        amount: dto.amount,
        currencyCode: dto.currencyCode,
        description: dto.description,
        notes: dto.notes,
        categoryId: dto.categoryId,
        date: dto.date ? new Date(dto.date) : undefined,
        time: dto.time,
        locationLat: dto.location?.lat,
        locationLng: dto.location?.lng,
        syncVersion: { increment: 1 },
      },
      include: {
        category: true,
        items: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async remove(userId: string, id: string) {
    const expense = await this.findOne(userId, id);

    await this.prisma.expense.update({
      where: { id: expense.id },
      data: {
        isDeleted: true,
        syncVersion: { increment: 1 },
      },
    });

    return { success: true };
  }

  async getByClientId(userId: string, clientId: string) {
    return this.prisma.expense.findUnique({
      where: { userId_clientId: { userId, clientId } },
    });
  }

  // ---- Expense Items CRUD ----

  async getItems(userId: string, expenseId: string) {
    await this.findOne(userId, expenseId);
    return this.prisma.expenseItem.findMany({
      where: { expenseId, isDeleted: false },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createItem(userId: string, expenseId: string, dto: CreateExpenseItemDto) {
    await this.findOne(userId, expenseId);
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

  async updateItem(userId: string, expenseId: string, itemId: string, dto: UpdateExpenseItemDto) {
    await this.findOne(userId, expenseId);
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

  async removeItem(userId: string, expenseId: string, itemId: string) {
    await this.findOne(userId, expenseId);
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

  async getReceiptImage(userId: string, expenseId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, userId, isDeleted: false },
      select: { receiptImage: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    if (!expense.receiptImage) throw new NotFoundException('No receipt image found');
    return { imageBase64: expense.receiptImage.toString('base64') };
  }

  async saveReceiptImage(userId: string, expenseId: string, imageBase64: string) {
    await this.findOne(userId, expenseId);
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    await this.prisma.expense.update({
      where: { id: expenseId },
      data: { receiptImage: imageBuffer, syncVersion: { increment: 1 } },
    });
    return { success: true };
  }

  async deleteReceiptImage(userId: string, expenseId: string) {
    await this.findOne(userId, expenseId);
    await this.prisma.expense.update({
      where: { id: expenseId },
      data: { receiptImage: null, syncVersion: { increment: 1 } },
    });
    return { success: true };
  }
}
