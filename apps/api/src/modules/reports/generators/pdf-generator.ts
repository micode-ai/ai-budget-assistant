import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import { planTransactionRows } from './pdf-row-layout.util';

// Inter covers Latin, Cyrillic, Latin-Extended — already in node_modules via @expo-google-fonts/inter
const INTER_DIR = path.dirname(require.resolve('@expo-google-fonts/inter/package.json'));
const FONT_REGULAR = path.join(INTER_DIR, '400Regular', 'Inter_400Regular.ttf');
const FONT_BOLD = path.join(INTER_DIR, '700Bold', 'Inter_700Bold.ttf');

/** Single-line transaction row height. Taller rows are measured, not assumed. */
const ROW_MIN_HEIGHT = 14;
/** Last y a transaction row may start+fit on; the page footer is drawn at 770. */
const TX_PAGE_BOTTOM = 740;

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
  /** Some amount came from another currency and was converted into `currencyCode`. */
  fxConverted?: boolean;
  /** Some amount had no known rate and is missing from the totals. */
  fxApproximate?: boolean;
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
  /** Currency note; `excluded` = some amount had no rate and is missing. */
  fxNote: (currency: string, excluded: boolean) => string;
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
    fxNote: (c, excluded) =>
      `Totals are shown in ${c}. Amounts recorded in other currencies were converted at current rates, so they are approximate.` + (excluded ? ' Some amounts had no available exchange rate and are not included in the totals.' : ''),
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
    fxNote: (c, excluded) =>
      `Die Summen sind in ${c} angegeben. Beträge in anderen Währungen wurden zu aktuellen Kursen umgerechnet und sind daher ungefähr.` + (excluded ? ' Für einige Beträge war kein Wechselkurs verfügbar; sie sind in den Summen nicht enthalten.' : ''),
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
    fxNote: (c, excluded) =>
      `Los totales se muestran en ${c}. Los importes registrados en otras monedas se convirtieron a los tipos actuales, por lo que son aproximados.` + (excluded ? ' Algunos importes no tenían tipo de cambio disponible y no se incluyen en los totales.' : ''),
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
    fxNote: (c, excluded) =>
      `Les totaux sont exprimés en ${c}. Les montants enregistrés dans d'autres devises ont été convertis aux taux actuels et sont donc approximatifs.` + (excluded ? ` Certains montants n'avaient pas de taux de change disponible et ne sont pas inclus dans les totaux.` : ''),
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
    fxNote: (c, excluded) =>
      `Sumy podano w ${c}. Kwoty zapisane w innych walutach przeliczono po aktualnych kursach, więc są przybliżone.` + (excluded ? ' Dla części kwot nie był dostępny kurs wymiany i nie zostały one uwzględnione w sumach.' : ''),
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
    fxNote: (c, excluded) =>
      `Итоги указаны в ${c}. Суммы в других валютах пересчитаны по текущим курсам, поэтому они приблизительны.` + (excluded ? ' Для части сумм курс был недоступен, и они не вошли в итоги.' : ''),
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
    fxNote: (c, excluded) =>
      `Підсумки наведено у ${c}. Суми в інших валютах перераховано за поточними курсами, тому вони приблизні.` + (excluded ? ' Для частини сум курс був недоступний, і вони не увійшли до підсумків.' : ''),
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
    fxNote: (c, excluded) =>
      `Вынікі пададзены ў ${c}. Сумы ў іншых валютах пералічаны па цяперашніх курсах, таму яны прыблізныя.` + (excluded ? ' Для часткі сум курс быў недаступны, і яны не ўвайшлі ў вынікі.' : ''),
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

      // Transaction rows keep their own currency (the list is a ledger), so when
      // anything was converted the reader has to be told what the totals mean.
      if (data.fxConverted || data.fxApproximate) {
        doc.moveDown(0.4);
        doc.fontSize(8).font('Inter').text(
          L.fxNote(data.currencyCode, !!data.fxApproximate),
          { width: 470 },
        );
      }

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

        doc.font('Inter').fontSize(8);

        // Each row advances by its own measured height. With a fixed step, a long
        // description ("Biedronka \"Codziennie Niskie Ceny\" 4357 (28 items)")
        // wrapped inside its 170pt column and printed its second line ON TOP of
        // the next transaction. heightOfString reads the font/size set just above,
        // so the measuring must stay inside this block.
        const plan = planTransactionRows(
          data.transactions,
          (tx) =>
            Math.max(
              doc.heightOfString(tx.description || '-', { width: 170 }),
              doc.heightOfString(tx.category || '-', { width: 90 }),
            ),
          {
            startY: txTop + 18,
            minHeight: ROW_MIN_HEIGHT,
            pageBottom: TX_PAGE_BOTTOM,
            pageTopY: 50,
          },
        );

        let currentPage = 0;
        for (const { row: tx, y, page } of plan) {
          // The planner decided where the breaks fall; here we just honour them.
          while (currentPage < page) {
            doc.addPage();
            currentPage += 1;
          }
          doc.text(tx.date, 50, y, { width: 70 });
          doc.text(tx.type === 'income' ? L.income : L.expense, 120, y, { width: 55 });
          doc.text(tx.description || '-', 175, y, { width: 170 });
          doc.text(tx.category || '-', 345, y, { width: 90 });
          const sign = tx.type === 'income' ? '+' : '-';
          doc.text(`${sign}${tx.currency} ${tx.amount.toFixed(2)}`, 435, y, { width: 80 });
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
