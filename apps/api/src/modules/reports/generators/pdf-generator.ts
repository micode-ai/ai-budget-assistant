import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

interface PdfReportData {
  accountName: string;
  periodStart: string;
  periodEnd: string;
  totalIncome: number;
  totalExpenses: number;
  currencyCode: string;
  categories: Array<{ name: string; amount: number; percentage: number }>;
  transactions: Array<{
    date: string;
    type: 'expense' | 'income';
    description: string;
    category: string;
    amount: number;
    currency: string;
  }>;
}

@Injectable()
export class PdfGenerator {
  async generate(data: PdfReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('Financial Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica').text(`${data.accountName}`, { align: 'center' });
      doc.fontSize(10).text(`${data.periodStart} — ${data.periodEnd}`, { align: 'center' });
      doc.moveDown(1);

      // Summary
      doc.fontSize(14).font('Helvetica-Bold').text('Summary');
      doc.moveDown(0.3);
      const netSavings = data.totalIncome - data.totalExpenses;
      doc.fontSize(11).font('Helvetica');
      doc.text(`Total Income:    ${data.currencyCode} ${data.totalIncome.toFixed(2)}`);
      doc.text(`Total Expenses:  ${data.currencyCode} ${data.totalExpenses.toFixed(2)}`);
      doc.text(`Net Savings:     ${data.currencyCode} ${netSavings.toFixed(2)}`);
      doc.moveDown(1);

      // Category Breakdown
      if (data.categories.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Expenses by Category');
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');

        const tableTop = doc.y;
        const col1 = 50;
        const col2 = 300;
        const col3 = 420;

        doc.font('Helvetica-Bold');
        doc.text('Category', col1, tableTop);
        doc.text('Amount', col2, tableTop);
        doc.text('%', col3, tableTop);

        doc.moveTo(col1, tableTop + 15).lineTo(500, tableTop + 15).stroke();

        let y = tableTop + 20;
        doc.font('Helvetica');
        for (const cat of data.categories) {
          if (y > 700) {
            doc.addPage();
            y = 50;
          }
          doc.text(cat.name, col1, y, { width: 240 });
          doc.text(`${data.currencyCode} ${cat.amount.toFixed(2)}`, col2, y);
          doc.text(`${cat.percentage.toFixed(1)}%`, col3, y);
          y += 18;
        }
        doc.moveDown(1);
      }

      // Transactions
      if (data.transactions.length > 0) {
        if (doc.y > 600) doc.addPage();
        doc.fontSize(14).font('Helvetica-Bold').text('Transactions');
        doc.moveDown(0.3);

        const txTop = doc.y;
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Date', 50, txTop, { width: 70 });
        doc.text('Type', 120, txTop, { width: 55 });
        doc.text('Description', 175, txTop, { width: 170 });
        doc.text('Category', 345, txTop, { width: 90 });
        doc.text('Amount', 435, txTop, { width: 80 });

        doc.moveTo(50, txTop + 13).lineTo(520, txTop + 13).stroke();

        let ty = txTop + 18;
        doc.font('Helvetica').fontSize(8);
        for (const tx of data.transactions) {
          if (ty > 720) {
            doc.addPage();
            ty = 50;
          }
          doc.text(tx.date, 50, ty, { width: 70 });
          doc.text(tx.type, 120, ty, { width: 55 });
          doc.text(tx.description || '-', 175, ty, { width: 170 });
          doc.text(tx.category || '-', 345, ty, { width: 90 });
          const sign = tx.type === 'income' ? '+' : '-';
          doc.text(`${sign}${tx.currency} ${tx.amount.toFixed(2)}`, 435, ty, { width: 80 });
          ty += 14;
        }
      }

      // Footer
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).font('Helvetica').text(
          `Page ${i + 1} of ${pageCount} — Generated on ${new Date().toISOString().split('T')[0]}`,
          50, 770, { align: 'center', width: 500 }
        );
      }

      doc.end();
    });
  }
}
