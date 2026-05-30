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
    // `id` may be the server PK or the mobile's local clientId (offline-first).
    const tag = await this.prisma.tag.findFirst({
      where: {
        accountId,
        isDeleted: false,
        OR: [{ id }, { clientId: id }],
      },
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return tag;
  }

  /** Resolve an expense by server PK or mobile clientId; null if not found. */
  private async resolveExpensePk(accountId: string, idOrClientId: string): Promise<string | null> {
    const e = await this.prisma.expense.findFirst({
      where: { accountId, isDeleted: false, OR: [{ id: idOrClientId }, { clientId: idOrClientId }] },
      select: { id: true },
    });
    return e?.id ?? null;
  }

  /** Resolve an income by server PK or mobile clientId; null if not found. */
  private async resolveIncomePk(accountId: string, idOrClientId: string): Promise<string | null> {
    const i = await this.prisma.income.findFirst({
      where: { accountId, isDeleted: false, OR: [{ id: idOrClientId }, { clientId: idOrClientId }] },
      select: { id: true },
    });
    return i?.id ?? null;
  }

  async create(accountId: string, userId: string, dto: CreateTagDto) {
    void userId;
    // Idempotent on the existing (accountId, name) unique — re-creating a tag
    // returns the existing one instead of throwing. Stores the mobile's local
    // id as clientId so later tag ops can resolve client-supplied ids back to
    // this server PK.
    const created = await this.prisma.tag.upsert({
      where: { accountId_name: { accountId, name: dto.name } },
      create: {
        accountId,
        name: dto.name,
        color: dto.color,
        icon: dto.icon,
        clientId: dto.clientId,
        usageCount: 0,
      },
      update: dto.clientId ? { clientId: dto.clientId } : {},
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
    // Resolve tag + expense to server PKs (ids may be mobile clientIds).
    const tag = await this.findOne(accountId, tagId);
    const expensePk = await this.resolveExpensePk(accountId, expenseId);
    if (!expensePk) {
      throw new NotFoundException('Expense not found');
    }

    // Create ExpenseTag record (upsert to handle duplicates)
    await this.prisma.expenseTag.upsert({
      where: {
        expenseId_tagId: { expenseId: expensePk, tagId: tag.id },
      },
      update: {
        isDeleted: false,
      },
      create: {
        expenseId: expensePk,
        tagId: tag.id,
      },
    });

    // Increment usage count
    await this.prisma.tag.update({
      where: { id: tag.id },
      data: {
        usageCount: {
          increment: 1,
        },
      },
    });

    return { success: true };
  }

  async removeFromExpense(accountId: string, tagId: string, expenseId: string) {
    const tag = await this.findOne(accountId, tagId);
    const expensePk = await this.resolveExpensePk(accountId, expenseId);
    if (!expensePk) {
      throw new NotFoundException('Expense not found');
    }

    // Soft delete ExpenseTag record
    const expenseTag = await this.prisma.expenseTag.findUnique({
      where: { expenseId_tagId: { expenseId: expensePk, tagId: tag.id } },
    });

    if (expenseTag) {
      await this.prisma.expenseTag.update({
        where: { expenseId_tagId: { expenseId: expensePk, tagId: tag.id } },
        data: {
          isDeleted: true,
        },
      });

      // Decrement usage count
      await this.prisma.tag.update({
        where: { id: tag.id },
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
    // Resolve tag + income to server PKs (ids may be mobile clientIds).
    const tag = await this.findOne(accountId, tagId);
    const incomePk = await this.resolveIncomePk(accountId, incomeId);
    if (!incomePk) {
      throw new NotFoundException('Income not found');
    }

    // Create IncomeTag record (upsert to handle duplicates)
    await this.prisma.incomeTag.upsert({
      where: {
        incomeId_tagId: { incomeId: incomePk, tagId: tag.id },
      },
      update: {
        isDeleted: false,
      },
      create: {
        incomeId: incomePk,
        tagId: tag.id,
      },
    });

    // Increment usage count
    await this.prisma.tag.update({
      where: { id: tag.id },
      data: {
        usageCount: {
          increment: 1,
        },
      },
    });

    return { success: true };
  }

  async removeFromIncome(accountId: string, tagId: string, incomeId: string) {
    // Resolve tag + income to server PKs (ids may be mobile clientIds).
    const tag = await this.findOne(accountId, tagId);
    const incomePk = await this.resolveIncomePk(accountId, incomeId);
    if (!incomePk) {
      throw new NotFoundException('Income not found');
    }

    // Soft delete IncomeTag record
    const incomeTag = await this.prisma.incomeTag.findUnique({
      where: { incomeId_tagId: { incomeId: incomePk, tagId: tag.id } },
    });

    if (incomeTag) {
      await this.prisma.incomeTag.update({
        where: { incomeId_tagId: { incomeId: incomePk, tagId: tag.id } },
        data: {
          isDeleted: true,
        },
      });

      // Decrement usage count
      await this.prisma.tag.update({
        where: { id: tag.id },
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
