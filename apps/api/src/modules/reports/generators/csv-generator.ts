import { Injectable } from '@nestjs/common';

interface TransactionRow {
  date: string;
  type: 'expense' | 'income';
  description: string;
  category: string;
  tags: string;
  project: string;
  amount: number;
  currency: string;
}

@Injectable()
export class CsvGenerator {
  generate(rows: TransactionRow[]): Buffer {
    const BOM = '\uFEFF';
    const headers = ['Date', 'Type', 'Description', 'Category', 'Tags', 'Project', 'Amount', 'Currency'];
    const lines = [headers.join(',')];

    for (const row of rows) {
      lines.push([
        row.date,
        row.type,
        this.escapeCsv(row.description),
        this.escapeCsv(row.category),
        this.escapeCsv(row.tags),
        this.escapeCsv(row.project),
        row.amount.toFixed(2),
        row.currency,
      ].join(','));
    }

    return Buffer.from(BOM + lines.join('\r\n'), 'utf-8');
  }

  private escapeCsv(value: string): string {
    if (!value) return '';
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
