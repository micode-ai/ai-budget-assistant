import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { IncomesService } from '../incomes/incomes.service';
import { CommunityPriceService } from '../community-prices/community-price.service';
import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult, ExpenseRecord, BudgetRecord, CategoryRecord } from './sync-types';
import { SYNC_ENTITY_HANDLERS } from './handlers';

export type { SyncResult, ExpenseRecord, BudgetRecord, CategoryRecord } from './sync-types';

type RelationChange = Extract<
  SyncChange,
  { entityType: 'expense_tag' | 'income_tag' | 'project_expense' | 'project_income' | 'expense_category_split' }
>;

/**
 * Orchestrates offline-sync push/pull. Per-entity logic (encryption
 * handling, syncVersion conflict resolution, clientId resolution) lives in
 * modules/sync/handlers/ — one file per entityType, looked up via the
 * SYNC_ENTITY_HANDLERS registry — so this class stays the thin dispatcher +
 * relation-junction handler + pull-side snapshot builder.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expensesService: ExpensesService,
    private readonly incomesService: IncomesService,
    @Optional() private readonly communityPrices?: CommunityPriceService,
  ) {}

  private get handlerContext(): SyncHandlerContext {
    return {
      prisma: this.prisma,
      expensesService: this.expensesService,
      incomesService: this.incomesService,
      communityPrices: this.communityPrices,
      logger: this.logger,
    };
  }

  async pushChanges(accountId: string, userId: string, changes: SyncChange[]): Promise<SyncResult[]> {
    const BATCH_SIZE = 10;
    const results: SyncResult[] = [];

    for (let i = 0; i < changes.length; i += BATCH_SIZE) {
      const batch = changes.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((change) =>
          this.processChange(accountId, userId, change).catch((error) => ({
            entityId: change.entityId,
            status: 'error' as const,
            error: error instanceof Error ? error.message : 'Unknown error',
          })),
        ),
      );
      results.push(...batchResults);
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
      case 'expense_tag':
      case 'income_tag':
      case 'project_expense':
      case 'project_income':
      case 'expense_category_split':
        return this.processRelationChange(accountId, change);
      default: {
        const handler = SYNC_ENTITY_HANDLERS[change.entityType];
        if (!handler) {
          return {
            entityId: change.entityId,
            status: 'error',
            error: `Unknown entity type: ${(change as SyncChange).entityType}`,
          };
        }
        return handler(this.handlerContext, accountId, userId, change);
      }
    }
  }

  private async processRelationChange(accountId: string, change: RelationChange): Promise<SyncResult> {
    try {
      if (change.entityType === 'expense_tag') {
        const { payload } = change;
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
        const { payload } = change;
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
        const { payload } = change;
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
        const { payload } = change;
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
        const { payload } = change;
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
              encryptedPayload: change.encryptedPayload,
              encryptionKeyVersion: change.encryptionKeyVersion,
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
    const [expenses, expenseItems, budgets, categories, incomes, tags, projects, expenseTags, projectExpenses, categorySplits, portfolioHoldings, investmentTransactions, shoppingLists, shoppingListItems] = await Promise.all([
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
      this.prisma.portfolioHolding.findMany({ where: { accountId, updatedAt: { gt: since } }, include: { asset: true } }),
      this.prisma.investmentTransaction.findMany({ where: { accountId, updatedAt: { gt: since } } }),
      this.prisma.shoppingList.findMany({ where: { accountId, updatedAt: { gt: since } } }),
      this.prisma.shoppingListItem.findMany({ where: { accountId, updatedAt: { gt: since } }, include: { shoppingList: { select: { clientId: true } } } }),
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
      ...portfolioHoldings.map((h: { clientId: string; isDeleted: boolean; syncVersion: number; updatedAt: Date }) => ({
        entityType: 'portfolio_holding' as const,
        entityId: h.clientId,
        operation: h.isDeleted ? 'delete' as const : 'update' as const,
        data: h,
        version: h.syncVersion,
        timestamp: h.updatedAt.toISOString(),
      })),
      ...investmentTransactions.map((t: { clientId: string; isDeleted: boolean; syncVersion: number; updatedAt: Date }) => ({
        entityType: 'investment_transaction' as const,
        entityId: t.clientId,
        operation: t.isDeleted ? 'delete' as const : 'update' as const,
        data: t,
        version: t.syncVersion,
        timestamp: t.updatedAt.toISOString(),
      })),
      ...shoppingLists.map((l: { clientId: string; isDeleted: boolean; syncVersion: number; updatedAt: Date }) => ({
        entityType: 'shopping_list' as const,
        entityId: l.clientId,
        operation: l.isDeleted ? 'delete' as const : 'update' as const,
        data: l,
        version: l.syncVersion,
        timestamp: l.updatedAt.toISOString(),
      })),
      ...shoppingListItems.map((it: { clientId: string; isDeleted: boolean; syncVersion: number; updatedAt: Date; shoppingList: { clientId: string } }) => ({
        entityType: 'shopping_list_item' as const,
        entityId: it.clientId,
        operation: it.isDeleted ? 'delete' as const : 'update' as const,
        data: { ...it, shoppingListId: it.shoppingList.clientId },
        version: it.syncVersion,
        timestamp: it.updatedAt.toISOString(),
      })),
    ];

    return {
      changes,
      serverTimestamp: new Date().toISOString(),
    };
  }
}
