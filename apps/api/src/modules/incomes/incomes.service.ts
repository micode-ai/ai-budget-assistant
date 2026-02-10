import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateIncomeDto, UpdateIncomeDto, IncomeFiltersDto } from './dto';

@Injectable()
export class IncomesService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveCategoryId(categoryId: string | undefined | null, accountId: string): Promise<string | null> {
    if (!categoryId) return null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
      return categoryId;
    }
    const category = await this.prisma.category.findFirst({
      where: { name: { equals: categoryId, mode: 'insensitive' }, type: 'income' },
    });
    return category?.id ?? null;
  }

  async create(accountId: string, userId: string, dto: CreateIncomeDto) {
    const resolvedCategoryId = await this.resolveCategoryId(dto.categoryId, accountId);

    const incomeData = {
      accountId,
      userId,
      clientId: dto.localId,
      amount: dto.amount,
      currencyCode: dto.currencyCode,
      description: dto.description,
      notes: dto.notes,
      categoryId: resolvedCategoryId,
      date: new Date(dto.date),
    };

    return this.prisma.income.upsert({
      where: { accountId_clientId: { accountId, clientId: dto.localId } },
      create: incomeData,
      update: {
        amount: dto.amount,
        currencyCode: dto.currencyCode,
        description: dto.description,
        notes: dto.notes,
        categoryId: resolvedCategoryId,
        date: new Date(dto.date),
        isDeleted: false,
      },
      include: { category: true },
    });
  }

  async findAll(accountId: string, filters: IncomeFiltersDto) {
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

    const [incomes, total] = await Promise.all([
      this.prisma.income.findMany({
        where,
        include: { category: true },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.income.count({ where }),
    ]);

    return {
      data: incomes,
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
    const income = await this.prisma.income.findFirst({
      where: {
        accountId,
        isDeleted: false,
        OR: [{ id }, { clientId: id }],
      },
      include: { category: true },
    });

    if (!income) {
      throw new NotFoundException('Income not found');
    }

    return income;
  }

  async update(accountId: string, id: string, dto: UpdateIncomeDto) {
    const income = await this.findOne(accountId, id);
    const resolvedCategoryId = dto.categoryId !== undefined
      ? await this.resolveCategoryId(dto.categoryId, accountId)
      : undefined;

    return this.prisma.income.update({
      where: { id: income.id },
      data: {
        amount: dto.amount,
        currencyCode: dto.currencyCode,
        description: dto.description,
        notes: dto.notes,
        categoryId: resolvedCategoryId,
        date: dto.date ? new Date(dto.date) : undefined,
        syncVersion: { increment: 1 },
      },
      include: { category: true },
    });
  }

  async remove(accountId: string, id: string) {
    const income = await this.findOne(accountId, id);

    await this.prisma.income.update({
      where: { id: income.id },
      data: {
        isDeleted: true,
        syncVersion: { increment: 1 },
      },
    });

    return { success: true };
  }

  async getByClientId(accountId: string, clientId: string) {
    return this.prisma.income.findUnique({
      where: { accountId_clientId: { accountId, clientId } },
    });
  }
}
