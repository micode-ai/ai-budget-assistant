import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { consolidatedLabels } from './consolidated-labels';

interface ExcelReportData {
  accountName: string;
  periodStart: string;
  periodEnd: string;
  totalIncome: number;
  totalExpenses: number;
  currencyCode: string;
  categories: Array<{ name: string; amount: number; percentage: number }>;
  /** Some amount came from another currency and was converted into `currencyCode`. */
  fxConverted?: boolean;
  /** Some amount had no known rate and is missing from the totals. */
  fxApproximate?: boolean;
  expenses: Array<{
    date: string;
    description: string;
    category: string;
    tags: string;
    project: string;
    amount: number;
    currency: string;
    notes: string;
    /** Consolidated reports only. */
    account?: string;
    note?: string;
  }>;
  /** Consolidated reports only: per-account figures, printed on the Summary sheet. */
  accountSubtotals?: Array<{ name: string; spent: number; income: number; net: number }>;
  /** Consolidated reports only: names of encrypted accounts left out. */
  excludedAccounts?: string[];
  /** Picks the label language for consolidated-only strings; falls back to en. */
  locale?: string;
  incomes: Array<{
    date: string;
    description: string;
    category: string;
    tags: string;
    project: string;
    amount: number;
    currency: string;
    notes: string;
    /** Consolidated reports only. */
    account?: string;
    note?: string;
  }>;
}

@Injectable()
export class ExcelGenerator {
  async generate(data: ExcelReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AI Budget Assistant';
    workbook.created = new Date();

    // Summary sheet
    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 20 },
    ];

    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4ECDC4' } },
    };

    summary.getRow(1).eachCell((cell) => { Object.assign(cell.style, headerStyle); });

    summary.addRow({ metric: 'Account', value: data.accountName });
    summary.addRow({ metric: 'Period', value: `${data.periodStart} — ${data.periodEnd}` });
    summary.addRow({ metric: 'Total Income', value: data.totalIncome });
    summary.addRow({ metric: 'Total Expenses', value: data.totalExpenses });
    summary.addRow({ metric: 'Net Savings', value: data.totalIncome - data.totalExpenses });
    summary.addRow({ metric: 'Currency', value: data.currencyCode });

    // The Expenses/Incomes sheets keep each row's own currency, so a converted
    // total needs saying out loud. This sheet is English throughout.
    if (data.fxConverted || data.fxApproximate) {
      summary.addRow({
        metric: 'Note',
        value:
          `Totals are in ${data.currencyCode}; amounts in other currencies were converted at current rates and are approximate.` +
          (data.fxApproximate
            ? ' Some amounts had no available exchange rate and are not included.'
            : ''),
      });
    }

    if (data.categories.length > 0) {
      summary.addRow({});
      summary.addRow({ metric: 'Category Breakdown', value: '' });
      const catHeaderRow = summary.addRow({ metric: 'Category', value: 'Amount' });
      catHeaderRow.eachCell((cell) => { cell.font = { bold: true }; });

      for (const cat of data.categories) {
        summary.addRow({ metric: cat.name, value: cat.amount });
      }
    }

    if (data.accountSubtotals?.length) {
      summary.addRow({});
      summary.addRow({ metric: consolidatedLabels(data.locale).accounts, value: '' });
      const accHeader = summary.addRow(['Account', 'Spent', 'Income', 'Net']);
      accHeader.eachCell((cell) => { cell.font = { bold: true }; });
      summary.getColumn(3).width = 14;
      summary.getColumn(4).width = 14;
      for (const a of data.accountSubtotals) {
        const r = summary.addRow([a.name, a.spent, a.income, a.net]);
        for (const c of [2, 3, 4]) r.getCell(c).numFmt = '0.00';
      }
    }
    for (const name of data.excludedAccounts ?? []) {
      summary.addRow({ metric: name, value: consolidatedLabels(data.locale).notIncluded });
    }

    const consolidated = [...data.expenses, ...data.incomes].some((r) => r.account !== undefined || r.note !== undefined);
    const extraColumns: Array<Partial<ExcelJS.Column>> = consolidated
      ? [
          { header: 'Account', key: 'account', width: 18 },
          { header: 'Note', key: 'note', width: 16 },
        ]
      : [];

    // Expenses sheet
    if (data.expenses.length > 0) {
      const expSheet = workbook.addWorksheet('Expenses');
      expSheet.columns = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Description', key: 'description', width: 30 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Tags', key: 'tags', width: 18 },
        { header: 'Project', key: 'project', width: 18 },
        { header: 'Amount', key: 'amount', width: 14 },
        { header: 'Currency', key: 'currency', width: 10 },
        { header: 'Notes', key: 'notes', width: 25 },
        ...extraColumns,
      ];
      expSheet.getRow(1).eachCell((cell) => { Object.assign(cell.style, headerStyle); });
      for (const exp of data.expenses) {
        expSheet.addRow(exp);
      }
    }

    // Incomes sheet
    if (data.incomes.length > 0) {
      const incSheet = workbook.addWorksheet('Incomes');
      incSheet.columns = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Description', key: 'description', width: 30 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Tags', key: 'tags', width: 18 },
        { header: 'Project', key: 'project', width: 18 },
        { header: 'Amount', key: 'amount', width: 14 },
        { header: 'Currency', key: 'currency', width: 10 },
        { header: 'Notes', key: 'notes', width: 25 },
        ...extraColumns,
      ];
      incSheet.getRow(1).eachCell((cell) => { Object.assign(cell.style, headerStyle); });
      for (const inc of data.incomes) {
        incSheet.addRow(inc);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
