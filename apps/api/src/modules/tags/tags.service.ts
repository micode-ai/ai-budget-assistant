import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTagDto, UpdateTagDto } from './dto';
import { EmbeddingService } from '../ai/services/embedding.service';

@Injectable()
export class TagsService {
  constructor(
    private prisma: PrismaService,
    private embeddingService: EmbeddingService,
  ) {}

  async findAll(accountId: string) {
    return this.prisma.tag.findMany({
      where: {
        accountId,
        isDeleted: false,
      },
      orderBy: {
        usageCount: 'desc',
      },
    });
  }

  async findOne(accountId: string, id: string) {
    const tag = await this.prisma.tag.findFirst({
      where: {
        id,
        accountId,
        isDeleted: false,
      },
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return tag;
  }

  async create(accountId: string, userId: string, dto: CreateTagDto) {
    void userId;
    const created = await this.prisma.tag.create({
      data: {
        accountId,
        name: dto.name,
        color: dto.color,
        icon: dto.icon,
        usageCount: 0,
      },
    });
    void this.embeddingService.embedAndStore('tag', created.id, created.name);
    return created;
  }

  async update(accountId: string, id: string, dto: UpdateTagDto) {
    const existing = await this.findOne(accountId, id);

    const updated = await this.prisma.tag.update({
      where: { id },
      data: {
        name: dto.name,
        color: dto.color,
        icon: dto.icon,
      },
    });
    if (dto.name && dto.name !== existing.name) {
      void this.embeddingService.embedAndStore('tag', updated.id, updated.name);
    }
    return updated;
  }

  async remove(accountId: string, id: string) {
    // Verify ownership
    await this.findOne(accountId, id);

    return this.prisma.tag.update({
      where: { id },
      data: {
        isDeleted: true,
      },
    });
  }

  async addToExpense(accountId: string, tagId: string, expenseId: string) {
    // Verify tag belongs to account
    await this.findOne(accountId, tagId);

    // Verify expense belongs to account
    const expense = await this.prisma.expense.findFirst({
      where: {
        id: expenseId,
        accountId,
        isDeleted: false,
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    // Create ExpenseTag record (upsert to handle duplicates)
    await this.prisma.expenseTag.upsert({
      where: {
        expenseId_tagId: {
          expenseId,
          tagId,
        },
      },
      update: {
        isDeleted: false,
      },
      create: {
        expenseId,
        tagId,
      },
    });

    // Increment usage count
    await this.prisma.tag.update({
      where: { id: tagId },
      data: {
        usageCount: {
          increment: 1,
        },
      },
    });

    return { success: true };
  }

  async removeFromExpense(accountId: string, tagId: string, expenseId: string) {
    // Verify tag belongs to account
    await this.findOne(accountId, tagId);

    // Verify expense belongs to account
    const expense = await this.prisma.expense.findFirst({
      where: {
        id: expenseId,
        accountId,
        isDeleted: false,
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    // Soft delete ExpenseTag record
    const expenseTag = await this.prisma.expenseTag.findUnique({
      where: {
        expenseId_tagId: {
          expenseId,
          tagId,
        },
      },
    });

    if (expenseTag) {
      await this.prisma.expenseTag.update({
        where: {
          expenseId_tagId: {
            expenseId,
            tagId,
          },
        },
        data: {
          isDeleted: true,
        },
      });

      // Decrement usage count
      await this.prisma.tag.update({
        where: { id: tagId },
        data: {
          usageCount: {
            decrement: 1,
          },
        },
      });
    }

    return { success: true };
  }

  async addToIncome(accountId: string, tagId: string, incomeId: string) {
    // Verify tag belongs to account
    await this.findOne(accountId, tagId);

    // Verify income belongs to account
    const income = await this.prisma.income.findFirst({
      where: {
        id: incomeId,
        accountId,
        isDeleted: false,
      },
    });

    if (!income) {
      throw new NotFoundException('Income not found');
    }

    // Create IncomeTag record (upsert to handle duplicates)
    await this.prisma.incomeTag.upsert({
      where: {
        incomeId_tagId: {
          incomeId,
          tagId,
        },
      },
      update: {
        isDeleted: false,
      },
      create: {
        incomeId,
        tagId,
      },
    });

    // Increment usage count
    await this.prisma.tag.update({
      where: { id: tagId },
      data: {
        usageCount: {
          increment: 1,
        },
      },
    });

    return { success: true };
  }

  async removeFromIncome(accountId: string, tagId: string, incomeId: string) {
    // Verify tag belongs to account
    await this.findOne(accountId, tagId);

    // Verify income belongs to account
    const income = await this.prisma.income.findFirst({
      where: {
        id: incomeId,
        accountId,
        isDeleted: false,
      },
    });

    if (!income) {
      throw new NotFoundException('Income not found');
    }

    // Soft delete IncomeTag record
    const incomeTag = await this.prisma.incomeTag.findUnique({
      where: {
        incomeId_tagId: {
          incomeId,
          tagId,
        },
      },
    });

    if (incomeTag) {
      await this.prisma.incomeTag.update({
        where: {
          incomeId_tagId: {
            incomeId,
            tagId,
          },
        },
        data: {
          isDeleted: true,
        },
      });

      // Decrement usage count
      await this.prisma.tag.update({
        where: { id: tagId },
        data: {
          usageCount: {
            decrement: 1,
          },
        },
      });
    }

    return { success: true };
  }

  async getTagsForExpense(expenseId: string) {
    const expenseTags = await this.prisma.expenseTag.findMany({
      where: {
        expenseId,
        isDeleted: false,
      },
      include: {
        tag: true,
      },
    });

    return expenseTags.map((et: typeof expenseTags[number]) => et.tag);
  }

  async getTagsForIncome(incomeId: string) {
    const incomeTags = await this.prisma.incomeTag.findMany({
      where: {
        incomeId,
        isDeleted: false,
      },
      include: {
        tag: true,
      },
    });

    return incomeTags.map((it: typeof incomeTags[number]) => it.tag);
  }
}
