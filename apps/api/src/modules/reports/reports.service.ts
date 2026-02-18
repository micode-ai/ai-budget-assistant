import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CsvGenerator } from './generators/csv-generator';
import { PdfGenerator } from './generators/pdf-generator';
import { ExcelGenerator } from './generators/excel-generator';
import { GenerateReportDto } from './dto';
import type { Response } from 'express';

const TIER_HIERARCHY: Record<string, number> = { free: 0, pro: 1, business: 2 };

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly csvGenerator: CsvGenerator,
    private readonly pdfGenerator: PdfGenerator,
    private readonly excelGenerator: ExcelGenerator,
  ) {}

  async generateReport(accountId: string, userId: string, dto: GenerateReportDto) {
    // Check encryption tier
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionTier: true, name: true, currencyCode: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.encryptionTier >= 2) {
      throw new ForbiddenException('Reports are unavailable for accounts with full encryption (amounts are encrypted server-side)');
    }

    // Check tier for PDF/Excel
    if (dto.format !== 'csv') {
      const sub = await this.prisma.subscription.findUnique({ where: { userId } });
      const tier = sub?.tier || 'free';
      if (TIER_HIERARCHY[tier] < TIER_HIERARCHY['pro']) {
        throw new ForbiddenException('PDF/Excel reports require Pro subscription or higher');
      }
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    // Query expenses
    const expenseWhere: any = {
      accountId,
      isDeleted: false,
      date: { gte: startDate, lte: endDate },
    };
    if (dto.categoryIds?.length) expenseWhere.categoryId = { in: dto.categoryIds };
    if (dto.currencyCode) expenseWhere.currencyCode = dto.currencyCode;

    const expenses = dto.includeExpenses !== false ? await this.prisma.expense.findMany({
      where: expenseWhere,
      include: {
        category: { select: { name: true } },
        expenseTags: { where: { isDeleted: false }, include: { tag: { select: { name: true } } } },
        projectExpenses: { where: { isDeleted: false }, include: { project: { select: { name: true } } } },
      },
      orderBy: { date: 'desc' },
    }) : [];

    // Filter by tags if specified
    let filteredExpenses = expenses;
    if (dto.tagIds?.length) {
      filteredExpenses = expenses.filter(e =>
        e.expenseTags.some(et => dto.tagIds!.includes(et.tagId))
      );
    }
    if (dto.projectIds?.length) {
      filteredExpenses = filteredExpenses.filter(e =>
        e.projectExpenses.some(pe => dto.projectIds!.includes(pe.projectId))
      );
    }

    // Query incomes
    const incomeWhere: any = {
      accountId,
      isDeleted: false,
      date: { gte: startDate, lte: endDate },
    };
    if (dto.categoryIds?.length) incomeWhere.categoryId = { in: dto.categoryIds };
    if (dto.currencyCode) incomeWhere.currencyCode = dto.currencyCode;

    const incomes = dto.includeIncomes !== false ? await this.prisma.income.findMany({
      where: incomeWhere,
      include: {
        category: { select: { name: true } },
        incomeTags: { where: { isDeleted: false }, include: { tag: { select: { name: true } } } },
        projectIncomes: { where: { isDeleted: false }, include: { project: { select: { name: true } } } },
      },
      orderBy: { date: 'desc' },
    }) : [];

    let filteredIncomes = incomes;
    if (dto.tagIds?.length) {
      filteredIncomes = incomes.filter(i =>
        i.incomeTags.some(it => dto.tagIds!.includes(it.tagId))
      );
    }
    if (dto.projectIds?.length) {
      filteredIncomes = filteredIncomes.filter(i =>
        i.projectIncomes.some(pi => dto.projectIds!.includes(pi.projectId))
      );
    }

    // Compute summary
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalIncome = filteredIncomes.reduce((sum, i) => sum + Number(i.amount), 0);

    // Category breakdown (expenses only)
    const categoryMap = new Map<string, { name: string; amount: number }>();
    for (const e of filteredExpenses) {
      const catName = e.category?.name || 'Uncategorized';
      const existing = categoryMap.get(catName) || { name: catName, amount: 0 };
      existing.amount += Number(e.amount);
      categoryMap.set(catName, existing);
    }
    const categories = Array.from(categoryMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map(c => ({ ...c, percentage: totalExpenses > 0 ? (c.amount / totalExpenses) * 100 : 0 }));

    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const getDesc = (desc: string | null) => desc || '';
    const getNotes = (notes: string | null) => notes || '';

    // Generate file
    let fileData: Buffer;
    let contentType: string;
    let extension: string;

    if (dto.format === 'csv') {
      const rows = [
        ...filteredExpenses.map(e => ({
          date: formatDate(e.date),
          type: 'expense' as const,
          description: getDesc(e.description),
          category: (e.category?.name || ''),
          tags: e.expenseTags.map(et => et.tag.name).join('; '),
          project: e.projectExpenses[0] ? (e.projectExpenses[0].project.name) : '',
          amount: Number(e.amount),
          currency: e.currencyCode,
        })),
        ...filteredIncomes.map(i => ({
          date: formatDate(i.date),
          type: 'income' as const,
          description: getDesc(i.description),
          category: (i.category?.name || ''),
          tags: i.incomeTags.map(it => it.tag.name).join('; '),
          project: i.projectIncomes[0] ? (i.projectIncomes[0].project.name) : '',
          amount: Number(i.amount),
          currency: i.currencyCode,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date));
      fileData = this.csvGenerator.generate(rows);
      contentType = 'text/csv';
      extension = 'csv';
    } else if (dto.format === 'pdf') {
      const transactions = [
        ...filteredExpenses.map(e => ({
          date: formatDate(e.date),
          type: 'expense' as const,
          description: getDesc(e.description),
          category: (e.category?.name || ''),
          amount: Number(e.amount),
          currency: e.currencyCode,
        })),
        ...filteredIncomes.map(i => ({
          date: formatDate(i.date),
          type: 'income' as const,
          description: getDesc(i.description),
          category: (i.category?.name || ''),
          amount: Number(i.amount),
          currency: i.currencyCode,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date));

      fileData = await this.pdfGenerator.generate({
        accountName: account.name,
        periodStart: formatDate(startDate),
        periodEnd: formatDate(endDate),
        totalIncome,
        totalExpenses,
        currencyCode: account.currencyCode,
        locale: dto.locale,
        categories,
        transactions,
      });
      contentType = 'application/pdf';
      extension = 'pdf';
    } else {
      // Excel
      const expenseRows = filteredExpenses.map(e => ({
        date: formatDate(e.date),
        description: getDesc(e.description),
        category: (e.category?.name || ''),
        tags: e.expenseTags.map(et => et.tag.name).join('; '),
        project: e.projectExpenses[0] ? (e.projectExpenses[0].project.name) : '',
        amount: Number(e.amount),
        currency: e.currencyCode,
        notes: getNotes(e.notes),
      }));

      const incomeRows = filteredIncomes.map(i => ({
        date: formatDate(i.date),
        description: getDesc(i.description),
        category: (i.category?.name || ''),
        tags: i.incomeTags.map(it => it.tag.name).join('; '),
        project: i.projectIncomes[0] ? (i.projectIncomes[0].project.name) : '',
        amount: Number(i.amount),
        currency: i.currencyCode,
        notes: getNotes(i.notes),
      }));

      fileData = await this.excelGenerator.generate({
        accountName: account.name,
        periodStart: formatDate(startDate),
        periodEnd: formatDate(endDate),
        totalIncome,
        totalExpenses,
        currencyCode: account.currencyCode,
        categories,
        expenses: expenseRows,
        incomes: incomeRows,
      });
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      extension = 'xlsx';
    }

    const fileName = `report_${formatDate(startDate)}_${formatDate(endDate)}.${extension}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Save to database
    const report = await this.prisma.generatedReport.create({
      data: {
        accountId,
        userId,
        format: dto.format,
        status: 'completed',
        fileName,
        fileData,
        fileSize: fileData.length,
        filters: {
          startDate: dto.startDate,
          endDate: dto.endDate,
          categoryIds: dto.categoryIds,
          tagIds: dto.tagIds,
          projectIds: dto.projectIds,
          currencyCode: dto.currencyCode,
          includeIncomes: dto.includeIncomes ?? true,
          includeExpenses: dto.includeExpenses ?? true,
        },
        expiresAt,
        completedAt: new Date(),
      },
    });

    return {
      reportId: report.id,
      status: 'completed',
      downloadUrl: `/reports/${report.id}/download`,
      fileName,
      fileSize: fileData.length,
    };
  }

  async listReports(accountId: string, userId: string) {
    const reports = await this.prisma.generatedReport.findMany({
      where: { accountId, userId },
      select: {
        id: true,
        format: true,
        status: true,
        fileName: true,
        fileSize: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { reports: reports.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString() })) };
  }

  async downloadReport(accountId: string, userId: string, reportId: string, res: Response) {
    const report = await this.prisma.generatedReport.findFirst({
      where: { id: reportId, accountId, userId },
    });

    if (!report) throw new NotFoundException('Report not found');
    if (report.expiresAt < new Date()) throw new NotFoundException('Report has expired');
    if (!report.fileData) throw new NotFoundException('Report file not available');

    const contentTypes: Record<string, string> = {
      csv: 'text/csv',
      pdf: 'application/pdf',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    res.setHeader('Content-Type', contentTypes[report.format] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
    res.setHeader('Content-Length', report.fileData.length);
    res.send(report.fileData);
  }

  async deleteReport(accountId: string, userId: string, reportId: string) {
    const report = await this.prisma.generatedReport.findFirst({
      where: { id: reportId, accountId, userId },
    });
    if (!report) throw new NotFoundException('Report not found');
    await this.prisma.generatedReport.delete({ where: { id: reportId } });
    return { success: true };
  }

  async getPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { weeklyEmailEnabled: true, weeklyEmailDay: true, monthlyDigestEnabled: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updatePreferences(userId: string, dto: any) {
    const data: any = {};
    if (dto.weeklyEmailEnabled !== undefined) data.weeklyEmailEnabled = dto.weeklyEmailEnabled;
    if (dto.weeklyEmailDay !== undefined) data.weeklyEmailDay = dto.weeklyEmailDay;
    if (dto.monthlyDigestEnabled !== undefined) data.monthlyDigestEnabled = dto.monthlyDigestEnabled;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { weeklyEmailEnabled: true, weeklyEmailDay: true, monthlyDigestEnabled: true },
    });
    return user;
  }
}
