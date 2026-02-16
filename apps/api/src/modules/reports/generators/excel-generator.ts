import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

interface ExcelReportData {
  accountName: string;
  periodStart: string;
  periodEnd: string;
  totalIncome: number;
  totalExpenses: number;
  currencyCode: string;
  categories: Array<{ name: string; amount: number; percentage: number }>;
  expenses: Array<{
    date: string;
    description: string;
    category: string;
    tags: string;
    project: string;
    amount: number;
    currency: string;
    notes: string;
  }>;
  incomes: Array<{
    date: string;
    description: string;
    category: string;
    tags: string;
    project: string;
    amount: number;
    currency: string;
    notes: string;
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

    if (data.categories.length > 0) {
      summary.addRow({});
      summary.addRow({ metric: 'Category Breakdown', value: '' });
      const catHeaderRow = summary.addRow({ metric: 'Category', value: 'Amount' });
      catHeaderRow.eachCell((cell) => { cell.font = { bold: true }; });

      for (const cat of data.categories) {
        summary.addRow({ metric: cat.name, value: cat.amount });
      }
    }

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
