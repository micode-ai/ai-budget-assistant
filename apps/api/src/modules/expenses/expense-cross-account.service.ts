import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { AnomalyService } from '../anomaly/anomaly.service';
import { MergeExpensesDto, MoveExpenseDto } from './dto';
import { invalidateExpenseChatCache } from './expense-cache.util';

/**
 * Self-contained, already-tested behaviors that don't participate in the
 * create/update fire-and-forget hook chain: merging two expenses into one,
 * and moving an expense across the account boundary. Extracted out of
 * ExpensesService (see docs/tech-debt/expenses-service-god-file.md) — both
 * only ever needed PrismaService, AnomalyService, and CacheService.
 */
@Injectable()
export class ExpenseCrossAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anomalyService: AnomalyService,
    private readonly cacheService: CacheService,
  ) {}

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

    await invalidateExpenseChatCache(this.cacheService, accountId);
    // The merged (soft-deleted) row is what the possible_merge / duplicate_charge
    // alert points at — dismiss it so a resolved pair leaves no dead alert behind.
    void this.anomalyService.dismissForExpense(accountId, result.mergedId);
    return result;
  }

  /**
   * Move an expense from one account to another.
   *
   * `sourceAccountId` comes from the X-Account-Id context (the caller is already
   * confirmed a non-viewer member of it by AccountContextGuard + ViewerBlockGuard).
   * The caller must ALSO be a non-viewer member of the target account.
   *
   * Account-scoped associations do not travel across the boundary:
   *  - category is remapped by (case-insensitive) name into the target account, else cleared
   *  - tags, project links and category splits reference source-account rows → soft-deleted
   *  - trip expense shares reference source-account members → deleted
   * Amount / currency / description / merchant / notes / date / items / receipt travel with it.
   *
   * E2EE expenses are rejected: their encryptedPayload is sealed with the source
   * account's key and would be undecryptable under the target account.
   */
  async moveToAccount(
    sourceAccountId: string,
    userId: string,
    id: string,
    dto: MoveExpenseDto,
  ): Promise<{ id: string; accountId: string; categoryId: string | null }> {
    const targetAccountId = dto.targetAccountId;
    if (targetAccountId === sourceAccountId) {
      throw new BadRequestException('Target account must differ from the current account');
    }

    // Resolve the expense within the source account (by server PK or clientId).
    const expense = await this.prisma.expense.findFirst({
      where: { accountId: sourceAccountId, isDeleted: false, OR: [{ id }, { clientId: id }] },
      select: { id: true, clientId: true, categoryId: true, encryptedPayload: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');

    if (expense.encryptedPayload != null) {
      throw new BadRequestException('Encrypted expenses cannot be moved between accounts');
    }

    // The caller must be a non-viewer member of the target account.
    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId: targetAccountId, userId } },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of the target account');
    }
    if (membership.role === 'viewer') {
      throw new ForbiddenException('You have view-only access to the target account');
    }

    // Remap the category by name into the target account (else clear it).
    let remappedCategoryId: string | null = null;
    if (expense.categoryId) {
      const source = await this.prisma.category.findUnique({
        where: { id: expense.categoryId },
        select: { name: true },
      });
      if (source?.name) {
        const match = await this.prisma.category.findFirst({
          where: {
            accountId: targetAccountId,
            isDeleted: false,
            name: { equals: source.name, mode: 'insensitive' },
          },
          select: { id: true },
        });
        remappedCategoryId = match?.id ?? null;
      }
    }

    // A clientId is unique per account — if the target already holds a row with the
    // same clientId, replace ours with a fresh id to avoid the @@unique([accountId,
    // clientId]) collision. clientId is a required (non-nullable) column, so it MUST
    // NOT be nulled here (that throws PrismaClientValidationError).
    let keepClientId = true;
    if (expense.clientId) {
      const clash = await this.prisma.expense.findFirst({
        where: { accountId: targetAccountId, clientId: expense.clientId, id: { not: expense.id } },
        select: { id: true },
      });
      if (clash) keepClientId = false;
    }

    await this.prisma.$transaction(async (tx: PrismaClient) => {
      // Drop account-scoped associations that don't belong in the target account.
      await tx.expenseTag.updateMany({
        where: { expenseId: expense.id, isDeleted: false },
        data: { isDeleted: true },
      });
      await tx.projectExpense.updateMany({
        where: { expenseId: expense.id, isDeleted: false },
        data: { isDeleted: true },
      });
      await tx.expenseCategorySplit.updateMany({
        where: { expenseId: expense.id, isDeleted: false },
        data: { isDeleted: true },
      });
      await tx.tripExpenseShare.deleteMany({ where: { expenseId: expense.id } });

      const moveData: Record<string, any> = {
        accountId: targetAccountId,
        categoryId: remappedCategoryId,
        syncVersion: { increment: 1 },
      };
      if (!keepClientId) moveData.clientId = randomUUID();

      await tx.expense.update({ where: { id: expense.id }, data: moveData });
    });

    // Both accounts' cached chat/tool results and UserContext are now stale.
    await Promise.all([
      invalidateExpenseChatCache(this.cacheService, sourceAccountId),
      invalidateExpenseChatCache(this.cacheService, targetAccountId),
    ]);
    // Any anomaly alert deep-linking to this expense in the source account is stale.
    void this.anomalyService.dismissForExpense(sourceAccountId, expense.id);

    return { id: expense.id, accountId: targetAccountId, categoryId: remappedCategoryId };
  }
}
