import { CsvGenerator } from './csv-generator';
import { ExcelGenerator } from './excel-generator';
import { PdfGenerator } from './pdf-generator';
import * as ExcelJS from 'exceljs';
import { consolidatedLabels } from './consolidated-labels';

const row = {
  date: '2026-11-02',
  type: 'expense' as const,
  description: 'Milk, 2L',
  category: 'Food',
  tags: 'a; b',
  project: '',
  amount: 12.5,
  currency: 'PLN',
};

describe('CsvGenerator additive consolidated fields', () => {
  const gen = new CsvGenerator();

  it('is byte-identical to the legacy output when no new fields are supplied', () => {
    const out = gen.generate([row, { ...row, type: 'income', description: 'Pay', amount: 100 }]).toString('utf-8');
    expect(out).toBe(
      '﻿Date,Type,Description,Category,Tags,Project,Amount,Currency\r\n' +
        '2026-11-02,expense,"Milk, 2L",Food,a; b,,12.50,PLN\r\n' +
        '2026-11-02,income,Pay,Food,a; b,,100.00,PLN',
    );
  });

  it('prints the totals header even without subtotals, and localizes the excluded label', () => {
    const out = gen
      .generate([row], { totals: { spent: 1, income: 2, net: 1 }, excludedAccounts: ['Vault'], locale: 'pl' })
      .toString('utf-8');
    expect(out).toContain('\r\n\r\nAccount,Spent,Income,Net\r\nTotal,1.00,2.00,1.00');
    expect(out).toContain('Vault,nieuwzględnione (zaszyfrowane)');
  });

  it('adds Account and Note columns, subtotals, totals and excluded accounts', () => {
    const out = gen
      .generate([{ ...row, account: 'Main', note: 'planned' }], {
        accountSubtotals: [{ name: 'Main', spent: 0, income: 0, net: 0 }],
        totals: { spent: 0, income: 0, net: 0 },
        excludedAccounts: ['Vault'],
      })
      .toString('utf-8');
    const lines = out.replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('Date,Type,Description,Category,Tags,Project,Amount,Currency,Account,Note');
    expect(lines[1]).toBe('2026-11-02,expense,"Milk, 2L",Food,a; b,,12.50,PLN,Main,planned');
    expect(out).toContain('Main');
    expect(out).toContain('Total');
    expect(out).toContain('Vault,not included (encrypted)');
  });
});

describe('consolidatedLabels locales', () => {
  it('pt and br give distinct Portuguese labels, nl Dutch, unknown falls back to en', () => {
    expect(consolidatedLabels('pt').notes.planned).toBe('Planeado');
    expect(consolidatedLabels('pt').allAccounts).toBe('Todas as contas');
    expect(consolidatedLabels('br').notes.planned).toBe('Planejado');
    expect(consolidatedLabels('nl').notes.planned).toBe('Gepland');
    expect(consolidatedLabels('xx').notes.planned).toBe('Planned');
  });

  it('csv excluded line uses the pt label', () => {
    const out = new CsvGenerator().generate([row], { excludedAccounts: ['Cofre'], locale: 'pt' }).toString('utf-8');
    expect(out).toContain('Cofre,não incluída (encriptada)');
  });
});

describe('Excel / PDF additive consolidated fields', () => {
  it('excel: legacy input has no Account column; consolidated adds Account/Note and subtotals', async () => {
    const base = {
      accountName: 'A',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      totalIncome: 0,
      totalExpenses: 5,
      currencyCode: 'PLN',
      categories: [],
      incomes: [],
    };
    const exp = { date: '2026-11-02', description: 'x', category: 'c', tags: '', project: '', amount: 5, currency: 'PLN', notes: '' };
    const read = async (buf: Buffer) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      return wb;
    };
    const legacy = await read(await new ExcelGenerator().generate({ ...base, expenses: [exp] }));
    expect(legacy.getWorksheet('Expenses')!.getRow(1).values).not.toContain('Account');

    const cons = await read(
      await new ExcelGenerator().generate({
        ...base,
        expenses: [{ ...exp, account: 'Main', note: 'planned' }],
        accountSubtotals: [{ name: 'Main', spent: 5, income: 0, net: -5 }],
        excludedAccounts: ['Vault'],
      }),
    );
    const header = cons.getWorksheet('Expenses')!.getRow(1).values as any[];
    expect(header).toContain('Account');
    expect(header).toContain('Note');
    const summaryText = JSON.stringify(cons.getWorksheet('Summary')!.getSheetValues());
    expect(summaryText).toContain('Main');
    expect(summaryText).toContain('Vault');
    expect(summaryText).toContain('not included (encrypted)');
    const rows: any[] = [];
    cons.getWorksheet('Summary')!.eachRow((r) => rows.push(r.values));
    const sub = rows.find((v) => v[1] === 'Main');
    expect(sub.slice(2)).toEqual([5, 0, -5]);

    const pl = await read(
      await new ExcelGenerator().generate({ ...base, locale: 'pl', expenses: [exp], accountSubtotals: [{ name: 'Main', spent: 5, income: 0, net: -5 }], excludedAccounts: ['Vault'] }),
    );
    const plText = JSON.stringify(pl.getWorksheet('Summary')!.getSheetValues());
    expect(plText).toContain('Konta');
    expect(plText).toContain('nieuwzględnione (zaszyfrowane)');
  });

  it('pdf: renders with and without the new optional fields', async () => {
    const base = {
      accountName: 'A',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      totalIncome: 0,
      totalExpenses: 5,
      currencyCode: 'PLN',
      categories: [],
      transactions: [{ date: '2026-11-02', type: 'expense' as const, description: 'x', category: 'c', amount: 5, currency: 'PLN' }],
    };
    const gen = new PdfGenerator();
    expect((await gen.generate(base)).subarray(0, 4).toString()).toBe('%PDF');
    const withNew = await gen.generate({
      ...base,
      transactions: [{ ...base.transactions[0], account: 'Main', note: 'planned' }],
      accountSubtotals: [{ name: 'Main', spent: 5, income: 0, net: -5 }],
      excludedAccounts: ['Vault'],
    });
    expect(withNew.subarray(0, 4).toString()).toBe('%PDF');
  });
});
