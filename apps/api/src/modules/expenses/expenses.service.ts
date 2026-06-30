import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto, CreateExpenseItemDto, UpdateExpenseItemDto, BulkUpdateExpensesDto, MergeExpensesDto } from './dto';
import { GamificationService } from '../gamification/gamification.service';
import { CacheService } from '../../common/cache/cache.service';
import { AnomalyService } from '../anomaly/anomaly.service';
import { expensePayee, DUP_DAY_MS } from '../anomaly/anomaly.service';
import { MerchantRulesService } from '../merchant-rules/merchant-rules.service';
import { FamilyFeedService } from '../family-feed/family-feed.service';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamificationService: GamificationService,
    private readonly cacheService: CacheService,
    private readonly anomalyService: AnomalyService,
    private readonly merchantRules: MerchantRulesService,
    @Optional() private readonly familyFeed?: FamilyFeedService,
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
    if (!accountId) return;
    await Promise.all([
      this.cacheService.delByPrefix(`chat:get_expenses:${accountId}:`),
      this.cacheService.delByPrefix(`chat:get_budget_status:${accountId}:`),
      this.cacheService.delByPrefix(`chat:get_category_breakdown:${accountId}:`),
      this.cacheService.del(`uc:${accountId}`),
    ]);
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

    // Also invalidate the cache since we mutated a row outside the main transaction.
    await this.invalidateChatCache(accountId);
  }

  /**
   * Resolve categoryId: if it's a valid UUID, use as-is.
   * If it's a category name, find or create by name.
   * If it's a mobile default ID (e.g. "default-exp-food---drinks"), extract name and fuzzy match.
   */
  private async resolveCategoryId(categoryId: string | undefined | null, accountId: string): Promise<string | null> {
    if (!categoryId) return null;
    // UUID v4 pattern — validate ownership before trusting the id
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
      const owned = await this.prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true, accountId: true },
      });
      return owned?.accountId === accountId ? owned.id : null;
    }
    // Try exact name match scoped to this account
    const category = await this.prisma.category.findFirst({
      where: { accountId, name: { equals: categoryId, mode: 'insensitive' } },
    });
    if (category) return category.id;

    // Handle mobile default IDs (e.g. "default-exp-bills---utilities" → search "bills", "utilities")
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
      const type = categoryId.toLowerCase().includes('income') ? 'income' : 'expense';
      const created = await this.prisma.category.create({
        data: { accountId, name: categoryId, type },
      });
      return created.id;
    }

    return null;
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
        locationLat: dto.location?.lat,
        locationLng: dto.location?.lng,
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
          receiptUrl: true,
          isRecurring: true,
          recurringId: true,
          recurringPeriod: true,
          source: true,
          isDebt: true,
          isDebtRepayment: true,
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
          locationLat: dto.location?.lat,
          locationLng: dto.location?.lng,
          isRecurring: dto.isRecurring,
          recurringId: dto.recurringId,
          recurringPeriod: dto.recurringPeriod,
          isDebt: dto.isDebt,
          isDebtRepayment: dto.isDebtRepayment,
          debtContactName: dto.debtContactName,
          debtDueDate: dto.debtDueDate ? new Date(dto.debtDueDate) : dto.debtDueDate === null ? null : undefined,
          relatedDebtIncomeId: dto.relatedDebtIncomeId,
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

    return { success: true };
  }

  async bulkUpdate(accountId: string, dto: BulkUpdateExpensesDto): Promise<{ updated: number }> {
    const { ids, categoryId, tagIds, isDeleted } = dto;

    // IDs from the mobile client may be server PKs OR local clientIds (offline-first).
    // Resolve against both — mirrors findOne()'s `OR: [{ id }, { clientId: id }]`.
    // Matching only on `id` silently no-ops bulk delete/update for every synced expense.
    const owned = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        OR: [{ id: { in: ids } }, { clientId: { in: ids } }],
      },
      select: { id: true },
    });
    const ownedIds = owned.map((e) => e.id);
    if (ownedIds.length === 0) return { updated: 0 };

    const now = new Date();
    const updateData: Record<string, any> = { updatedAt: now };

    if (isDeleted === true) {
      updateData.isDeleted = true;
    } else {
      if (categoryId !== undefined) {
        if (categoryId === null) {
          updateData.categoryId = null;
        } else {
          const resolved = await this.resolveCategoryId(categoryId, accountId);
          updateData.categoryId = resolved;
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.expense.updateMany({
        where: { id: { in: ownedIds }, accountId },
        data: updateData,
      });

      if (!isDeleted && tagIds !== undefined && tagIds.length > 0) {
        // tagIds may be server PKs or mobile clientIds — resolve both.
        const validTags = await tx.tag.findMany({
          where: { accountId, OR: [{ id: { in: tagIds } }, { clientId: { in: tagIds } }] },
          select: { id: true },
        });
        const validTagIds = validTags.map((t) => t.id);

        for (const expenseId of ownedIds) {
          for (const tagId of validTagIds) {
            await tx.expenseTag.upsert({
              where: { expenseId_tagId: { expenseId, tagId } },
              create: { expenseId, tagId },
              update: {},
            });
          }
        }
      }
    });

    await this.invalidateChatCache(accountId);
    return { updated: ownedIds.length };
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

  async getItems(accountId: string, expenseId: string) {
    await this.findOne(accountId, expenseId);
    return this.prisma.expenseItem.findMany({
      where: { expenseId, isDeleted: false },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createItem(accountId: string, expenseId: string, dto: CreateExpenseItemDto) {
    await this.findOne(accountId, expenseId);
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

  async updateItem(accountId: string, expenseId: string, itemId: string, dto: UpdateExpenseItemDto) {
    await this.findOne(accountId, expenseId);
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

  async removeItem(accountId: string, expenseId: string, itemId: string) {
    await this.findOne(accountId, expenseId);
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

  /**
   * Tier 2 — user-confirmed cross-currency merge.
   * Resolves both keepId and mergeId via OR:[{id},{clientId}] (mirrors bulkUpdate),
   * gap-fills survivor fields from the merged row, unions tags, carries over the
   * project association, then soft-deletes the secondary and bumps both syncVersions
   * so the standard pull-merge propagates the change to all devices.
   * Currency of the survivor is whatever the caller picked via keepId — no FX conversion.
   */
  async mergeExpenses(accountId: string, _userId: string, dto: MergeExpensesDto): Promise<{ keptId: string; mergedId: string }> {
    const { keepId, mergeId, fieldChoices } = dto;
    if (keepId === mergeId) {
      throw new BadRequestException('keepId and mergeId must be different');
    }

    const result = await this.prisma.$transaction(async (tx: any) => {
      // Resolve both ids by server PK or clientId, scoped to this account.
      const [keepRow, mergeRow] = await Promise.all([
        tx.expense.findFirst({
          where: { accountId, isDeleted: false, OR: [{ id: keepId }, { clientId: keepId }] },
          include: {
            expenseTags: { where: { isDeleted: false }, select: { tagId: true } },
            projectExpenses: { where: { isDeleted: false }, select: { projectId: true } },
          },
        }),
        tx.expense.findFirst({
          where: { accountId, isDeleted: false, OR: [{ id: mergeId }, { clientId: mergeId }] },
          include: {
            expenseTags: { where: { isDeleted: false }, select: { tagId: true } },
            projectExpenses: { where: { isDeleted: false }, select: { projectId: true } },
          },
        }),
      ]);

      if (!keepRow) throw new NotFoundException(`Expense to keep not found: ${keepId}`);
      if (!mergeRow) throw new NotFoundException(`Expense to merge not found: ${mergeId}`);

      // Extra safety: both must be in this account (the query already scopes by accountId,
      // but be explicit so a crafted mergeId from another account is rejected loudly).
      if (keepRow.accountId !== accountId || mergeRow.accountId !== accountId) {
        throw new NotFoundException('One or both expenses do not belong to this account');
      }

      const now = new Date();

      // Gap-fill: carry over fields from the merged row if the survivor lacks them
      // (or if the caller explicitly forced the field via fieldChoices).
      const carriedFields: Record<string, any> = {};
      if ((fieldChoices?.merchant === true || !keepRow.merchant) && mergeRow.merchant) {
        carriedFields.merchant = mergeRow.merchant;
      }
      if ((fieldChoices?.notes === true || !keepRow.notes) && mergeRow.notes) {
        carriedFields.notes = mergeRow.notes;
      }
      if ((fieldChoices?.categoryId === true || !keepRow.categoryId) && mergeRow.categoryId) {
        carriedFields.categoryId = mergeRow.categoryId;
      }
      if ((fieldChoices?.receiptImage === true || !keepRow.receiptImage) && mergeRow.receiptImage) {
        carriedFields.receiptImage = mergeRow.receiptImage;
        carriedFields.receiptMimeType = mergeRow.receiptMimeType;
      }

      // Tags: union — upsert every tag from the merged row onto the survivor.
      const existingTagIds = new Set(keepRow.expenseTags.map((et: any) => et.tagId));
      for (const et of mergeRow.expenseTags) {
        if (!existingTagIds.has(et.tagId)) {
          await tx.expenseTag.upsert({
            where: { expenseId_tagId: { expenseId: keepRow.id, tagId: et.tagId } },
            create: { expenseId: keepRow.id, tagId: et.tagId },
            update: {},
          });
        }
      }

      // Project carry-over: upsert the merge row's project association onto the survivor
      // (only if the survivor doesn't already have a project association, or fieldChoices forces).
      const keepHasProject = keepRow.projectExpenses.length > 0;
      if ((fieldChoices?.projectId === true || !keepHasProject) && mergeRow.projectExpenses.length > 0) {
        for (const pe of mergeRow.projectExpenses) {
          await tx.projectExpense.upsert({
            where: { projectId_expenseId: { projectId: pe.projectId, expenseId: keepRow.id } },
            create: { projectId: pe.projectId, expenseId: keepRow.id },
            update: { isDeleted: false },
          });
        }
      }

      // Soft-delete the secondary row and bump its syncVersion.
      await tx.expense.update({
        where: { id: mergeRow.id },
        data: { isDeleted: true, syncVersion: { increment: 1 } },
      });

      // Enrich the survivor with any carried fields and bump its syncVersion.
      await tx.expense.update({
        where: { id: keepRow.id },
        data: { ...carriedFields, syncVersion: { increment: 1 }, updatedAt: now },
      });

      return { keptId: keepRow.id, mergedId: mergeRow.id };
    });

    await this.invalidateChatCache(accountId);
    return result;
  }
}
