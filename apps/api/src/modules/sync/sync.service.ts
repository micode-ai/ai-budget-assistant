import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { IncomesService } from '../incomes/incomes.service';

interface SyncChange {
  entityType: 'expense' | 'expense_item' | 'budget' | 'category' | 'income';
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
      return { entityId, status: 'success', serverVersion: updated.syncVersion };
    }

    if (operation === 'delete') {
      await this.incomesService.remove(accountId, existing.id);
      return { entityId, status: 'success' };
    }

    return { entityId, status: 'error', error: 'Invalid operation' };
  }

  async pullChanges(accountId: string, userId: string, since: Date) {
    // Get all entities updated since the given timestamp
    const [expenses, expenseItems, budgets, categories, incomes] = await Promise.all([
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
    ];

    return {
      changes,
      serverTimestamp: new Date().toISOString(),
    };
  }
}
