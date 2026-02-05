import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto } from './dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({
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
      },
      include: {
        category: true,
      },
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
        include: { category: true },
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
      include: { category: true },
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
      include: { category: true },
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
}
