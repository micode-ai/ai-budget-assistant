import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RestoreBackupDto } from './dto';

/** Thrown inside the restore transaction to force a rollback when any row failed. */
class RestoreAbort extends Error {}

/** Backup primary key → the row it resolved to in the target account. */
interface RestoreIdMaps {
  category: Map<string, string>;
  tag: Map<string, string>;
  project: Map<string, string>;
}

function remap(map: Map<string, string>, id: string | null | undefined): string | null {
  return id ? (map.get(id) ?? null) : null;
}

/** The distinct mapped ids of a join list (`expenseTags`, `projectIncomes`, …); unmapped ones are dropped. */
function mappedIds(map: Map<string, string>, rows: Array<Record<string, unknown>> | undefined, key: string): string[] {
  const out = new Set<string>();
  for (const r of rows ?? []) {
    const id = remap(map, r?.[key] as string | undefined);
    if (id) out.add(id);
  }
  return [...out];
}

const BACKUP_VERSION = 1;
const MAX_BACKUP_SIZE = 50 * 1024 * 1024; // 50MB

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async exportBackup(accountId: string, userId: string): Promise<{ jsonStr: string; fileName: string }> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionEnabled: true, encryptionTier: true },
    });
    if (!account) throw new NotFoundException('Account not found');

    // Query all entities in parallel
    const [expenses, incomes, budgets, categories, tags, projects, walletBalances, currencyExchanges] = await Promise.all([
      this.prisma.expense.findMany({
        where: { accountId, isDeleted: false },
        include: {
          items: { where: { isDeleted: false } },
          expenseTags: { where: { isDeleted: false } },
          categorySplits: { where: { isDeleted: false } },
          projectExpenses: { where: { isDeleted: false } },
        },
      }),
      this.prisma.income.findMany({
        where: { accountId, isDeleted: false },
        include: {
          incomeTags: { where: { isDeleted: false } },
          projectIncomes: { where: { isDeleted: false } },
        },
      }),
      this.prisma.budget.findMany({ where: { accountId, isDeleted: false } }),
      this.prisma.category.findMany({ where: { accountId, isDeleted: false } }),
      this.prisma.tag.findMany({ where: { accountId, isDeleted: false } }),
      this.prisma.project.findMany({ where: { accountId, isDeleted: false } }),
      this.prisma.walletBalance.findMany({ where: { accountId, isDeleted: false } }),
      this.prisma.currencyExchange.findMany({ where: { accountId, isDeleted: false } }),
    ]);

    // Drop the binary receipt images. They are stored as DB blobs and dominate
    // backup size — a Bytes field serializes to a per-byte integer array (~4-6x
    // its size), which is what pushed backups past the 50 MB limit — and restore
    // never reads them back. Setting to undefined frees the buffers for GC and
    // omits them from JSON.stringify.
    for (const exp of expenses) {
      (exp as { receiptImage?: Buffer | null }).receiptImage = undefined;
    }

    const entityCounts = {
      expenses: expenses.length,
      incomes: incomes.length,
      budgets: budgets.length,
      categories: categories.length,
      tags: tags.length,
      projects: projects.length,
      walletBalances: walletBalances.length,
      currencyExchanges: currencyExchanges.length,
    };

    const fileName = `backup_${accountId.slice(0, 8)}_${new Date().toISOString().split('T')[0]}.json`;

    // `version` and `data` live at the TOP level so restore (client + server)
    // can validate and read the file directly — no outer envelope.
    const backup = {
      version: BACKUP_VERSION,
      appVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      accountId,
      fileName,
      encrypted: account.encryptionEnabled,
      encryptionTier: account.encryptionTier,
      entityCounts,
      data: {
        expenses,
        incomes,
        budgets,
        categories,
        tags,
        projects,
        walletBalances,
        currencyExchanges,
      },
    };

    // Serialize ONCE. The controller streams this string straight to the
    // response body, so Nest never re-serializes the (potentially large)
    // object graph — this is what previously tripled peak memory and OOM-crashed
    // the API container.
    const jsonStr = JSON.stringify(backup);
    const fileSize = Buffer.byteLength(jsonStr, 'utf-8');

    if (fileSize > MAX_BACKUP_SIZE) {
      throw new BadRequestException(`Backup size (${Math.round(fileSize / 1024 / 1024)}MB) exceeds maximum of 50MB`);
    }

    // Record history
    await this.prisma.backupHistory.create({
      data: {
        userId,
        accountId,
        version: BACKUP_VERSION,
        entityCounts,
        encrypted: account.encryptionEnabled,
        encryptionKeyVersion: null,
        fileSize,
      },
    });

    return { jsonStr, fileName };
  }

  async restoreBackup(accountId: string, userId: string, dto: RestoreBackupDto) {
    let backup: any;
    try {
      backup = JSON.parse(dto.data);
    } catch {
      throw new BadRequestException('Invalid backup format: not valid JSON');
    }

    if (!backup.version || backup.version > BACKUP_VERSION) {
      throw new BadRequestException(`Unsupported backup version: ${backup.version}`);
    }

    if (!backup.data) {
      throw new BadRequestException('Invalid backup: missing data field');
    }

    const restoredCounts: Record<string, number> = {};
    const skippedCounts: Record<string, number> = {};
    const errors: string[] = [];

    // Everything runs in ONE interactive transaction: the whole restore either
    // applies completely or not at all. If any row fails, we throw RestoreAbort
    // to roll back — the account is left exactly as it was before the import.
    // Timeout is generous because a large restore is many sequential round-trips.
    try {
      await this.prisma.$transaction(
        async (tx) => {
          // Maps a backup category id to the category id it resolved to in THIS
          // account (an existing match or a freshly-created row). Restore never
          // reuses the source primary keys — they are global and collide when
          // importing into any account that already holds those rows — so
          // expense/income.categoryId references must be remapped through this.
          let categoryIdMap = new Map<string, string>();

          // Restore categories first (others may reference them)
          if (backup.data.categories?.length) {
            const { restored, skipped, errs, idMap } = await this.restoreCategories(tx, accountId, userId, backup.data.categories, dto.overwrite);
            categoryIdMap = idMap;
            restoredCounts.categories = restored;
            skippedCounts.categories = skipped;
            errors.push(...errs);
          }

          // Tags and projects get the same backup-id → this-account-id mapping as
          // categories, so the expense/income links below point at real rows.
          let tagIdMap = new Map<string, string>();
          let projectIdMap = new Map<string, string>();

          // Restore tags
          if (backup.data.tags?.length) {
            const { restored, skipped, errs, idMap } = await this.restoreTags(tx, accountId, backup.data.tags, dto.overwrite);
            tagIdMap = idMap;
            restoredCounts.tags = restored;
            skippedCounts.tags = skipped;
            errors.push(...errs);
          }

          // Restore projects
          if (backup.data.projects?.length) {
            const { restored, skipped, errs, idMap } = await this.restoreProjects(tx, accountId, backup.data.projects, dto.overwrite);
            projectIdMap = idMap;
            restoredCounts.projects = restored;
            skippedCounts.projects = skipped;
            errors.push(...errs);
          }

          // Restore budgets
          if (backup.data.budgets?.length) {
            const { restored, skipped, errs } = await this.restoreBudgets(tx, accountId, userId, backup.data.budgets, dto.overwrite);
            restoredCounts.budgets = restored;
            skippedCounts.budgets = skipped;
            errors.push(...errs);
          }

          // Restore wallet balances
          if (backup.data.walletBalances?.length) {
            const { restored, skipped, errs } = await this.restoreWalletBalances(tx, accountId, userId, backup.data.walletBalances, dto.overwrite);
            restoredCounts.walletBalances = restored;
            skippedCounts.walletBalances = skipped;
            errors.push(...errs);
          }

          const maps: RestoreIdMaps = { category: categoryIdMap, tag: tagIdMap, project: projectIdMap };

          // Restore expenses (with items, tags, splits, projects)
          if (backup.data.expenses?.length) {
            const { restored, skipped, errs } = await this.restoreExpenses(tx, accountId, userId, backup.data.expenses, dto.overwrite, maps);
            restoredCounts.expenses = restored;
            skippedCounts.expenses = skipped;
            errors.push(...errs);
          }

          // Restore incomes
          if (backup.data.incomes?.length) {
            const { restored, skipped, errs } = await this.restoreIncomes(tx, accountId, userId, backup.data.incomes, dto.overwrite, maps);
            restoredCounts.incomes = restored;
            skippedCounts.incomes = skipped;
            errors.push(...errs);
          }

          // Restore currency exchanges
          if (backup.data.currencyExchanges?.length) {
            const { restored, skipped, errs } = await this.restoreCurrencyExchanges(tx, accountId, userId, backup.data.currencyExchanges, dto.overwrite);
            restoredCounts.currencyExchanges = restored;
            skippedCounts.currencyExchanges = skipped;
            errors.push(...errs);
          }

          // Any per-row failure → roll the whole import back (no partial state).
          if (errors.length > 0) throw new RestoreAbort();
        },
        { timeout: 180_000, maxWait: 10_000 },
      );
    } catch (e) {
      if (e instanceof RestoreAbort) {
        // Transaction rolled back: nothing was written, so the counts are void.
        this.logger.warn(`Backup restore for account ${accountId} rolled back with ${errors.length} error(s)`);
        return { restoredCounts: {}, skippedCounts: {}, errors };
      }
      throw e;
    }

    return { restoredCounts, skippedCounts, errors };
  }

  async getHistory(accountId: string, userId: string) {
    const history = await this.prisma.backupHistory.findMany({
      where: { accountId, userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        version: true,
        entityCounts: true,
        encrypted: true,
        fileSize: true,
        createdAt: true,
      },
    });
    return history.map(h => ({ ...h, createdAt: h.createdAt.toISOString() }));
  }

  // Private helpers for restore

  private async restoreCategories(tx: Prisma.TransactionClient, accountId: string, userId: string, categories: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    const idMap = new Map<string, string>();
    const createdIds = new Set<string>(); // backup ids that were freshly created (need a parentId pass)

    // Pass 1: match by (name, type) or create fresh. parentId is set in pass 2
    // once every category has a resolved target id.
    for (const cat of categories) {
      try {
        const existing = await tx.category.findFirst({
          where: { accountId, name: cat.name, type: cat.type },
        });
        if (existing) {
          idMap.set(cat.id, existing.id);
          if (!overwrite) { skipped++; continue; }
          await tx.category.update({
            where: { id: existing.id },
            data: { icon: cat.icon, color: cat.color, encryptedPayload: cat.encryptedPayload, encryptionKeyVersion: cat.encryptionKeyVersion },
          });
        } else {
          const created = await tx.category.create({
            // No `id` — let the DB generate one. Reusing the backup's global id
            // collides whenever that category still exists in another account.
            data: { accountId, userId, name: cat.name, icon: cat.icon, color: cat.color, type: cat.type, isSystem: false, encryptedPayload: cat.encryptedPayload, encryptionKeyVersion: cat.encryptionKeyVersion },
          });
          idMap.set(cat.id, created.id);
          createdIds.add(cat.id);
        }
        restored++;
      } catch (e) { errs.push(`category ${cat.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }

    // Pass 2: wire up parent links on the categories we created, remapping the
    // parent's backup id to its new id.
    for (const cat of categories) {
      if (!cat.parentId || !createdIds.has(cat.id)) continue;
      const targetId = idMap.get(cat.id);
      const newParentId = idMap.get(cat.parentId);
      if (!targetId || !newParentId) continue;
      try {
        await tx.category.update({ where: { id: targetId }, data: { parentId: newParentId } });
      } catch (e) { errs.push(`category parent ${cat.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }

    return { restored, skipped, errs, idMap };
  }

  private async restoreTags(tx: Prisma.TransactionClient, accountId: string, tags: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    const idMap = new Map<string, string>();
    for (const tag of tags) {
      try {
        const existing = await tx.tag.findFirst({ where: { accountId, name: tag.name } });
        if (existing) idMap.set(tag.id, existing.id);
        if (existing && !overwrite) { skipped++; continue; }
        if (existing && overwrite) {
          await tx.tag.update({ where: { id: existing.id }, data: { color: tag.color, icon: tag.icon, encryptedPayload: tag.encryptedPayload, encryptionKeyVersion: tag.encryptionKeyVersion } });
        } else {
          const created = await tx.tag.create({ data: { accountId, name: tag.name, color: tag.color, icon: tag.icon, usageCount: tag.usageCount || 0, encryptedPayload: tag.encryptedPayload, encryptionKeyVersion: tag.encryptionKeyVersion } });
          idMap.set(tag.id, created.id);
        }
        restored++;
      } catch (e) { errs.push(`tag ${tag.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs, idMap };
  }

  private async restoreProjects(tx: Prisma.TransactionClient, accountId: string, projects: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    const idMap = new Map<string, string>();
    for (const proj of projects) {
      try {
        const existing = await tx.project.findFirst({ where: { accountId, clientId: proj.clientId } });
        if (existing) idMap.set(proj.id, existing.id);
        if (existing && !overwrite) { skipped++; continue; }
        if (existing && overwrite) {
          await tx.project.update({ where: { id: existing.id }, data: { name: proj.name, description: proj.description, color: proj.color, icon: proj.icon, startDate: proj.startDate, endDate: proj.endDate, budget: proj.budget, currencyCode: proj.currencyCode, isArchived: proj.isArchived, encryptedPayload: proj.encryptedPayload, encryptionKeyVersion: proj.encryptionKeyVersion } });
        } else {
          const created = await tx.project.create({ data: { accountId, clientId: proj.clientId, name: proj.name, description: proj.description, color: proj.color, icon: proj.icon, startDate: proj.startDate, endDate: proj.endDate, budget: proj.budget, currencyCode: proj.currencyCode, isArchived: proj.isArchived || false, encryptedPayload: proj.encryptedPayload, encryptionKeyVersion: proj.encryptionKeyVersion } });
          idMap.set(proj.id, created.id);
        }
        restored++;
      } catch (e) { errs.push(`project ${proj.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs, idMap };
  }

  private async restoreBudgets(tx: Prisma.TransactionClient, accountId: string, userId: string, budgets: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    for (const b of budgets) {
      try {
        const existing = await tx.budget.findFirst({ where: { accountId, clientId: b.clientId } });
        if (existing && !overwrite) { skipped++; continue; }
        if (existing && overwrite) {
          await tx.budget.update({ where: { id: existing.id }, data: { name: b.name, amount: b.amount, currencyCode: b.currencyCode, period: b.period, startDate: b.startDate, endDate: b.endDate, alertThreshold: b.alertThreshold, isActive: b.isActive, encryptedPayload: b.encryptedPayload, encryptionKeyVersion: b.encryptionKeyVersion } });
        } else {
          await tx.budget.create({ data: { accountId, userId, clientId: b.clientId, name: b.name, amount: b.amount, currencyCode: b.currencyCode || 'USD', period: b.period || 'monthly', startDate: b.startDate, alertThreshold: b.alertThreshold ?? 80, isActive: b.isActive ?? true, encryptedPayload: b.encryptedPayload, encryptionKeyVersion: b.encryptionKeyVersion } });
        }
        restored++;
      } catch (e) { errs.push(`budget ${b.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs };
  }

  private async restoreWalletBalances(tx: Prisma.TransactionClient, accountId: string, userId: string, wallets: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    for (const w of wallets) {
      try {
        const existing = await tx.walletBalance.findFirst({ where: { accountId, clientId: w.clientId } });
        if (existing && !overwrite) { skipped++; continue; }
        if (existing && overwrite) {
          await tx.walletBalance.update({ where: { id: existing.id }, data: { initialAmount: w.initialAmount, encryptedPayload: w.encryptedPayload, encryptionKeyVersion: w.encryptionKeyVersion } });
        } else {
          await tx.walletBalance.create({ data: { accountId, userId, clientId: w.clientId, currencyCode: w.currencyCode, initialAmount: w.initialAmount, encryptedPayload: w.encryptedPayload, encryptionKeyVersion: w.encryptionKeyVersion } });
        }
        restored++;
      } catch (e) { errs.push(`wallet ${w.currencyCode}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs };
  }

  private async restoreExpenses(tx: Prisma.TransactionClient, accountId: string, userId: string, expenses: any[], overwrite: boolean, maps: RestoreIdMaps) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    for (const exp of expenses) {
      try {
        const existing = await tx.expense.findFirst({ where: { accountId, clientId: exp.clientId } });
        if (existing && !overwrite) { skipped++; continue; }

        const data = {
          userId, accountId, clientId: exp.clientId,
          // Remap to this account's category id; null if the category wasn't restored.
          categoryId: remap(maps.category, exp.categoryId),
          amount: exp.amount, discountAmount: exp.discountAmount, depositAmount: exp.depositAmount,
          currencyCode: exp.currencyCode || 'USD',
          description: exp.description, notes: exp.notes, merchant: exp.merchant,
          date: new Date(exp.date), time: exp.time,
          locationLat: exp.locationLat, locationLng: exp.locationLng, locationName: exp.locationName,
          receiptUrl: exp.receiptUrl, receiptFingerprint: exp.receiptFingerprint,
          isRecurring: exp.isRecurring || false, recurringId: exp.recurringId, recurringPeriod: exp.recurringPeriod,
          source: exp.source || 'manual',
          externalRef: await this.freeExternalRef(tx, 'expense', accountId, exp.externalRef, exp.clientId),
          isDebt: exp.isDebt || false, isDebtRepayment: exp.isDebtRepayment || false,
          debtContactName: exp.debtContactName, debtDueDate: exp.debtDueDate ? new Date(exp.debtDueDate) : null,
          isPlanned: exp.isPlanned || false, isSplitReceivable: exp.isSplitReceivable || false,
          encryptedPayload: exp.encryptedPayload, encryptionKeyVersion: exp.encryptionKeyVersion,
          // Not carried across: the receipt image (stripped from the export), the
          // import batch, the trip payer and the linked debt income — each points
          // at a row of the source account.
        };

        let expenseId: string;
        if (existing && overwrite) {
          await tx.expense.update({ where: { id: existing.id }, data });
          expenseId = existing.id;
        } else {
          // No `id` — let the DB generate one (reusing the global backup id collides).
          expenseId = (await tx.expense.create({ data })).id;
        }
        await this.restoreExpenseChildren(tx, expenseId, exp, maps, !!existing);
        restored++;
      } catch (e) { errs.push(`expense ${exp.clientId}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs };
  }

  /**
   * Line items, category splits, tags and project links of one restored expense.
   * On overwrite the current ones are retired first, so the expense ends up with
   * exactly the backup's children rather than a union of both.
   */
  private async restoreExpenseChildren(tx: Prisma.TransactionClient, expenseId: string, exp: any, maps: RestoreIdMaps, replacing: boolean) {
    if (replacing) {
      await tx.expenseItem.updateMany({ where: { expenseId, isDeleted: false }, data: { isDeleted: true } });
      await tx.expenseCategorySplit.updateMany({ where: { expenseId, isDeleted: false }, data: { isDeleted: true } });
      await tx.expenseTag.updateMany({ where: { expenseId, isDeleted: false }, data: { isDeleted: true } });
      await tx.projectExpense.updateMany({ where: { expenseId, isDeleted: false }, data: { isDeleted: true } });
    }
    const items = (exp.items ?? []) as any[];
    if (items.length) {
      await tx.expenseItem.createMany({
        data: items.map((it, i) => ({
          expenseId, description: it.description, canonicalName: it.canonicalName,
          categoryId: remap(maps.category, it.categoryId),
          quantity: it.quantity ?? 1, unitPrice: it.unitPrice ?? 0, totalPrice: it.totalPrice,
          lineDiscount: it.lineDiscount ?? 0, sortOrder: it.sortOrder ?? i,
          encryptedPayload: it.encryptedPayload, encryptionKeyVersion: it.encryptionKeyVersion,
        })),
      });
    }
    // A split needs a category; one whose category did not come across is dropped.
    const splits = ((exp.categorySplits ?? []) as any[])
      .map((sp) => ({ sp, categoryId: remap(maps.category, sp.categoryId) }))
      .filter((x): x is { sp: any; categoryId: string } => !!x.categoryId);
    if (splits.length) {
      await tx.expenseCategorySplit.createMany({
        data: splits.map(({ sp, categoryId }) => ({
          expenseId, categoryId, amount: sp.amount, percentage: sp.percentage, notes: sp.notes,
          encryptedPayload: sp.encryptedPayload, encryptionKeyVersion: sp.encryptionKeyVersion,
        })),
      });
    }
    for (const tagId of mappedIds(maps.tag, exp.expenseTags, 'tagId')) {
      await tx.expenseTag.upsert({
        where: { expenseId_tagId: { expenseId, tagId } },
        create: { expenseId, tagId },
        update: { isDeleted: false },
      });
    }
    for (const projectId of mappedIds(maps.project, exp.projectExpenses, 'projectId')) {
      await tx.projectExpense.upsert({
        where: { projectId_expenseId: { projectId, expenseId } },
        create: { projectId, expenseId },
        update: { isDeleted: false },
      });
    }
  }

  /**
   * `externalRef` is the bank-import dedup key, unique per account. Keep it so a
   * re-import of the same statement still dedups — unless another row in this
   * account already holds it: that row already is the imported transaction, and
   * a duplicate key would fail the whole restore.
   */
  private async freeExternalRef(tx: Prisma.TransactionClient, kind: 'expense' | 'income', accountId: string, externalRef: string | null | undefined, clientId: string) {
    if (!externalRef) return null;
    const where = { accountId, externalRef, NOT: { clientId } };
    const taken = kind === 'expense' ? await tx.expense.findFirst({ where }) : await tx.income.findFirst({ where });
    return taken ? null : externalRef;
  }

  private async restoreIncomes(tx: Prisma.TransactionClient, accountId: string, userId: string, incomes: any[], overwrite: boolean, maps: RestoreIdMaps) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    for (const inc of incomes) {
      try {
        const existing = await tx.income.findFirst({ where: { accountId, clientId: inc.clientId } });
        if (existing && !overwrite) { skipped++; continue; }

        const data = {
          userId, accountId, clientId: inc.clientId,
          categoryId: remap(maps.category, inc.categoryId),
          amount: inc.amount, currencyCode: inc.currencyCode || 'USD',
          description: inc.description, notes: inc.notes, date: new Date(inc.date),
          source: inc.source || 'manual',
          externalRef: await this.freeExternalRef(tx, 'income', accountId, inc.externalRef, inc.clientId),
          isDebt: inc.isDebt || false, isDebtRepayment: inc.isDebtRepayment || false,
          debtContactName: inc.debtContactName, debtDueDate: inc.debtDueDate ? new Date(inc.debtDueDate) : null,
          encryptedPayload: inc.encryptedPayload, encryptionKeyVersion: inc.encryptionKeyVersion,
        };

        let incomeId: string;
        if (existing && overwrite) {
          await tx.income.update({ where: { id: existing.id }, data });
          incomeId = existing.id;
          await tx.incomeTag.updateMany({ where: { incomeId, isDeleted: false }, data: { isDeleted: true } });
          await tx.projectIncome.updateMany({ where: { incomeId, isDeleted: false }, data: { isDeleted: true } });
        } else {
          incomeId = (await tx.income.create({ data })).id;
        }
        for (const tagId of mappedIds(maps.tag, inc.incomeTags, 'tagId')) {
          await tx.incomeTag.upsert({
            where: { incomeId_tagId: { incomeId, tagId } },
            create: { incomeId, tagId },
            update: { isDeleted: false },
          });
        }
        for (const projectId of mappedIds(maps.project, inc.projectIncomes, 'projectId')) {
          await tx.projectIncome.upsert({
            where: { projectId_incomeId: { projectId, incomeId } },
            create: { projectId, incomeId },
            update: { isDeleted: false },
          });
        }
        restored++;
      } catch (e) { errs.push(`income ${inc.clientId}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs };
  }

  private async restoreCurrencyExchanges(tx: Prisma.TransactionClient, accountId: string, userId: string, exchanges: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    for (const ex of exchanges) {
      try {
        const existing = await tx.currencyExchange.findFirst({ where: { accountId, clientId: ex.clientId } });
        if (existing && !overwrite) { skipped++; continue; }

        const data = {
          userId, accountId, clientId: ex.clientId,
          fromCurrency: ex.fromCurrency, toCurrency: ex.toCurrency,
          fromAmount: ex.fromAmount, toAmount: ex.toAmount, exchangeRate: ex.exchangeRate,
          date: new Date(ex.date), notes: ex.notes,
          encryptedPayload: ex.encryptedPayload, encryptionKeyVersion: ex.encryptionKeyVersion,
        };

        if (existing && overwrite) {
          await tx.currencyExchange.update({ where: { id: existing.id }, data });
        } else {
          await tx.currencyExchange.create({ data });
        }
        restored++;
      } catch (e) { errs.push(`exchange ${ex.clientId}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs };
  }
}
