import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';

// Inter covers Latin, Cyrillic, Latin-Extended — already in node_modules via @expo-google-fonts/inter
const INTER_DIR = path.dirname(require.resolve('@expo-google-fonts/inter/package.json'));
const FONT_REGULAR = path.join(INTER_DIR, '400Regular', 'Inter_400Regular.ttf');
const FONT_BOLD = path.join(INTER_DIR, '700Bold', 'Inter_700Bold.ttf');


interface PdfReportData {
  accountName: string;
  periodStart: string;
  periodEnd: string;
  totalIncome: number;
  totalExpenses: number;
  currencyCode: string;
  locale?: string;
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

interface LangLabels {
  title: string;
  summary: string;
  totalIncome: string;
  totalExpenses: string;
  netSavings: string;
  byCategory: string;
  category: string;
  amount: string;
  transactions: string;
  date: string;
  type: string;
  description: string;
  expense: string;
  income: string;
  pageOf: (i: number, total: number, date: string) => string;
}

const LABELS: Record<string, LangLabels> = {
  en: {
    title: 'Financial Report',
    summary: 'Summary',
    totalIncome: 'Total Income',
    totalExpenses: 'Total Expenses',
    netSavings: 'Net Savings',
    byCategory: 'Expenses by Category',
    category: 'Category',
    amount: 'Amount',
    transactions: 'Transactions',
    date: 'Date',
    type: 'Type',
    description: 'Description',
    expense: 'expense',
    income: 'income',
    pageOf: (i, total, date) => `Page ${i} of ${total} — Generated on ${date}`,
  },
  de: {
    title: 'Finanzbericht',
    summary: 'Zusammenfassung',
    totalIncome: 'Gesamteinnahmen',
    totalExpenses: 'Gesamtausgaben',
    netSavings: 'Nettoersparnisse',
    byCategory: 'Ausgaben nach Kategorie',
    category: 'Kategorie',
    amount: 'Betrag',
    transactions: 'Transaktionen',
    date: 'Datum',
    type: 'Typ',
    description: 'Beschreibung',
    expense: 'Ausgabe',
    income: 'Einnahme',
    pageOf: (i, total, date) => `Seite ${i} von ${total} — Erstellt am ${date}`,
  },
  es: {
    title: 'Informe Financiero',
    summary: 'Resumen',
    totalIncome: 'Ingresos Totales',
    totalExpenses: 'Gastos Totales',
    netSavings: 'Ahorro Neto',
    byCategory: 'Gastos por Categoría',
    category: 'Categoría',
    amount: 'Monto',
    transactions: 'Transacciones',
    date: 'Fecha',
    type: 'Tipo',
    description: 'Descripción',
    expense: 'gasto',
    income: 'ingreso',
    pageOf: (i, total, date) => `Página ${i} de ${total} — Generado el ${date}`,
  },
  fr: {
    title: 'Rapport Financier',
    summary: 'Résumé',
    totalIncome: 'Revenus Totaux',
    totalExpenses: 'Dépenses Totales',
    netSavings: 'Épargne Nette',
    byCategory: 'Dépenses par Catégorie',
    category: 'Catégorie',
    amount: 'Montant',
    transactions: 'Transactions',
    date: 'Date',
    type: 'Type',
    description: 'Description',
    expense: 'dépense',
    income: 'revenu',
    pageOf: (i, total, date) => `Page ${i} sur ${total} — Généré le ${date}`,
  },
  pl: {
    title: 'Raport Finansowy',
    summary: 'Podsumowanie',
    totalIncome: 'Łączne Przychody',
    totalExpenses: 'Łączne Wydatki',
    netSavings: 'Oszczędności Netto',
    byCategory: 'Wydatki wg Kategorii',
    category: 'Kategoria',
    amount: 'Kwota',
    transactions: 'Transakcje',
    date: 'Data',
    type: 'Typ',
    description: 'Opis',
    expense: 'wydatek',
    income: 'przychód',
    pageOf: (i, total, date) => `Strona ${i} z ${total} — Wygenerowano ${date}`,
  },
  ru: {
    title: 'Финансовый Отчёт',
    summary: 'Итоги',
    totalIncome: 'Общий Доход',
    totalExpenses: 'Общие Расходы',
    netSavings: 'Чистые Сбережения',
    byCategory: 'Расходы по Категориям',
    category: 'Категория',
    amount: 'Сумма',
    transactions: 'Транзакции',
    date: 'Дата',
    type: 'Тип',
    description: 'Описание',
    expense: 'расход',
    income: 'доход',
    pageOf: (i, total, date) => `Страница ${i} из ${total} — Создано ${date}`,
  },
  ua: {
    title: 'Фінансовий Звіт',
    summary: 'Підсумки',
    totalIncome: 'Загальний Дохід',
    totalExpenses: 'Загальні Витрати',
    netSavings: 'Чисті Заощадження',
    byCategory: 'Витрати за Категоріями',
    category: 'Категорія',
    amount: 'Сума',
    transactions: 'Транзакції',
    date: 'Дата',
    type: 'Тип',
    description: 'Опис',
    expense: 'витрата',
    income: 'дохід',
    pageOf: (i, total, date) => `Сторінка ${i} з ${total} — Створено ${date}`,
  },
  be: {
    title: 'Фінансавы Справаздача',
    summary: 'Вынікі',
    totalIncome: 'Агульны Даход',
    totalExpenses: 'Агульныя Выдаткі',
    netSavings: 'Чыстыя Зберажэнні',
    byCategory: 'Выдаткі па Катэгорыях',
    category: 'Катэгорыя',
    amount: 'Сума',
    transactions: 'Транзакцыі',
    date: 'Дата',
    type: 'Тып',
    description: 'Апісанне',
    expense: 'выдатак',
    income: 'даход',
    pageOf: (i, total, date) => `Старонка ${i} з ${total} — Створана ${date}`,
  },
};

@Injectable()
export class PdfGenerator {
  async generate(data: PdfReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const lang = data.locale && LABELS[data.locale] ? data.locale : 'en';
      const L = LABELS[lang];

      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
      doc.registerFont('Inter', FONT_REGULAR);
      doc.registerFont('Inter-Bold', FONT_BOLD);

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).font('Inter-Bold').text(L.title, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Inter').text(data.accountName, { align: 'center' });
      doc.fontSize(10).text(`${data.periodStart} — ${data.periodEnd}`, { align: 'center' });
      doc.moveDown(1);

      // Summary
      doc.fontSize(14).font('Inter-Bold').text(L.summary);
      doc.moveDown(0.3);
      const netSavings = data.totalIncome - data.totalExpenses;
      doc.fontSize(11).font('Inter');
      doc.text(`${L.totalIncome}:    ${data.currencyCode} ${data.totalIncome.toFixed(2)}`);
      doc.text(`${L.totalExpenses}:  ${data.currencyCode} ${data.totalExpenses.toFixed(2)}`);
      doc.text(`${L.netSavings}:     ${data.currencyCode} ${netSavings.toFixed(2)}`);
      doc.moveDown(1);

      // Category Breakdown
      if (data.categories.length > 0) {
        doc.fontSize(14).font('Inter-Bold').text(L.byCategory);
        doc.moveDown(0.3);
        doc.fontSize(10).font('Inter');

        const tableTop = doc.y;
        const col1 = 50;
        const col2 = 300;
        const col3 = 420;

        doc.font('Inter-Bold');
        doc.text(L.category, col1, tableTop);
        doc.text(L.amount, col2, tableTop);
        doc.text('%', col3, tableTop);

        doc.moveTo(col1, tableTop + 15).lineTo(500, tableTop + 15).stroke();

        let y = tableTop + 20;
        doc.font('Inter');
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
        doc.fontSize(14).font('Inter-Bold').text(L.transactions);
        doc.moveDown(0.3);

        const txTop = doc.y;
        doc.fontSize(9).font('Inter-Bold');
        doc.text(L.date, 50, txTop, { width: 70 });
        doc.text(L.type, 120, txTop, { width: 55 });
        doc.text(L.description, 175, txTop, { width: 170 });
        doc.text(L.category, 345, txTop, { width: 90 });
        doc.text(L.amount, 435, txTop, { width: 80 });

        doc.moveTo(50, txTop + 13).lineTo(520, txTop + 13).stroke();

        let ty = txTop + 18;
        doc.font('Inter').fontSize(8);
        for (const tx of data.transactions) {
          if (ty > 720) {
            doc.addPage();
            ty = 50;
          }
          doc.text(tx.date, 50, ty, { width: 70 });
          doc.text(tx.type === 'income' ? L.income : L.expense, 120, ty, { width: 55 });
          doc.text(tx.description || '-', 175, ty, { width: 170 });
          doc.text(tx.category || '-', 345, ty, { width: 90 });
          const sign = tx.type === 'income' ? '+' : '-';
          doc.text(`${sign}${tx.currency} ${tx.amount.toFixed(2)}`, 435, ty, { width: 80 });
          ty += 14;
        }
      }

      // Footer — requires bufferPages: true
      doc.flushPages();
      const { count } = doc.bufferedPageRange();
      const today = new Date().toISOString().split('T')[0];
      for (let i = 0; i < count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).font('Inter').text(
          L.pageOf(i + 1, count, today),
          50, 770, { align: 'center', width: 500 },
        );
      }

      doc.end();
    });
  }
}
