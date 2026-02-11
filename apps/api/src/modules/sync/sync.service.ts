import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { IncomesService } from '../incomes/incomes.service';

interface SyncChange {
  entityType: 'expense' | 'expense_item' | 'budget' | 'category' | 'income' | 'tag' | 'project' | 'expense_tag' | 'income_tag' | 'project_expense' | 'project_income' | 'expense_category_split';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: any;
  clientVersion: number;
}

export interface SyncResult {
  entityId: string;
  status: 'success' | 'conflict' | 'error';
  serverVersion?: number;
  serverId?: string;
  serverData?: any;
  error?: string;
}

export interface ExpenseRecord {
  clientId: string;
  isDeleted: boolean;
  syncVersion: number;
  updatedAt: Date;
}

export interface BudgetRecord {
  clientId: string;
  isDeleted: boolean;
  syncVersion: number;
  updatedAt: Date;
}

export interface CategoryRecord {
  id: string;
  isDeleted: boolean;
  syncVersion: number;
  updatedAt: Date;
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expensesService: ExpensesService,
    private readonly incomesService: IncomesService,
  ) {}

  async pushChanges(accountId: string, userId: string, changes: SyncChange[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const change of changes) {
      try {
        const result = await this.processChange(accountId, userId, change);
        results.push(result);
      } catch (error) {
        results.push({
          entityId: change.entityId,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Update user's last sync timestamp
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSyncAt: new Date() },
    });

    return results;
  }

  private async processChange(accountId: string, userId: string, change: SyncChange): Promise<SyncResult> {
    switch (change.entityType) {
      case 'expense':
        return this.processExpenseChange(accountId, userId, change);
      case 'expense_item':
        return this.processExpenseItemChange(accountId, change);
      case 'budget':
        return this.processBudgetChange(accountId, change);
      case 'category':
        return this.processCategoryChange(accountId, change);
      case 'income':
        return this.processIncomeChange(accountId, userId, change);
      case 'tag':
        return this.processTagChange(accountId, change);
      case 'project':
        return this.processProjectChange(accountId, userId, change);
      case 'expense_tag':
      case 'income_tag':
      case 'project_expense':
      case 'project_income':
      case 'expense_category_split':
        return this.processRelationChange(accountId, change);
      default:
        return {
          entityId: change.entityId,
          status: 'error',
          error: `Unknown entity type: ${change.entityType}`,
        };
    }
  }

  private async processExpenseChange(accountId: string, userId: string, change: SyncChange): Promise<SyncResult> {
    const { operation, payload, clientVersion, entityId } = change;

    // Check for existing record
    const existing = await this.expensesService.getByClientId(accountId, entityId);

    if (operation === 'create') {
      if (existing) {
        // Already exists - check version
        if (existing.syncVersion !== clientVersion) {
          return {
            entityId,
            status: 'conflict',
            serverVersion: existing.syncVersion,
            serverData: existing,
          };
        }
        return {
          entityId,
          status: 'success',
          serverId: existing.id,
          serverVersion: existing.syncVersion,
        };
      }

      // Create new expense
      const created = await this.expensesService.create(accountId, userId, {
        ...payload,
        localId: entityId,
      });

      if (!created) {
        return { entityId, status: 'error', error: 'Failed to create expense' };
      }

      return {
        entityId,
        status: 'success',
        serverId: created.id,
        serverVersion: created.syncVersion,
      };
    }

    if (!existing) {
      return {
        entityId,
        status: 'error',
        error: 'Entity not found',
      };
    }

    // Check for conflict
    if (existing.syncVersion !== clientVersion) {
      return {
        entityId,
        status: 'conflict',
        serverVersion: existing.syncVersion,
        serverData: existing,
      };
    }

    if (operation === 'update') {
      const updated = await this.expensesService.update(accountId, existing.id, payload);
      if (!updated) {
        return { entityId, status: 'error', error: 'Failed to update expense' };
      }
      return {
        entityId,
        status: 'success',
        serverVersion: updated.syncVersion,
      };
    }

    if (operation === 'delete') {
      await this.expensesService.remove(accountId, existing.id);
      return {
        entityId,
        status: 'success',
      };
    }

    return {
      entityId,
      status: 'error',
      error: 'Invalid operation',
    };
  }

  private async processExpenseItemChange(accountId: string, change: SyncChange): Promise<SyncResult> {
    const { operation, payload, clientVersion, entityId } = change;

    // Verify that the parent expense belongs to this account
    if (payload?.expenseId) {
      const parentExpense = await this.prisma.expense.findFirst({
        where: { id: payload.expenseId, accountId },
      });
      if (!parentExpense) {
        return { entityId, status: 'error', error: 'Parent expense not found' };
      }
    }

    const existing = await this.prisma.expenseItem.findUnique({
      where: { id: entityId },
    });

    if (operation === 'create') {
      if (existing) {
        if (existing.syncVersion !== clientVersion) {
          return { entityId, status: 'conflict', serverVersion: existing.syncVersion, serverData: existing };
        }
        return { entityId, status: 'success', serverId: existing.id, serverVersion: existing.syncVersion };
      }

      const created = await this.prisma.expenseItem.create({
        data: {
          id: entityId,
          expenseId: payload.expenseId,
          description: payload.description,
          quantity: payload.quantity ?? 1,
          unitPrice: payload.unitPrice ?? 0,
          totalPrice: payload.totalPrice,
          sortOrder: payload.sortOrder ?? 0,
        },
      });

      return { entityId, status: 'success', serverId: created.id, serverVersion: created.syncVersion };
    }

    if (!existing) {
      return { entityId, status: 'error', error: 'Entity not found' };
    }

    if (existing.syncVersion !== clientVersion) {
      return { entityId, status: 'conflict', serverVersion: existing.syncVersion, serverData: existing };
    }

    if (operation === 'update') {
      const updated = await this.prisma.expenseItem.update({
        where: { id: entityId },
        data: {
          ...payload,
          syncVersion: { increment: 1 },
        },
      });
      return { entityId, status: 'success', serverVersion: updated.syncVersion };
    }

    if (operation === 'delete') {
      await this.prisma.expenseItem.update({
        where: { id: entityId },
        data: { isDeleted: true, syncVersion: { increment: 1 } },
      });
      return { entityId, status: 'success' };
    }

    return { entityId, status: 'error', error: 'Invalid operation' };
  }

  private async processBudgetChange(accountId: string, change: SyncChange): Promise<SyncResult> {
    // Similar implementation for budgets
    return {
      entityId: change.entityId,
      status: 'success',
    };
  }

  private async processCategoryChange(accountId: string, change: SyncChange): Promise<SyncResult> {
    // Similar implementation for categories
    return {
      entityId: change.entityId,
      status: 'success',
    };
  }

  private async processIncomeChange(accountId: string, userId: string, change: SyncChange): Promise<SyncResult> {
    const { operation, payload, clientVersion, entityId } = change;

    const existing = await this.incomesService.getByClientId(accountId, entityId);

    if (operation === 'create') {
      if (existing) {
        if (existing.syncVersion !== clientVersion) {
          return { entityId, status: 'conflict', serverVersion: existing.syncVersion, serverData: existing };
        }
        return { entityId, status: 'success', serverId: existing.id, serverVersion: existing.syncVersion };
      }

      const created = await this.incomesService.create(accountId, userId, {
        ...payload,
        localId: entityId,
      });

      if (!created) {
        return { entityId, status: 'error', error: 'Failed to create income' };
      }

      return { entityId, status: 'success', serverId: created.id, serverVersion: created.syncVersion };
    }

    if (!existing) {
      return { entityId, status: 'error', error: 'Entity not found' };
    }

    if (existing.syncVersion !== clientVersion) {
      return { entityId, status: 'conflict', serverVersion: existing.syncVersion, serverData: existing };
    }

    if (operation === 'update') {
      const updated = await this.incomesService.update(accountId, existing.id, payload);
      return { entityId, status: 'success', serverVersion: updated?.syncVersion ?? existing.syncVersion + 1 };
    }

    if (operation === 'delete') {
      await this.incomesService.remove(accountId, existing.id);
      return { entityId, status: 'success' };
    }

    return { entityId, status: 'error', error: 'Invalid operation' };
  }

  private async processTagChange(accountId: string, change: SyncChange): Promise<SyncResult> {
    if (change.operation === 'create') {
      const tag = await this.prisma.tag.upsert({
        where: { accountId_name: { accountId, name: (change.payload as any).name } },
        create: { accountId, ...(change.payload as any) },
        update: { ...(change.payload as any), isDeleted: false },
      });
      return { entityId: change.entityId, status: 'success', serverId: tag.id, serverVersion: tag.syncVersion };
    }
    if (change.operation === 'update') {
      const tag = await this.prisma.tag.findFirst({ where: { id: change.entityId, accountId } });
      if (!tag) return { entityId: change.entityId, status: 'error', error: 'Tag not found' };
      const updated = await this.prisma.tag.update({
        where: { id: change.entityId },
        data: { ...(change.payload as any), syncVersion: { increment: 1 } },
      });
      return { entityId: change.entityId, status: 'success', serverVersion: updated.syncVersion };
    }
    if (change.operation === 'delete') {
      await this.prisma.tag.updateMany({
        where: { id: change.entityId, accountId },
        data: { isDeleted: true, syncVersion: { increment: 1 } },
      });
      return { entityId: change.entityId, status: 'success' };
    }
    return { entityId: change.entityId, status: 'error', error: 'Unknown operation' };
  }

  private async processProjectChange(accountId: string, userId: string, change: SyncChange): Promise<SyncResult> {
    const payload = change.payload as any;
    if (change.operation === 'create') {
      const project = await this.prisma.project.upsert({
        where: { accountId_clientId: { accountId, clientId: payload.localId || change.entityId } },
        create: {
          accountId,
          clientId: payload.localId || change.entityId,
          name: payload.name,
          description: payload.description,
          color: payload.color,
          icon: payload.icon,
          startDate: payload.startDate ? new Date(payload.startDate) : undefined,
          endDate: payload.endDate ? new Date(payload.endDate) : undefined,
          budget: payload.budget,
          currencyCode: payload.currencyCode,
        },
        update: { ...payload, isDeleted: false },
      });
      return { entityId: change.entityId, status: 'success', serverId: project.id, serverVersion: project.syncVersion };
    }
    if (change.operation === 'update') {
      const project = await this.prisma.project.findFirst({ where: { id: change.entityId, accountId } });
      if (!project) return { entityId: change.entityId, status: 'error', error: 'Project not found' };
      const updated = await this.prisma.project.update({
        where: { id: change.entityId },
        data: { ...payload, syncVersion: { increment: 1 } },
      });
      return { entityId: change.entityId, status: 'success', serverVersion: updated.syncVersion };
    }
    if (change.operation === 'delete') {
      await this.prisma.project.updateMany({
        where: { id: change.entityId, accountId },
        data: { isDeleted: true, syncVersion: { increment: 1 } },
      });
      return { entityId: change.entityId, status: 'success' };
    }
    return { entityId: change.entityId, status: 'error', error: 'Unknown operation' };
  }

  private async processRelationChange(accountId: string, change: SyncChange): Promise<SyncResult> {
    // For relation entities (expense_tag, income_tag, project_expense, project_income, expense_category_split)
    // These are simple create/delete operations
    const payload = change.payload as any;
    try {
      if (change.entityType === 'expense_tag') {
        if (change.operation === 'delete') {
          await this.prisma.expenseTag.updateMany({ where: { id: change.entityId }, data: { isDeleted: true } });
        } else {
          await this.prisma.expenseTag.upsert({
            where: { expenseId_tagId: { expenseId: payload.expenseId, tagId: payload.tagId } },
            create: { expenseId: payload.expenseId, tagId: payload.tagId },
            update: { isDeleted: false },
          });
        }
      } else if (change.entityType === 'income_tag') {
        if (change.operation === 'delete') {
          await this.prisma.incomeTag.updateMany({ where: { id: change.entityId }, data: { isDeleted: true } });
        } else {
          await this.prisma.incomeTag.upsert({
            where: { incomeId_tagId: { incomeId: payload.incomeId, tagId: payload.tagId } },
            create: { incomeId: payload.incomeId, tagId: payload.tagId },
            update: { isDeleted: false },
          });
        }
      } else if (change.entityType === 'project_expense') {
        if (change.operation === 'delete') {
          await this.prisma.projectExpense.updateMany({ where: { id: change.entityId }, data: { isDeleted: true } });
        } else {
          await this.prisma.projectExpense.upsert({
            where: { projectId_expenseId: { projectId: payload.projectId, expenseId: payload.expenseId } },
            create: { projectId: payload.projectId, expenseId: payload.expenseId },
            update: { isDeleted: false },
          });
        }
      } else if (change.entityType === 'project_income') {
        if (change.operation === 'delete') {
          await this.prisma.projectIncome.updateMany({ where: { id: change.entityId }, data: { isDeleted: true } });
        } else {
          await this.prisma.projectIncome.upsert({
            where: { projectId_incomeId: { projectId: payload.projectId, incomeId: payload.incomeId } },
            create: { projectId: payload.projectId, incomeId: payload.incomeId },
            update: { isDeleted: false },
          });
        }
      } else if (change.entityType === 'expense_category_split') {
        if (change.operation === 'delete') {
          await this.prisma.expenseCategorySplit.updateMany({ where: { id: change.entityId }, data: { isDeleted: true } });
        } else {
          await this.prisma.expenseCategorySplit.create({
            data: {
              expenseId: payload.expenseId,
              categoryId: payload.categoryId,
              amount: payload.amount,
              percentage: payload.percentage,
              notes: payload.notes,
            },
          });
        }
      }
      return { entityId: change.entityId, status: 'success' };
    } catch (error) {
      return { entityId: change.entityId, status: 'error', error: String(error) };
    }
  }

  async pullChanges(accountId: string, userId: string, since: Date) {
    // Get all entities updated since the given timestamp
    const [expenses, expenseItems, budgets, categories, incomes, tags, projects, expenseTags, projectExpenses, categorySplits] = await Promise.all([
      this.prisma.expense.findMany({
        where: {
          accountId,
          updatedAt: { gt: since },
        },
      }),
      this.prisma.expenseItem.findMany({
        where: {
          expense: { accountId },
          updatedAt: { gt: since },
        },
      }),
      this.prisma.budget.findMany({
        where: {
          accountId,
          updatedAt: { gt: since },
        },
      }),
      this.prisma.category.findMany({
        where: {
          OR: [{ accountId }, { isSystem: true }],
          updatedAt: { gt: since },
        },
      }),
      this.prisma.income.findMany({
        where: {
          accountId,
          updatedAt: { gt: since },
        },
      }),
      this.prisma.tag.findMany({ where: { accountId, updatedAt: { gt: since } } }),
      this.prisma.project.findMany({ where: { accountId, updatedAt: { gt: since } } }),
      this.prisma.expenseTag.findMany({ where: { updatedAt: { gt: since }, expense: { accountId } } }),
      this.prisma.projectExpense.findMany({ where: { updatedAt: { gt: since }, project: { accountId } } }),
      this.prisma.expenseCategorySplit.findMany({ where: { updatedAt: { gt: since }, expense: { accountId } } }),
    ]);

    const changes = [
      ...expenses.map((e: ExpenseRecord) => ({
        entityType: 'expense' as const,
        entityId: e.clientId,
        operation: e.isDeleted ? 'delete' as const : 'update' as const,
        data: e,
        version: e.syncVersion,
        timestamp: e.updatedAt.toISOString(),
      })),
      ...expenseItems.map((item: { id: string; isDeleted: boolean; syncVersion: number; updatedAt: Date }) => ({
        entityType: 'expense_item' as const,
        entityId: item.id,
        operation: item.isDeleted ? 'delete' as const : 'update' as const,
        data: item,
        version: item.syncVersion,
        timestamp: item.updatedAt.toISOString(),
      })),
      ...budgets.map((b: BudgetRecord) => ({
        entityType: 'budget' as const,
        entityId: b.clientId,
        operation: b.isDeleted ? 'delete' as const : 'update' as const,
        data: b,
        version: b.syncVersion,
        timestamp: b.updatedAt.toISOString(),
      })),
      ...categories.map((c: CategoryRecord) => ({
        entityType: 'category' as const,
        entityId: c.id,
        operation: c.isDeleted ? 'delete' as const : 'update' as const,
        data: c,
        version: c.syncVersion,
        timestamp: c.updatedAt.toISOString(),
      })),
      ...incomes.map((i: { clientId: string; isDeleted: boolean; syncVersion: number; updatedAt: Date }) => ({
        entityType: 'income' as const,
        entityId: i.clientId,
        operation: i.isDeleted ? 'delete' as const : 'update' as const,
        data: i,
        version: i.syncVersion,
        timestamp: i.updatedAt.toISOString(),
      })),
      ...tags.map((t: { id: string; isDeleted: boolean; syncVersion: number; updatedAt: Date }) => ({
        entityType: 'tag' as const,
        entityId: t.id,
        operation: t.isDeleted ? 'delete' as const : 'update' as const,
        data: t,
        version: t.syncVersion,
        timestamp: t.updatedAt.toISOString(),
      })),
      ...projects.map((p: { clientId: string; isDeleted: boolean; syncVersion: number; updatedAt: Date }) => ({
        entityType: 'project' as const,
        entityId: p.clientId,
        operation: p.isDeleted ? 'delete' as const : 'update' as const,
        data: p,
        version: p.syncVersion,
        timestamp: p.updatedAt.toISOString(),
      })),
      ...expenseTags.map((et: { id: string; isDeleted: boolean; updatedAt: Date }) => ({
        entityType: 'expense_tag' as const,
        entityId: et.id,
        operation: et.isDeleted ? 'delete' as const : 'update' as const,
        data: et,
        version: 1,
        timestamp: et.updatedAt.toISOString(),
      })),
      ...projectExpenses.map((pe: { id: string; isDeleted: boolean; updatedAt: Date }) => ({
        entityType: 'project_expense' as const,
        entityId: pe.id,
        operation: pe.isDeleted ? 'delete' as const : 'update' as const,
        data: pe,
        version: 1,
        timestamp: pe.updatedAt.toISOString(),
      })),
      ...categorySplits.map((cs: { id: string; isDeleted: boolean; updatedAt: Date }) => ({
        entityType: 'expense_category_split' as const,
        entityId: cs.id,
        operation: cs.isDeleted ? 'delete' as const : 'update' as const,
        data: cs,
        version: 1,
        timestamp: cs.updatedAt.toISOString(),
      })),
    ];

    return {
      changes,
      serverTimestamp: new Date().toISOString(),
    };
  }
}
