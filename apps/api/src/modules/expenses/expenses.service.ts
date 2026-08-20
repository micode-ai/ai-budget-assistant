import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto, CreateExpenseItemDto, UpdateExpenseItemDto } from './dto';
import { GamificationService } from '../gamification/gamification.service';
import { CacheService } from '../../common/cache/cache.service';
import { AnomalyService } from '../anomaly/anomaly.service';
import { MerchantRulesService } from '../merchant-rules/merchant-rules.service';
import { resolveShares } from './trip-share-calculator';
import { buildCategorySplits, rescaleSplits } from '../../common/utils/receipt-category-split';
import { buildLocationColumns } from './expense-location.util';
import { invalidateExpenseChatCache } from './expense-cache.util';
import { resolveExpenseCategoryId } from './expense-category-resolver.util';
import { ReceiptSplitService } from '../receipt-split/receipt-split.service';
import { ExpenseCreatedHooksService, LearnableExpenseItem } from './expense-created-hooks.service';

/**
 * CRUD orchestrator for expenses. `bulkUpdate` lives in ExpenseBulkService,
 * `mergeExpenses`/`moveToAccount` live in ExpenseCrossAccountService, and the
 * post-create fire-and-forget hook chain (anomaly check, family-feed,
 * community-prices, inflation-shield tracking, product-rule learning) lives in
 * ExpenseCreatedHooksService (see
 * docs/tech-debt/expenses-service-regrowth-after-split.md) — none of that needs
 * to live on this class. A new "what happens after an expense is created"
 * feature belongs in ExpenseCreatedHooksService, not here.
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
    private readonly createdHooks: ExpenseCreatedHooksService,
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
   * Resolve categoryId: if it's a valid UUID, use as-is.
   * If it's a category name, find or create by name.
   * If it's a mobile default ID (e.g. "default-exp-food---drinks"), extract name and fuzzy match.
   */
  private async resolveCategoryId(categoryId: string | undefined | null, accountId: string): Promise<string | null> {
    return resolveExpenseCategoryId(this.prisma, categoryId, accountId);
  }

  /**
   * Re-derives an expense's category splits from its persisted line-item
   * categories, and removes them when they can no longer be derived.
   *
   * The auto-split rests on one invariant: Σ split amounts === expense amount,
   * exactly, to the cent. `analytics.service.ts` computes the period total from
   * `expense.amount` (line 194) but groups by splits (line 218), so a set that
   * does not add up makes the breakdown disagree with the total and corrupts
   * every percentage the user sees. Creation enforces the invariant; this is
   * what defends it afterwards, on the two paths that can break it — an amount
   * edit and an item edit.
   *
   * Re-derivation is exactly why `expense_items.category_id` is persisted (see
   * the design spec's Storage section) — no LLM call is involved. It degrades to
   * removal on its own: when the items no longer reconcile with the amount,
   * `buildCategorySplits`'s tolerance gate returns `[]` and the split disappears.
   * Refusing to show a split beats showing a wrong one — the same philosophy as
   * the tolerance gate itself.
   *
   * All arithmetic comes from `buildCategorySplits`; nothing here computes,
   * rounds or redistributes an amount.
   *
   * Account scoping lives in the caller: `expensePk` is always the output of
   * `findOne`/`resolveExpenseRow`, both of which filter on `accountId`.
   * `expense_items` and `expense_category_splits` carry no accountId of their
   * own and are scoped through that resolved expense PK, exactly like every
   * other item query in this class.
   *
   * @param client the Prisma client, or an open transaction client when the
   *   caller already has one (`update()` re-derives inside its transaction so a
   *   failure rolls the amount edit back with it).
   */
  private async rebuildCategorySplits(
    client: Pick<PrismaClient, 'expenseCategorySplit' | 'expenseItem' | 'expense'>,
    expensePk: string,
    total: number,
  ): Promise<void> {
    const existing = await client.expenseCategorySplit.findMany({
      where: { expenseId: expensePk, isDeleted: false },
      select: { id: true, categoryId: true, amount: true },
    });
    // An expense that was never split has no invariant to defend — and must not
    // acquire one as a side effect of an unrelated edit.
    if (existing.length === 0) return;

    // Read here rather than take it from a caller: `total` is post-discount
    // while the stored line items are priced pre-discount, so re-deriving
    // without it would fail the tolerance gate and delete the split of every
    // receipt that carried a basket coupon — on an edit that had nothing to do
    // with its categories.
    const expense = await client.expense.findUnique({
      where: { id: expensePk },
      select: { discountAmount: true },
    });

    const items = await client.expenseItem.findMany({
      where: { expenseId: expensePk, isDeleted: false },
      orderBy: { sortOrder: 'asc' },
      select: {
        totalPrice: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    });

    // Two kinds of split live in this table and they need opposite treatment.
    //
    // A split DERIVED from a receipt's line items is rebuilt from those items:
    // they are the ground truth for which money sits in which category, and if
    // they no longer reconcile with the new total, buildCategorySplits refuses
    // and the split is removed — better none than a wrong one.
    //
    // A split the user made BY HAND has no item categories behind it (a manual
    // split is created on an expense with no line items at all). There is
    // nothing to derive from, so rebuilding would delete the user's own work on
    // any amount edit. It is redistributed proportionally instead.
    const derivedFromItems = items.some((item) => !!item.categoryId);

    const splits = derivedFromItems
      ? buildCategorySplits({
          items: items.map((item, index) => ({
            index,
            amount: Number(item.totalPrice),
            categoryId: item.categoryId,
            categoryName: item.category?.name ?? null,
          })),
          total,
          discount: expense?.discountAmount != null ? Number(expense.discountAmount) : null,
        })
      : rescaleSplits(
          existing.map((split) => ({ categoryId: split.categoryId, amount: Number(split.amount) })),
          total,
        );

    await client.expenseCategorySplit.updateMany({
      where: { expenseId: expensePk, isDeleted: false },
      data: { isDeleted: true },
    });

    if (splits.length > 0) {
      await client.expenseCategorySplit.createMany({
        data: splits.map((split) => ({
          expenseId: expensePk,
          categoryId: split.categoryId,
          amount: split.amount,
          percentage: split.percentage,
        })),
      });
    }
  }

  async create(accountId: string, userId: string, dto: CreateExpenseDto): Promise<{ expense: any; isNew: boolean }> {
    // Populated inside the transaction below (one resolved id per dto.items
    // entry, same index) and read again afterwards by the post-create
    // fire-and-forget rule-learning block — see the comment there.
    let resolvedItemCategoryIds: Array<string | null> = [];

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
        // Items address a category by the client's own local id — the same
        // reason dto.categoryId (above) and dto.splits[].categoryId (below) are
        // resolved before being written. resolveCategoryId always runs against
        // `this.prisma` (the outer, non-transactional client), never `tx`, so
        // this works the same whether or not the account has the category yet.
        //
        // Resolved once per DISTINCT value, sequentially — never a Promise.all
        // over the raw list. Receipt lines routinely repeat a category (that is
        // the whole point of grouping them), and resolveCategoryId AUTO-CREATES
        // a category when a name-style id matches nothing. Two lines carrying
        // the same not-yet-existing name would both miss the findFirst, both
        // create, and one would throw P2002 against
        // `@@unique([accountId, name, type])`. Inside this $transaction callback
        // that rejection aborts the whole create, so the user's receipt save
        // 500s — reachable whenever a local-only category is picked for two or
        // more lines in ItemCategorySheet. Deduplicating also removes N-1
        // redundant round-trips per receipt.
        const distinctItemCategoryIds = Array.from(
          new Set(dto.items.map((item) => item.categoryId).filter((c): c is string => !!c)),
        );
        const resolvedByRawId = new Map<string, string | null>();
        for (const rawCategoryId of distinctItemCategoryIds) {
          resolvedByRawId.set(rawCategoryId, await this.resolveCategoryId(rawCategoryId, accountId));
        }
        resolvedItemCategoryIds = dto.items.map((item) =>
          item.categoryId ? resolvedByRawId.get(item.categoryId) ?? null : null,
        );
        await tx.expenseItem.createMany({
          data: dto.items.map((item, index) => ({
            expenseId: expense.id,
            description: item.description,
            canonicalName: item.canonicalName ?? null,
            categoryId: resolvedItemCategoryIds[index],
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

    // Fire-and-forget post-create hook chain — only for genuinely new expenses.
    // learnableItems is computed HERE (needs both the raw dto.items and the
    // per-index resolvedItemCategoryIds computed inside the transaction above)
    // and handed to ExpenseCreatedHooksService as already-resolved data; the
    // hooks service owns everything about WHAT happens next (anomaly check,
    // family-feed, community-prices, shield tracking, product-rule learning) —
    // see docs/tech-debt/expenses-service-regrowth-after-split.md.
    if (result.isNew && result.expense) {
      const learnableItems: LearnableExpenseItem[] = (dto.items ?? [])
        .map((item, index) => ({ item, categoryId: resolvedItemCategoryIds[index] }))
        .filter((entry) => entry.categoryId && (entry.item.canonicalName?.trim() || entry.item.description?.trim()))
        .map((entry) => ({
          canonicalName: (entry.item.canonicalName?.trim() || entry.item.description.trim()) as string,
          categoryId: entry.categoryId as string,
        }));

      void this.createdHooks
        .onExpenseCreated(accountId, userId, result.expense, learnableItems)
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

      // A corrected amount (OCR read 240, the user makes it 200) leaves any
      // stored split summing to the OLD figure, which silently breaks the
      // Σ splits === amount invariant analytics depends on. Re-derive from the
      // persisted item categories against the new amount; the split is removed
      // when they no longer reconcile. Runs inside the transaction so a failure
      // rolls the amount edit back rather than committing a drifted pair.
      if (dto.amount !== undefined && Number(dto.amount) !== Number(expense.amount)) {
        await this.rebuildCategorySplits(tx, expense.id, Number(dto.amount));
      }

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
   *
   * Also returns `amount`, which every item write needs afterwards as the total
   * to re-derive the category split against (see `rebuildCategorySplits`).
   */
  private async resolveExpenseRow(accountId: string, id: string): Promise<{ id: string; amount: unknown }> {
    const expense = await this.prisma.expense.findFirst({
      where: {
        accountId,
        isDeleted: false,
        OR: [{ id }, { clientId: id }],
      },
      select: { id: true, amount: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async getItems(accountId: string, expenseId: string) {
    const { id: expensePk } = await this.resolveExpenseRow(accountId, expenseId);
    return this.prisma.expenseItem.findMany({
      where: { expenseId: expensePk, isDeleted: false },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createItem(accountId: string, expenseId: string, dto: CreateExpenseItemDto) {
    const { id: expensePk, amount } = await this.resolveExpenseRow(accountId, expenseId);
    const created = await this.prisma.expenseItem.create({
      data: {
        expenseId: expensePk,
        description: dto.description,
        quantity: dto.quantity ?? 1,
        unitPrice: dto.unitPrice ?? 0,
        totalPrice: dto.totalPrice,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    // A new line moves Σitems, so it moves both the tolerance gate and the group
    // sums the split was derived from.
    await this.rebuildCategorySplits(this.prisma, expensePk, Number(amount));
    return created;
  }

  async updateItem(accountId: string, expenseId: string, itemId: string, dto: UpdateExpenseItemDto) {
    const { id: expensePk, amount } = await this.resolveExpenseRow(accountId, expenseId);
    const item = await this.prisma.expenseItem.findFirst({
      where: { id: itemId, expenseId: expensePk, isDeleted: false },
    });
    if (!item) throw new NotFoundException('Expense item not found');

    const updated = await this.prisma.expenseItem.update({
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
    // Editing a line price moves money out from under the split just as an
    // amount edit does — same rule, same re-derivation.
    await this.rebuildCategorySplits(this.prisma, expensePk, Number(amount));
    return updated;
  }

  async removeItem(accountId: string, expenseId: string, itemId: string) {
    const { id: expensePk, amount } = await this.resolveExpenseRow(accountId, expenseId);
    const item = await this.prisma.expenseItem.findFirst({
      where: { id: itemId, expenseId: expensePk, isDeleted: false },
    });
    if (!item) throw new NotFoundException('Expense item not found');

    await this.prisma.expenseItem.update({
      where: { id: itemId },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    await this.rebuildCategorySplits(this.prisma, expensePk, Number(amount));
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
