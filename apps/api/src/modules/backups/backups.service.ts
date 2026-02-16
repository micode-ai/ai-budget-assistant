import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RestoreBackupDto } from './dto';

const BACKUP_VERSION = 1;
const MAX_BACKUP_SIZE = 50 * 1024 * 1024; // 50MB

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async exportBackup(accountId: string, userId: string) {
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

    const backup = {
      version: BACKUP_VERSION,
      appVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      accountId,
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

    return {
      backupId: 'export',
      fileName: `backup_${accountId.slice(0, 8)}_${new Date().toISOString().split('T')[0]}.json`,
      fileSize,
      entityCounts,
      encrypted: account.encryptionEnabled,
      data: backup,
    };
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

    // Restore categories first (others may reference them)
    if (backup.data.categories?.length) {
      const { restored, skipped, errs } = await this.restoreCategories(accountId, userId, backup.data.categories, dto.overwrite);
      restoredCounts.categories = restored;
      skippedCounts.categories = skipped;
      errors.push(...errs);
    }

    // Restore tags
    if (backup.data.tags?.length) {
      const { restored, skipped, errs } = await this.restoreTags(accountId, backup.data.tags, dto.overwrite);
      restoredCounts.tags = restored;
      skippedCounts.tags = skipped;
      errors.push(...errs);
    }

    // Restore projects
    if (backup.data.projects?.length) {
      const { restored, skipped, errs } = await this.restoreProjects(accountId, backup.data.projects, dto.overwrite);
      restoredCounts.projects = restored;
      skippedCounts.projects = skipped;
      errors.push(...errs);
    }

    // Restore budgets
    if (backup.data.budgets?.length) {
      const { restored, skipped, errs } = await this.restoreBudgets(accountId, userId, backup.data.budgets, dto.overwrite);
      restoredCounts.budgets = restored;
      skippedCounts.budgets = skipped;
      errors.push(...errs);
    }

    // Restore wallet balances
    if (backup.data.walletBalances?.length) {
      const { restored, skipped, errs } = await this.restoreWalletBalances(accountId, userId, backup.data.walletBalances, dto.overwrite);
      restoredCounts.walletBalances = restored;
      skippedCounts.walletBalances = skipped;
      errors.push(...errs);
    }

    // Restore expenses (with items, tags, splits, projects)
    if (backup.data.expenses?.length) {
      const { restored, skipped, errs } = await this.restoreExpenses(accountId, userId, backup.data.expenses, dto.overwrite);
      restoredCounts.expenses = restored;
      skippedCounts.expenses = skipped;
      errors.push(...errs);
    }

    // Restore incomes
    if (backup.data.incomes?.length) {
      const { restored, skipped, errs } = await this.restoreIncomes(accountId, userId, backup.data.incomes, dto.overwrite);
      restoredCounts.incomes = restored;
      skippedCounts.incomes = skipped;
      errors.push(...errs);
    }

    // Restore currency exchanges
    if (backup.data.currencyExchanges?.length) {
      const { restored, skipped, errs } = await this.restoreCurrencyExchanges(accountId, userId, backup.data.currencyExchanges, dto.overwrite);
      restoredCounts.currencyExchanges = restored;
      skippedCounts.currencyExchanges = skipped;
      errors.push(...errs);
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

  private async restoreCategories(accountId: string, userId: string, categories: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    for (const cat of categories) {
      try {
        const existing = await this.prisma.category.findFirst({
          where: { accountId, name: cat.name, type: cat.type },
        });
        if (existing && !overwrite) { skipped++; continue; }
        if (existing && overwrite) {
          await this.prisma.category.update({
            where: { id: existing.id },
            data: { icon: cat.icon, color: cat.color, parentId: cat.parentId, encryptedPayload: cat.encryptedPayload, encryptionKeyVersion: cat.encryptionKeyVersion },
          });
        } else {
          await this.prisma.category.create({
            data: { id: cat.id, accountId, userId, name: cat.name, icon: cat.icon, color: cat.color, type: cat.type, parentId: cat.parentId, isSystem: false, encryptedPayload: cat.encryptedPayload, encryptionKeyVersion: cat.encryptionKeyVersion },
          });
        }
        restored++;
      } catch (e) { errs.push(`category ${cat.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs };
  }

  private async restoreTags(accountId: string, tags: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    for (const tag of tags) {
      try {
        const existing = await this.prisma.tag.findFirst({ where: { accountId, name: tag.name } });
        if (existing && !overwrite) { skipped++; continue; }
        if (existing && overwrite) {
          await this.prisma.tag.update({ where: { id: existing.id }, data: { color: tag.color, icon: tag.icon, encryptedPayload: tag.encryptedPayload, encryptionKeyVersion: tag.encryptionKeyVersion } });
        } else {
          await this.prisma.tag.create({ data: { id: tag.id, accountId, name: tag.name, color: tag.color, icon: tag.icon, usageCount: tag.usageCount || 0, encryptedPayload: tag.encryptedPayload, encryptionKeyVersion: tag.encryptionKeyVersion } });
        }
        restored++;
      } catch (e) { errs.push(`tag ${tag.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs };
  }

  private async restoreProjects(accountId: string, projects: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    for (const proj of projects) {
      try {
        const existing = await this.prisma.project.findFirst({ where: { accountId, clientId: proj.clientId } });
        if (existing && !overwrite) { skipped++; continue; }
        if (existing && overwrite) {
          await this.prisma.project.update({ where: { id: existing.id }, data: { name: proj.name, description: proj.description, color: proj.color, icon: proj.icon, startDate: proj.startDate, endDate: proj.endDate, budget: proj.budget, currencyCode: proj.currencyCode, isArchived: proj.isArchived, encryptedPayload: proj.encryptedPayload, encryptionKeyVersion: proj.encryptionKeyVersion } });
        } else {
          await this.prisma.project.create({ data: { id: proj.id, accountId, clientId: proj.clientId, name: proj.name, description: proj.description, color: proj.color, icon: proj.icon, startDate: proj.startDate, endDate: proj.endDate, budget: proj.budget, currencyCode: proj.currencyCode, isArchived: proj.isArchived || false, encryptedPayload: proj.encryptedPayload, encryptionKeyVersion: proj.encryptionKeyVersion } });
        }
        restored++;
      } catch (e) { errs.push(`project ${proj.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs };
  }

  private async restoreBudgets(accountId: string, userId: string, budgets: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    for (const b of budgets) {
      try {
        const existing = await this.prisma.budget.findFirst({ where: { accountId, clientId: b.clientId } });
        if (existing && !overwrite) { skipped++; continue; }
        if (existing && overwrite) {
          await this.prisma.budget.update({ where: { id: existing.id }, data: { name: b.name, amount: b.amount, currencyCode: b.currencyCode, period: b.period, startDate: b.startDate, endDate: b.endDate, categoryId: b.categoryId, alertThreshold: b.alertThreshold, isActive: b.isActive, encryptedPayload: b.encryptedPayload, encryptionKeyVersion: b.encryptionKeyVersion } });
        } else {
          await this.prisma.budget.create({ data: { id: b.id, accountId, userId, clientId: b.clientId, name: b.name, amount: b.amount, currencyCode: b.currencyCode || 'USD', period: b.period || 'monthly', startDate: b.startDate, categoryId: b.categoryId, alertThreshold: b.alertThreshold ?? 80, isActive: b.isActive ?? true, encryptedPayload: b.encryptedPayload, encryptionKeyVersion: b.encryptionKeyVersion } });
        }
        restored++;
      } catch (e) { errs.push(`budget ${b.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs };
  }

  private async restoreWalletBalances(accountId: string, userId: string, wallets: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    for (const w of wallets) {
      try {
        const existing = await this.prisma.walletBalance.findFirst({ where: { accountId, clientId: w.clientId } });
        if (existing && !overwrite) { skipped++; continue; }
        if (existing && overwrite) {
          await this.prisma.walletBalance.update({ where: { id: existing.id }, data: { initialAmount: w.initialAmount, encryptedPayload: w.encryptedPayload, encryptionKeyVersion: w.encryptionKeyVersion } });
        } else {
          await this.prisma.walletBalance.create({ data: { id: w.id, accountId, userId, clientId: w.clientId, currencyCode: w.currencyCode, initialAmount: w.initialAmount, encryptedPayload: w.encryptedPayload, encryptionKeyVersion: w.encryptionKeyVersion } });
        }
        restored++;
      } catch (e) { errs.push(`wallet ${w.currencyCode}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs };
  }

  private async restoreExpenses(accountId: string, userId: string, expenses: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    for (const exp of expenses) {
      try {
        const existing = await this.prisma.expense.findFirst({ where: { accountId, clientId: exp.clientId } });
        if (existing && !overwrite) { skipped++; continue; }

        const data = {
          userId, accountId, clientId: exp.clientId, categoryId: exp.categoryId,
          amount: exp.amount, discountAmount: exp.discountAmount, currencyCode: exp.currencyCode || 'USD',
          description: exp.description, notes: exp.notes, date: new Date(exp.date), time: exp.time,
          locationLat: exp.locationLat, locationLng: exp.locationLng, receiptUrl: exp.receiptUrl,
          isRecurring: exp.isRecurring || false, source: exp.source || 'manual',
          encryptedPayload: exp.encryptedPayload, encryptionKeyVersion: exp.encryptionKeyVersion,
        };

        if (existing && overwrite) {
          await this.prisma.expense.update({ where: { id: existing.id }, data });
        } else {
          await this.prisma.expense.create({ data: { id: exp.id, ...data } });
        }
        restored++;
      } catch (e) { errs.push(`expense ${exp.clientId}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs };
  }

  private async restoreIncomes(accountId: string, userId: string, incomes: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    for (const inc of incomes) {
      try {
        const existing = await this.prisma.income.findFirst({ where: { accountId, clientId: inc.clientId } });
        if (existing && !overwrite) { skipped++; continue; }

        const data = {
          userId, accountId, clientId: inc.clientId, categoryId: inc.categoryId,
          amount: inc.amount, currencyCode: inc.currencyCode || 'USD',
          description: inc.description, notes: inc.notes, date: new Date(inc.date),
          encryptedPayload: inc.encryptedPayload, encryptionKeyVersion: inc.encryptionKeyVersion,
        };

        if (existing && overwrite) {
          await this.prisma.income.update({ where: { id: existing.id }, data });
        } else {
          await this.prisma.income.create({ data: { id: inc.id, ...data } });
        }
        restored++;
      } catch (e) { errs.push(`income ${inc.clientId}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs };
  }

  private async restoreCurrencyExchanges(accountId: string, userId: string, exchanges: any[], overwrite: boolean) {
    let restored = 0, skipped = 0;
    const errs: string[] = [];
    for (const ex of exchanges) {
      try {
        const existing = await this.prisma.currencyExchange.findFirst({ where: { accountId, clientId: ex.clientId } });
        if (existing && !overwrite) { skipped++; continue; }

        const data = {
          userId, accountId, clientId: ex.clientId,
          fromCurrency: ex.fromCurrency, toCurrency: ex.toCurrency,
          fromAmount: ex.fromAmount, toAmount: ex.toAmount, exchangeRate: ex.exchangeRate,
          date: new Date(ex.date), notes: ex.notes,
          encryptedPayload: ex.encryptedPayload, encryptionKeyVersion: ex.encryptionKeyVersion,
        };

        if (existing && overwrite) {
          await this.prisma.currencyExchange.update({ where: { id: existing.id }, data });
        } else {
          await this.prisma.currencyExchange.create({ data: { id: ex.id, ...data } });
        }
        restored++;
      } catch (e) { errs.push(`exchange ${ex.clientId}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { restored, skipped, errs };
  }
}
