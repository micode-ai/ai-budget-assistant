import { Injectable } from '@nestjs/common';
import { consolidatedLabels } from './consolidated-labels';

interface TransactionRow {
  date: string;
  type: 'expense' | 'income';
  description: string;
  category: string;
  tags: string;
  project: string;
  amount: number;
  currency: string;
  /** Consolidated reports only: the account the row belongs to. */
  account?: string;
  /** Consolidated reports only: why a listed row is excluded from every total. */
  note?: string;
}

export interface CsvConsolidatedExtras {
  accountSubtotals?: Array<{ name: string; spent: number; income: number; net: number }>;
  totals?: { spent: number; income: number; net: number };
  /** Names of encrypted accounts left out of the file. */
  excludedAccounts?: string[];
  /** Picks the label language for the excluded-account lines; falls back to en. */
  locale?: string;
}

@Injectable()
export class CsvGenerator {
  generate(rows: TransactionRow[], extras?: CsvConsolidatedExtras): Buffer {
    const BOM = '\uFEFF';
    const consolidated = rows.some((r) => r.account !== undefined || r.note !== undefined) || !!extras;
    const headers = ['Date', 'Type', 'Description', 'Category', 'Tags', 'Project', 'Amount', 'Currency'];
    if (consolidated) headers.push('Account', 'Note');
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
        ...(consolidated ? [this.escapeCsv(row.account ?? ''), this.escapeCsv(row.note ?? '')] : []),
      ].join(','));
    }

    if (extras) {
      const money = (n: number) => n.toFixed(2);
      if (extras.accountSubtotals?.length || extras.totals) {
        lines.push('', 'Account,Spent,Income,Net');
      }
      for (const a of extras.accountSubtotals ?? []) {
        lines.push([this.escapeCsv(a.name), money(a.spent), money(a.income), money(a.net)].join(','));
      }
      if (extras.totals) {
        lines.push(['Total', money(extras.totals.spent), money(extras.totals.income), money(extras.totals.net)].join(','));
      }
      if (extras.excludedAccounts?.length) {
        lines.push('');
        for (const n of extras.excludedAccounts) lines.push(`${this.escapeCsv(n)},${this.escapeCsv(consolidatedLabels(extras.locale).notIncluded)}`);
      }
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
