import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateIncomeDto, UpdateIncomeDto, IncomeFiltersDto } from './dto';
import { GamificationService } from '../gamification/gamification.service';

@Injectable()
export class IncomesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamificationService: GamificationService,
  ) {}

  private async resolveCategoryId(categoryId: string | undefined | null, accountId: string): Promise<string | null> {
    if (!categoryId) return null;
    // UUID v4 pattern — verify it exists, return null if not
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
      const exists = await this.prisma.category.findUnique({ where: { id: categoryId } });
      return exists ? categoryId : null;
    }
    // Try exact name match
    const category = await this.prisma.category.findFirst({
      where: { name: { equals: categoryId, mode: 'insensitive' } },
    });
    if (category) return category.id;

    // Handle mobile default IDs (e.g. "default-inc-salary")
    const defaultMatch = categoryId.match(/^default-(?:exp|inc)-(.+)$/);
    if (defaultMatch) {
      const words = defaultMatch[1].split(/-+/).filter(w => w.length > 0);
      if (words.length > 0) {
        const matched = await this.prisma.category.findFirst({
          where: {
            accountId,
            isDeleted: false,
            AND: words.map(word => ({ name: { contains: word, mode: 'insensitive' as const } })),
          },
        });
        if (matched) return matched.id;
      }
    }

    // Auto-create category if it looks like a real name (not a default ID)
    if (!categoryId.startsWith('default-')) {
      const created = await this.prisma.category.create({
        data: { accountId, name: categoryId, type: 'income' },
      });
      return created.id;
    }

    return null;
  }

  async create(accountId: string, userId: string, dto: CreateIncomeDto) {
    const result = await this.prisma.$transaction(async (tx: PrismaClient) => {
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

      const income = await tx.income.upsert({
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

      // Create tag associations if provided (skip silently if tags don't exist on server yet)
      if (dto.tagIds && dto.tagIds.length > 0) {
        const existingTags = await tx.tag.findMany({
          where: { id: { in: dto.tagIds } },
          select: { id: true },
        });
        const validTagIds = existingTags.map((t: { id: string }) => t.id);

        if (validTagIds.length > 0) {
          await tx.incomeTag.createMany({
            data: validTagIds.map((tagId: string) => ({
              incomeId: income.id,
              tagId,
            })),
            skipDuplicates: true,
          });
          await tx.tag.updateMany({
            where: { id: { in: validTagIds } },
            data: { usageCount: { increment: 1 } },
          });
        }
      }

      // Create project association if provided (try by id first, then by clientId)
      if (dto.projectId) {
        let project = await tx.project.findUnique({
          where: { id: dto.projectId },
          select: { id: true },
        });
        if (!project) {
          project = await tx.project.findFirst({
            where: { accountId, clientId: dto.projectId, isDeleted: false },
            select: { id: true },
          });
        }
        if (project) {
          await tx.projectIncome.upsert({
            where: { projectId_incomeId: { projectId: project.id, incomeId: income.id } },
            create: { projectId: project.id, incomeId: income.id },
            update: { isDeleted: false },
          });
        }
      }

      return tx.income.findUnique({
        where: { id: income.id },
        include: {
          category: true,
          incomeTags: { where: { isDeleted: false }, include: { tag: true } },
          projectIncomes: { where: { isDeleted: false }, include: { project: true } },
        },
      });
    });

    // Fire-and-forget gamification check
    this.gamificationService.checkAchievements(accountId, userId).catch(() => {});

    return result;
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
        include: {
          category: true,
          incomeTags: { where: { isDeleted: false }, include: { tag: true } },
          projectIncomes: { where: { isDeleted: false }, include: { project: true } },
        },
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
      include: {
        category: true,
        incomeTags: { where: { isDeleted: false }, include: { tag: true } },
        projectIncomes: { where: { isDeleted: false }, include: { project: true } },
      },
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

    return this.prisma.$transaction(async (tx: PrismaClient) => {
      await tx.income.update({
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
      });

      // Update tag associations if provided
      if (dto.tagIds !== undefined) {
        await tx.incomeTag.updateMany({
          where: { incomeId: income.id, isDeleted: false },
          data: { isDeleted: true },
        });

        if (dto.tagIds.length > 0) {
          const existingTags = await tx.tag.findMany({
            where: { id: { in: dto.tagIds } },
            select: { id: true },
          });
          const validTagIds = existingTags.map((t: { id: string }) => t.id);

          if (validTagIds.length > 0) {
            await tx.incomeTag.createMany({
              data: validTagIds.map((tagId: string) => ({
                incomeId: income.id,
                tagId,
              })),
              skipDuplicates: true,
            });
            await tx.tag.updateMany({
              where: { id: { in: validTagIds } },
              data: { usageCount: { increment: 1 } },
            });
          }
        }
      }

      // Update project association if provided
      if (dto.projectId !== undefined) {
        await tx.projectIncome.updateMany({
          where: { incomeId: income.id, isDeleted: false },
          data: { isDeleted: true },
        });
        if (dto.projectId) {
          const projectExists = await tx.project.findUnique({
            where: { id: dto.projectId },
            select: { id: true },
          });
          if (projectExists) {
            await tx.projectIncome.upsert({
              where: { projectId_incomeId: { projectId: dto.projectId, incomeId: income.id } },
              create: { projectId: dto.projectId, incomeId: income.id },
              update: { isDeleted: false },
            });
          }
        }
      }

      return tx.income.findUnique({
        where: { id: income.id },
        include: {
          category: true,
          incomeTags: { where: { isDeleted: false }, include: { tag: true } },
          projectIncomes: { where: { isDeleted: false }, include: { project: true } },
        },
      });
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
