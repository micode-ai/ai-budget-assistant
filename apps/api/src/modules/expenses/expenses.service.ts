import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto, CreateExpenseItemDto, UpdateExpenseItemDto } from './dto';
import { GamificationService } from '../gamification/gamification.service';
import { CacheService } from '../../common/cache/cache.service';
import { AnomalyService } from '../anomaly/anomaly.service';
import { expensePayee, DUP_DAY_MS } from '../anomaly/anomaly.service';
import { MerchantRulesService } from '../merchant-rules/merchant-rules.service';
import { FamilyFeedService } from '../family-feed/family-feed.service';
import { CommunityPriceService } from '../community-prices/community-price.service';
import { InflationShieldTrackingService } from '../insights/inflation-shield-tracking.service';
import { resolveShares } from './trip-share-calculator';
import { buildLocationColumns } from './expense-location.util';
import { invalidateExpenseChatCache } from './expense-cache.util';
import { resolveExpenseCategoryId } from './expense-category-resolver.util';
import { ReceiptSplitService } from '../receipt-split/receipt-split.service';

/**
 * CRUD + fire-and-forget-hooks orchestrator for expenses. `bulkUpdate` lives in
 * ExpenseBulkService, and `mergeExpenses`/`moveToAccount` live in
 * ExpenseCrossAccountService (see docs/tech-debt/expenses-service-god-file.md) —
 * neither needed the gamification/anomaly/family-feed/community-price/shield hook
 * chain this class owns for create/update/remove.
 */

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamificationService: GamificationService,
    private readonly cacheService: CacheService,
    private readonly anomalyService: AnomalyService,
    private readonly merchantRules: MerchantRulesService,
    private readonly receiptSplitService: ReceiptSplitService,
    @Optional() private readonly familyFeed?: FamilyFeedService,
    @Optional() private readonly communityPrices?: CommunityPriceService,
    @Optional() private readonly shieldTracking?: InflationShieldTrackingService,
  ) {}

  private toExpenseResponse(expense: any) {
    const { user, ...rest } = expense;
    return { ...rest, createdByUserName: user?.name ?? null };
  }

  /**
   * Invalidate every chat tool result cached for this account. Touched on
   * any expense mutation since `get_expenses`, `get_budget_status`, and
   * `get_category_breakdown` all read from the expense table.
   */
  private async invalidateChatCache(accountId: string): Promise<void> {
    await invalidateExpenseChatCache(this.cacheService, accountId);
  }

  /**
   * Tier 1 Case A — stub-yield reconciliation.
   * Called AFTER the create transaction commits (to keep the create lock short)
   * and BEFORE anomalyService.checkExpense fires (so detectDuplicateCharge
   * won't see the already-reconciled stub and raise a spurious alert).
   *
   * Finds a non-deleted source:'notification' expense in the same account that
   * satisfies predicate P (same amount + currency + date ±1 day + same payee)
   * and soft-deletes it. SAFETY: only source:'notification' rows are candidates —
   * two genuine non-notification expenses can never delete each other.
   */
  private async reconcileNotificationStub(accountId: string, newExpenseId: string): Promise<void> {
    const e = await this.prisma.expense.findFirst({
      where: { id: newExpenseId, accountId, isDeleted: false },
      select: {
        id: true,
        amount: true,
        currencyCode: true,
        date: true,
        merchant: true,
        description: true,
      },
    });
    if (!e) return;

    const label = expensePayee(e as any);
    if (!label) return; // unidentifiable — never dedup blank vs blank

    const stubs = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        source: 'notification',
        id: { not: e.id },
        amount: e.amount as any,
        currencyCode: e.currencyCode,
        date: {
          gte: new Date((e.date as Date).getTime() - DUP_DAY_MS),
          lte: new Date((e.date as Date).getTime() + DUP_DAY_MS),
        },
      },
      select: { id: true, merchant: true, description: true },
    });

    const stub = stubs.find((s) => expensePayee(s as any) === label);
    if (!stub) return;

    await this.prisma.expense.update({
      where: { id: stub.id },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });

    // The stub may already carry a duplicate_charge alert — drop it so it doesn't
    // dead-end on the now-deleted stub.
    void this.anomalyService.dismissForExpense(accountId, stub.id);

    // Also invalidate the cache since we mutated a row outside the main transaction.
    await this.invalidateChatCache(accountId);
  }

  /**
   * Resolve categoryId: if it's a valid UUID, use as-is.
   * If it's a category name, find or create by name.
   * If it's a mobile default ID (e.g. "default-exp-food---drinks"), extract name and fuzzy match.
   */
  private async resolveCategoryId(categoryId: string | undefined | null, accountId: string): Promise<string | null> {
    return resolveExpenseCategoryId(this.prisma, categoryId, accountId);
  }

  async create(accountId: string, userId: string, dto: CreateExpenseDto): Promise<{ expense: any; isNew: boolean }> {
    const result = await this.prisma.$transaction(async (tx: PrismaClient) => {
      const receiptImage = dto.receiptImageBase64
        ? Buffer.from(dto.receiptImageBase64, 'base64')
        : undefined;
      const receiptMimeType = dto.receiptMimeType || (receiptImage ? 'image/jpeg' : undefined);

      // Check if this is a new expense or an update (for notification dedup)
      const existing = await tx.expense.findUnique({
        where: { accountId_clientId: { accountId, clientId: dto.localId } },
        select: { id: true },
      });
      const isNew = !existing;

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
        merchant: dto.merchant,
        categoryId: resolvedCategoryId,
        date: new Date(dto.date),
        time: dto.time,
        ...buildLocationColumns(dto.location),
        source: dto.source,
        receiptImage,
        receiptMimeType,
        isRecurring: dto.isRecurring ?? false,
        recurringId: dto.recurringId,
        recurringPeriod: dto.recurringPeriod,
        isDebt: dto.isDebt ?? false,
        isDebtRepayment: dto.isDebtRepayment ?? false,
        debtContactName: dto.debtContactName,
        debtDueDate: dto.debtDueDate ? new Date(dto.debtDueDate) : undefined,
        relatedDebtIncomeId: dto.relatedDebtIncomeId,
        paidByUserId: dto.paidByUserId ?? userId,
        // E2EE: pass through encrypted payload if provided
        ...(dto.encryptedPayload !== undefined && { encryptedPayload: dto.encryptedPayload }),
        ...(dto.encryptionKeyVersion !== undefined && { encryptionKeyVersion: dto.encryptionKeyVersion }),
        ...(dto.externalRef !== undefined && { externalRef: dto.externalRef }),
      };

      const updateData = {
          amount: dto.amount,
          discountAmount: dto.discountAmount,
          currencyCode: dto.currencyCode,
          description: dto.description,
          notes: dto.notes,
          merchant: dto.merchant,
          categoryId: resolvedCategoryId,
          date: new Date(dto.date),
          ...buildLocationColumns(dto.location),
          source: dto.source,
          receiptImage,
          receiptMimeType,
          isDeleted: false,
          isRecurring: dto.isRecurring ?? false,
          recurringId: dto.recurringId,
          recurringPeriod: dto.recurringPeriod,
          isDebt: dto.isDebt ?? false,
          isDebtRepayment: dto.isDebtRepayment ?? false,
          debtContactName: dto.debtContactName,
          debtDueDate: dto.debtDueDate ? new Date(dto.debtDueDate) : undefined,
          relatedDebtIncomeId: dto.relatedDebtIncomeId,
          paidByUserId: dto.paidByUserId ?? userId,
          ...(dto.encryptedPayload !== undefined && { encryptedPayload: dto.encryptedPayload }),
          ...(dto.encryptionKeyVersion !== undefined && { encryptionKeyVersion: dto.encryptionKeyVersion }),
        };

      const expense = await tx.expense.upsert({
        where: { accountId_clientId: { accountId, clientId: dto.localId } },
        create: expenseData,
        update: updateData,
        include: { category: true },
      });

      if (dto.items && dto.items.length > 0) {
        await tx.expenseItem.createMany({
          data: dto.items.map((item, index) => ({
            expenseId: expense.id,
            description: item.description,
            canonicalName: item.canonicalName ?? null,
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice ?? 0,
            totalPrice: item.totalPrice,
            sortOrder: item.sortOrder ?? index,
          })),
          skipDuplicates: true,
        });
      }

      // Create tag associations if provided (skip silently if tags don't exist on server yet)
      if (dto.tagIds && dto.tagIds.length > 0) {
        // Filter to only tags that exist on the server
        const existingTags = await tx.tag.findMany({
          where: { id: { in: dto.tagIds } },
          select: { id: true },
        });
        const validTagIds = existingTags.map((t: { id: string }) => t.id);

        if (validTagIds.length > 0) {
          await tx.expenseTag.createMany({
            data: validTagIds.map((tagId: string) => ({
              expenseId: expense.id,
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
          await tx.projectExpense.upsert({
            where: { projectId_expenseId: { projectId: project.id, expenseId: expense.id } },
            create: { projectId: project.id, expenseId: expense.id },
            update: { isDeleted: false },
          });
        }
      }

      // Create category splits if provided (resolve categoryIds like the main expense category)
      if (dto.splits && dto.splits.length > 0) {
        const resolvedSplits = await Promise.all(
          dto.splits.map(async (split) => {
            const resolvedId = await this.resolveCategoryId(split.categoryId, accountId);
            return resolvedId ? { ...split, categoryId: resolvedId } : null;
          }),
        );
        const validSplits = resolvedSplits.filter((s): s is NonNullable<typeof s> => s !== null);
        if (validSplits.length > 0) {
          await tx.expenseCategorySplit.createMany({
            data: validSplits.map(split => ({
              expenseId: expense.id,
              categoryId: split.categoryId,
              amount: split.amount,
              percentage: split.percentage,
              notes: split.notes,
            })),
          });
        }
      }

      const full = await tx.expense.findUnique({
        where: { id: expense.id },
        include: {
          category: true,
          items: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
          expenseTags: { where: { isDeleted: false }, include: { tag: true } },
          categorySplits: { where: { isDeleted: false }, include: { category: true } },
          projectExpenses: { where: { isDeleted: false }, include: { project: true } },
          user: { select: { name: true } },
        },
      });

      // Trip expense shares: always fully replace (delete+recreate), never partial-patch.
      // No-op for every non-trip expense — dto.shares is undefined/empty there.
      if (dto.shares && dto.shares.length > 0 && full) {
        const resolved = resolveShares(Number(full.amount), dto.splitType ?? 'equal', dto.shares);
        await tx.tripExpenseShare.deleteMany({ where: { expenseId: full.id } });
        await tx.tripExpenseShare.createMany({
          data: resolved.map((r) => ({
            expenseId: full.id,
            userId: r.userId,
            shareType: dto.splitType ?? 'equal',
            shareAmount: r.shareAmount,
          })),
        });
      }

      return { expense: this.toExpenseResponse(full), isNew };
    });

    // Fire-and-forget gamification check
    this.gamificationService.checkAchievements(accountId, userId).catch(() => {});

    // Fire-and-forget cache invalidation; never block the create response.
    this.invalidateChatCache(accountId).catch(() => undefined);

    // Fire-and-forget post-create side effects — only for genuinely new expenses.
    // ORDERING IS CRITICAL: reconcileNotificationStub must run BEFORE checkExpense
    // so detectDuplicateCharge sees the stub already gone (isDeleted:true) and
    // does not raise a spurious duplicate_charge alert for the auto-reconciled pair.
    if (result.isNew && result.expense) {
      const run = async () => {
        if (result.expense.source !== 'notification') {
          // Case A: a richer source supersedes the stub. Soft-delete any matching
          // source:'notification' stub. SAFETY: query is hard-scoped to notification
          // rows — two genuine non-notification expenses can never delete each other.
          await this.reconcileNotificationStub(accountId, result.expense.id).catch(() => {});
        }
        await this.anomalyService.checkExpense(accountId, userId, result.expense.id).catch(() => {});
      };
      run().catch(() => {});

      // fire-and-forget: record in family feed (non-personal accounts only)
      void this.familyFeed
        ?.recordEvent(accountId, userId, 'EXPENSE_ADDED', result.expense.id, {
          amount: Number(result.expense.amount),
          currency: result.expense.currencyCode,
        })
        .catch(() => {});

      // fire-and-forget: contribute to the community price corpus (ABA-335,
      // consent + location + E2EE gated inside the service; never throws)
      void this.communityPrices
        ?.recordContribution(accountId, userId, result.expense.id)
        .catch(() => {});

      // fire-and-forget: credit any active inflation-shield recommendation this
      // purchase acts on (realized-savings tracking). Never throws into create.
      void this.shieldTracking
        ?.reconcilePurchase(accountId, result.expense.id)
        .catch(() => {});

      // A new expense changes the shield's inputs (new price point) and may have
      // just reconciled a recommendation — bust the cached shield so the next read
      // recomputes. Fire-and-forget; never blocks create.
      void this.cacheService.delByPrefix(`shield:${accountId}:`).catch(() => {});
    }

    return result;
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
    if (filters.isDebt !== undefined) {
      where.isDebt = filters.isDebt;
    }
    if (filters.isDebtRepayment !== undefined) {
      where.isDebtRepayment = filters.isDebtRepayment;
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
          merchant: true,
          date: true,
          time: true,
          locationLat: true,
          locationLng: true,
          locationName: true,
          receiptUrl: true,
          isRecurring: true,
          recurringId: true,
          recurringPeriod: true,
          source: true,
          externalRef: true,
          isDebt: true,
          isDebtRepayment: true,
          isPlanned: true,
          isSplitReceivable: true,
          paidByUserId: true,
          debtContactName: true,
          debtDueDate: true,
          relatedDebtIncomeId: true,
          isDeleted: true,
          syncVersion: true,
          encryptedPayload: true,
          encryptionKeyVersion: true,
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
          projectExpenses: {
            where: { isDeleted: false },
            include: { project: true },
          },
          user: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data: expenses.map(e => this.toExpenseResponse(e)),
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
        projectExpenses: { where: { isDeleted: false }, include: { project: true } },
        user: { select: { name: true } },
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return this.toExpenseResponse(expense);
  }

  async update(accountId: string, id: string, dto: UpdateExpenseDto) {
    const expense = await this.findOne(accountId, id);
    const resolvedCategoryId = dto.categoryId !== undefined
      ? await this.resolveCategoryId(dto.categoryId, accountId)
      : undefined;

    return this.prisma.$transaction(async (tx: PrismaClient) => {
      const expenseUpdateData = {
          amount: dto.amount,
          discountAmount: dto.discountAmount,
          currencyCode: dto.currencyCode,
          description: dto.description,
          notes: dto.notes,
          merchant: dto.merchant === undefined ? undefined : dto.merchant,
          categoryId: resolvedCategoryId,
          date: dto.date ? new Date(dto.date) : undefined,
          time: dto.time,
          ...buildLocationColumns(dto.location),
          isRecurring: dto.isRecurring,
          recurringId: dto.recurringId,
          recurringPeriod: dto.recurringPeriod,
          isDebt: dto.isDebt,
          isDebtRepayment: dto.isDebtRepayment,
          debtContactName: dto.debtContactName,
          debtDueDate: dto.debtDueDate ? new Date(dto.debtDueDate) : dto.debtDueDate === null ? null : undefined,
          relatedDebtIncomeId: dto.relatedDebtIncomeId,
          paidByUserId: dto.paidByUserId,
          syncVersion: { increment: 1 },
          ...(dto.encryptedPayload !== undefined && { encryptedPayload: dto.encryptedPayload }),
          ...(dto.encryptionKeyVersion !== undefined && { encryptionKeyVersion: dto.encryptionKeyVersion }),
        };

      await tx.expense.update({
        where: { id: expense.id },
        data: expenseUpdateData,
      });

      // Update tag associations if provided
      if (dto.tagIds !== undefined) {
        // Soft-delete existing expense tags
        await tx.expenseTag.updateMany({
          where: { expenseId: expense.id, isDeleted: false },
          data: { isDeleted: true },
        });

        // Create new expense tags (skip tags that don't exist on server yet)
        if (dto.tagIds.length > 0) {
          const existingTags = await tx.tag.findMany({
            where: { id: { in: dto.tagIds } },
            select: { id: true },
          });
          const validTagIds = existingTags.map((t: { id: string }) => t.id);

          if (validTagIds.length > 0) {
            await tx.expenseTag.createMany({
              data: validTagIds.map((tagId: string) => ({
                expenseId: expense.id,
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
        // Soft-delete existing project associations
        await tx.projectExpense.updateMany({
          where: { expenseId: expense.id, isDeleted: false },
          data: { isDeleted: true },
        });
        // Create new association if projectId is not null (skip if project doesn't exist on server yet)
        if (dto.projectId) {
          const projectExists = await tx.project.findUnique({
            where: { id: dto.projectId },
            select: { id: true },
          });
          if (projectExists) {
            await tx.projectExpense.upsert({
              where: { projectId_expenseId: { projectId: dto.projectId, expenseId: expense.id } },
              create: { projectId: dto.projectId, expenseId: expense.id },
              update: { isDeleted: false },
            });
          }
        }
      }

      // Trip expense shares: always fully replace (delete+recreate) on edit — never
      // partially patched. No-op for every non-trip expense — dto.shares is undefined there.
      if (dto.shares && dto.shares.length > 0) {
        const resolved = resolveShares(
          Number(dto.amount ?? expense.amount),
          dto.splitType ?? 'equal',
          dto.shares,
        );
        await tx.tripExpenseShare.deleteMany({ where: { expenseId: expense.id } });
        await tx.tripExpenseShare.createMany({
          data: resolved.map((r) => ({
            expenseId: expense.id,
            userId: r.userId,
            shareType: dto.splitType ?? 'equal',
            shareAmount: r.shareAmount,
          })),
        });
      }

      return tx.expense.findUnique({
        where: { id: expense.id },
        include: {
          category: true,
          items: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
          expenseTags: { where: { isDeleted: false }, include: { tag: true } },
          categorySplits: { where: { isDeleted: false }, include: { category: true } },
          projectExpenses: { where: { isDeleted: false }, include: { project: true } },
          user: { select: { name: true } },
        },
      });
    }).then((updated) => {
      this.invalidateChatCache(accountId).catch(() => undefined);
      if (updated?.merchant && dto.categoryId !== undefined && resolvedCategoryId) {
        const merchantNormalized = updated.merchant.trim().toLowerCase();
        this.merchantRules.upsertRule(accountId, merchantNormalized, resolvedCategoryId).catch(() => undefined);
      }
      return updated ? this.toExpenseResponse(updated) : updated;
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

    this.invalidateChatCache(accountId).catch(() => undefined);
    // Resolving a duplicate by deleting the expense must also clear any anomaly
    // alert that deep-links to it, or the alert dead-ends on "Expense not found".
    void this.anomalyService.dismissForExpense(accountId, expense.id);
    // A deleted receipt's guest split links must stop resolving. isDeleted does NOT
    // fire the Prisma onDelete:Cascade (that only fires on a genuine hard delete),
    // so the split's debt rows and participant expiry must be handled explicitly.
    // No-ops when the expense was never split. void-and-never-throw, same shape as
    // dismissForExpense above. Real DI (ExpensesModule imports ReceiptSplitModule;
    // no cycle — see expenses.module.ts), not a standalone-function import: the
    // module-cycle check confirmed DebtsModule (ReceiptSplitModule's only
    // dependency) imports nothing, so there is no path back to ExpensesModule.
    void this.receiptSplitService.expireForExpense(expense.id);

    return { success: true };
  }

  async stopRecurring(accountId: string, id: string) {
    const expense = await this.findOne(accountId, id);
    await this.prisma.expense.update({
      where: { id: expense.id },
      data: { isRecurring: false, syncVersion: { increment: 1 } },
    });
    this.invalidateChatCache(accountId).catch(() => undefined);
    return { id: expense.id, isRecurring: false };
  }

  async getByClientId(accountId: string, clientId: string) {
    return this.prisma.expense.findUnique({
      where: { accountId_clientId: { accountId, clientId } },
    });
  }

  // ---- Expense Items CRUD ----

  /**
   * Resolve an expense addressed by either its server PK or its `clientId`
   * (mobile addresses every row by its LOCAL id) down to the server PK, while
   * enforcing account ownership. `expense_items.expenseId` is an FK to
   * `expenses.id`, so item queries MUST use the resolved PK — passing the raw
   * route param silently returns nothing for every app-created expense.
   * Mirrors the `OR:[{id},{clientId}]` lookup in `getReceiptImage`.
   */
  private async resolveExpensePk(accountId: string, id: string): Promise<string> {
    const expense = await this.prisma.expense.findFirst({
      where: {
        accountId,
        isDeleted: false,
        OR: [{ id }, { clientId: id }],
      },
      select: { id: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense.id;
  }

  async getItems(accountId: string, expenseId: string) {
    const expensePk = await this.resolveExpensePk(accountId, expenseId);
    return this.prisma.expenseItem.findMany({
      where: { expenseId: expensePk, isDeleted: false },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createItem(accountId: string, expenseId: string, dto: CreateExpenseItemDto) {
    const expensePk = await this.resolveExpensePk(accountId, expenseId);
    return this.prisma.expenseItem.create({
      data: {
        expenseId: expensePk,
        description: dto.description,
        quantity: dto.quantity ?? 1,
        unitPrice: dto.unitPrice ?? 0,
        totalPrice: dto.totalPrice,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateItem(accountId: string, expenseId: string, itemId: string, dto: UpdateExpenseItemDto) {
    const expensePk = await this.resolveExpensePk(accountId, expenseId);
    const item = await this.prisma.expenseItem.findFirst({
      where: { id: itemId, expenseId: expensePk, isDeleted: false },
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
    const expensePk = await this.resolveExpensePk(accountId, expenseId);
    const item = await this.prisma.expenseItem.findFirst({
      where: { id: itemId, expenseId: expensePk, isDeleted: false },
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
      select: { receiptImage: true, receiptMimeType: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    if (!expense.receiptImage) throw new NotFoundException('No receipt image found');
    return {
      imageBase64: expense.receiptImage.toString('base64'),
      mimeType: expense.receiptMimeType || 'image/jpeg',
    };
  }

  async saveReceiptImage(
    accountId: string,
    expenseId: string,
    imageBase64: string,
    mimeType?: string,
  ) {
    const expense = await this.findOne(accountId, expenseId);
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    await this.prisma.expense.update({
      where: { id: expense.id },
      data: {
        receiptImage: imageBuffer,
        receiptMimeType: mimeType ?? 'image/jpeg',
        syncVersion: { increment: 1 },
      },
    });
    return { success: true };
  }

  async deleteReceiptImage(accountId: string, expenseId: string) {
    const expense = await this.findOne(accountId, expenseId);
    await this.prisma.expense.update({
      where: { id: expense.id },
      data: {
        receiptImage: null,
        receiptMimeType: null,
        syncVersion: { increment: 1 },
      },
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

    return this.prisma.$transaction(async (tx: PrismaClient) => {
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

      const result = await tx.expense.findUnique({
        where: { id: expenseId },
        include: {
          category: true,
          items: { where: { isDeleted: false } },
          expenseTags: { where: { isDeleted: false }, include: { tag: true } },
          categorySplits: { where: { isDeleted: false }, include: { category: true } },
          projectExpenses: { where: { isDeleted: false }, include: { project: true } },
          user: { select: { name: true } },
        },
      });
      return result ? this.toExpenseResponse(result) : result;
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
