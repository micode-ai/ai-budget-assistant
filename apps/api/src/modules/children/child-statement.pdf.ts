import * as PDFDocument from 'pdfkit';
import { FONT_BOLD, FONT_REGULAR } from '../reports/generators/pdf-generator';
import { planTransactionRows } from '../reports/generators/pdf-row-layout.util';
import type { ReceiptImageLoader, StatementData, StatementLine } from './child-statement.service';

/**
 * The child statement PDF (child costs, task 8), on the reports pipeline's
 * pdfkit setup: Inter (Latin, Latin-Extended, Cyrillic), A4, buffered pages so
 * the footer can be drawn on every page last, and `planTransactionRows` for the
 * line table so a wrapping cell never overprints the next row.
 *
 * Wording is deliberately plain: a statement the user prepared from their own
 * data. No court headers, no "certified", no address — only the child's name,
 * the period, "data as of" and the account name on the cover.
 */

export type StatementT = (key: string, params?: Record<string, string | number>) => string;

/** The footer sentence on every page. The Polish text is fixed verbatim by the spec. */
export const STATEMENT_FOOTER: Record<string, string> = {
  pl: 'Zestawienie sporządzone w aplikacji AI Budżet na podstawie danych wprowadzonych przez użytkownika',
  en: 'Statement prepared in the AI Budget app from data entered by the user',
  de: 'Aufstellung erstellt in der App AI Budget auf Grundlage der vom Nutzer eingegebenen Daten',
  es: 'Resumen elaborado en la aplicación AI Budget a partir de los datos introducidos por el usuario',
  fr: "Relevé établi dans l'application AI Budget à partir des données saisies par l'utilisateur",
  nl: 'Overzicht opgesteld in de app AI Budget op basis van door de gebruiker ingevoerde gegevens',
  ru: 'Выписка составлена в приложении AI Budget на основе данных, введённых пользователем',
  ua: 'Виписку складено в застосунку AI Budget на основі даних, введених користувачем',
  be: 'Выпіска складзена ў праграме AI Budget на падставе даных, уведзеных карыстальнікам',
};

type Labels = Record<string, string>;

const LABELS: Record<string, Labels> = {
  en: {
    title: 'Child expense statement',
    child: 'Child',
    period: 'Period',
    dataAsOf: 'Data as of {{timestamp}}',
    account: 'Account',
    total: 'Total',
    byCategory: 'Totals by category',
    byMonth: 'Totals by month',
    month: 'Month',
    lines: 'Expenses',
    date: 'Date',
    merchant: 'Merchant',
    description: 'Description',
    category: 'Category',
    original: 'Amount',
    converted: 'In {{currency}}',
    kind: 'Type',
    whole: 'whole',
    line: 'line',
    uncategorized: 'Uncategorized',
    amount: 'Amount',
    noData: 'No expenses are attributed to this child in this period.',
    currencyNote:
      'Totals are in {{currency}}. Amounts in other currencies were converted at current rates and are approximate.',
    fxFootnote:
      '* No exchange rate was available for this amount. It is listed but not included in the totals.',
    kindNote:
      '"whole" — the whole expense (or the child\'s share of it); "line" — receipt lines attributed to the child.',
    receipts: 'Receipts',
    receiptsOmitted: '{{count}} further receipts are not included in this statement (size limit).',
    receipt: 'Receipt — {{date}} {{merchant}}',
    page: 'Page {{i}} of {{n}}',
  },
  pl: {
    title: 'Zestawienie wydatków na dziecko',
    child: 'Dziecko',
    period: 'Okres',
    dataAsOf: 'Stan danych na {{timestamp}}',
    account: 'Konto',
    total: 'Razem',
    byCategory: 'Sumy wg kategorii',
    byMonth: 'Sumy wg miesięcy',
    month: 'Miesiąc',
    lines: 'Wydatki',
    date: 'Data',
    merchant: 'Sklep',
    description: 'Opis',
    category: 'Kategoria',
    original: 'Kwota',
    converted: 'W {{currency}}',
    kind: 'Rodzaj',
    whole: 'całość',
    line: 'pozycja',
    uncategorized: 'Bez kategorii',
    amount: 'Kwota',
    noData: 'W tym okresie żadne wydatki nie są przypisane do tego dziecka.',
    currencyNote:
      'Sumy podano w {{currency}}. Kwoty w innych walutach przeliczono po aktualnych kursach, więc są przybliżone.',
    fxFootnote:
      '* Dla tej kwoty nie był dostępny kurs wymiany. Jest wymieniona, ale nie wliczono jej do sum.',
    kindNote:
      '„całość” — cały wydatek (lub udział dziecka w nim); „pozycja” — pozycje paragonu przypisane do dziecka.',
    receipts: 'Paragony',
    receiptsOmitted:
      'Pozostałe paragony ({{count}}) nie zostały dołączone do zestawienia (limit rozmiaru).',
    receipt: 'Paragon — {{date}} {{merchant}}',
    page: 'Strona {{i}} z {{n}}',
  },
  de: {
    title: 'Ausgabenaufstellung für ein Kind',
    child: 'Kind',
    period: 'Zeitraum',
    dataAsOf: 'Datenstand {{timestamp}}',
    account: 'Konto',
    total: 'Gesamt',
    byCategory: 'Summen nach Kategorie',
    byMonth: 'Summen nach Monat',
    month: 'Monat',
    lines: 'Ausgaben',
    date: 'Datum',
    merchant: 'Händler',
    description: 'Beschreibung',
    category: 'Kategorie',
    original: 'Betrag',
    converted: 'In {{currency}}',
    kind: 'Art',
    whole: 'ganz',
    line: 'Position',
    uncategorized: 'Ohne Kategorie',
    amount: 'Betrag',
    noData: 'In diesem Zeitraum sind diesem Kind keine Ausgaben zugeordnet.',
    currencyNote:
      'Summen in {{currency}}. Beträge in anderen Währungen wurden zu aktuellen Kursen umgerechnet und sind daher ungefähr.',
    fxFootnote:
      '* Für diesen Betrag war kein Wechselkurs verfügbar. Er ist aufgeführt, aber nicht in den Summen enthalten.',
    kindNote:
      '„ganz“ — die ganze Ausgabe (oder der Anteil des Kindes); „Position“ — dem Kind zugeordnete Bonpositionen.',
    receipts: 'Belege',
    receiptsOmitted:
      'Weitere {{count}} Belege sind in dieser Aufstellung nicht enthalten (Größenbegrenzung).',
    receipt: 'Beleg — {{date}} {{merchant}}',
    page: 'Seite {{i}} von {{n}}',
  },
  es: {
    title: 'Resumen de gastos de un hijo',
    child: 'Hijo/a',
    period: 'Periodo',
    dataAsOf: 'Datos a {{timestamp}}',
    account: 'Cuenta',
    total: 'Total',
    byCategory: 'Totales por categoría',
    byMonth: 'Totales por mes',
    month: 'Mes',
    lines: 'Gastos',
    date: 'Fecha',
    merchant: 'Comercio',
    description: 'Descripción',
    category: 'Categoría',
    original: 'Importe',
    converted: 'En {{currency}}',
    kind: 'Tipo',
    whole: 'completo',
    line: 'línea',
    uncategorized: 'Sin categoría',
    amount: 'Importe',
    noData: 'No hay gastos asignados a este hijo/a en este periodo.',
    currencyNote:
      'Totales en {{currency}}. Los importes en otras monedas se convirtieron a los tipos actuales y son aproximados.',
    fxFootnote:
      '* No había tipo de cambio disponible para este importe. Aparece en la lista, pero no se incluye en los totales.',
    kindNote:
      '«completo» — el gasto entero (o la parte del hijo/a); «línea» — líneas del recibo asignadas al hijo/a.',
    receipts: 'Recibos',
    receiptsOmitted: 'Otros {{count}} recibos no se incluyen en este resumen (límite de tamaño).',
    receipt: 'Recibo — {{date}} {{merchant}}',
    page: 'Página {{i}} de {{n}}',
  },
  fr: {
    title: "Relevé des dépenses d'un enfant",
    child: 'Enfant',
    period: 'Période',
    dataAsOf: 'Données au {{timestamp}}',
    account: 'Compte',
    total: 'Total',
    byCategory: 'Totaux par catégorie',
    byMonth: 'Totaux par mois',
    month: 'Mois',
    lines: 'Dépenses',
    date: 'Date',
    merchant: 'Commerçant',
    description: 'Description',
    category: 'Catégorie',
    original: 'Montant',
    converted: 'En {{currency}}',
    kind: 'Type',
    whole: 'entière',
    line: 'ligne',
    uncategorized: 'Sans catégorie',
    amount: 'Montant',
    noData: "Aucune dépense n'est attribuée à cet enfant sur cette période.",
    currencyNote:
      'Totaux en {{currency}}. Les montants dans d’autres devises ont été convertis aux taux actuels et sont approximatifs.',
    fxFootnote:
      "* Aucun taux de change n'était disponible pour ce montant. Il est listé mais n'est pas inclus dans les totaux.",
    kindNote:
      "« entière » — la dépense entière (ou la part de l'enfant) ; « ligne » — lignes du ticket attribuées à l'enfant.",
    receipts: 'Tickets',
    receiptsOmitted:
      '{{count}} autres tickets ne sont pas inclus dans ce relevé (limite de taille).',
    receipt: 'Ticket — {{date}} {{merchant}}',
    page: 'Page {{i}} sur {{n}}',
  },
  nl: {
    title: 'Uitgavenoverzicht voor een kind',
    child: 'Kind',
    period: 'Periode',
    dataAsOf: 'Gegevens per {{timestamp}}',
    account: 'Rekening',
    total: 'Totaal',
    byCategory: 'Totalen per categorie',
    byMonth: 'Totalen per maand',
    month: 'Maand',
    lines: 'Uitgaven',
    date: 'Datum',
    merchant: 'Winkel',
    description: 'Omschrijving',
    category: 'Categorie',
    original: 'Bedrag',
    converted: 'In {{currency}}',
    kind: 'Soort',
    whole: 'geheel',
    line: 'regel',
    uncategorized: 'Zonder categorie',
    amount: 'Bedrag',
    noData: 'In deze periode zijn geen uitgaven aan dit kind toegewezen.',
    currencyNote:
      'Totalen in {{currency}}. Bedragen in andere valuta zijn tegen actuele koersen omgerekend en daarom bij benadering.',
    fxFootnote:
      '* Voor dit bedrag was geen wisselkoers beschikbaar. Het staat in de lijst, maar telt niet mee in de totalen.',
    kindNote:
      '"geheel" — de hele uitgave (of het aandeel van het kind); "regel" — bonregels die aan het kind zijn toegewezen.',
    receipts: 'Bonnen',
    receiptsOmitted: 'Nog {{count}} bonnen zijn niet in dit overzicht opgenomen (groottelimiet).',
    receipt: 'Bon — {{date}} {{merchant}}',
    page: 'Pagina {{i}} van {{n}}',
  },
  ru: {
    title: 'Выписка расходов на ребёнка',
    child: 'Ребёнок',
    period: 'Период',
    dataAsOf: 'Данные на {{timestamp}}',
    account: 'Счёт',
    total: 'Итого',
    byCategory: 'Итоги по категориям',
    byMonth: 'Итоги по месяцам',
    month: 'Месяц',
    lines: 'Расходы',
    date: 'Дата',
    merchant: 'Магазин',
    description: 'Описание',
    category: 'Категория',
    original: 'Сумма',
    converted: 'В {{currency}}',
    kind: 'Тип',
    whole: 'целиком',
    line: 'позиция',
    uncategorized: 'Без категории',
    amount: 'Сумма',
    noData: 'За этот период на ребёнка не отнесено ни одного расхода.',
    currencyNote:
      'Итоги в {{currency}}. Суммы в других валютах пересчитаны по текущим курсам и потому приблизительны.',
    fxFootnote:
      '* Для этой суммы не было доступного курса. Она указана в списке, но не вошла в итоги.',
    kindNote:
      '«целиком» — весь расход (или доля ребёнка в нём); «позиция» — позиции чека, отнесённые на ребёнка.',
    receipts: 'Чеки',
    receiptsOmitted: 'Ещё {{count}} чеков не вошли в выписку (ограничение размера).',
    receipt: 'Чек — {{date}} {{merchant}}',
    page: 'Страница {{i}} из {{n}}',
  },
  ua: {
    title: 'Виписка витрат на дитину',
    child: 'Дитина',
    period: 'Період',
    dataAsOf: 'Дані станом на {{timestamp}}',
    account: 'Рахунок',
    total: 'Разом',
    byCategory: 'Підсумки за категоріями',
    byMonth: 'Підсумки за місяцями',
    month: 'Місяць',
    lines: 'Витрати',
    date: 'Дата',
    merchant: 'Магазин',
    description: 'Опис',
    category: 'Категорія',
    original: 'Сума',
    converted: 'У {{currency}}',
    kind: 'Тип',
    whole: 'повністю',
    line: 'позиція',
    uncategorized: 'Без категорії',
    amount: 'Сума',
    noData: 'За цей період на дитину не віднесено жодної витрати.',
    currencyNote:
      'Підсумки у {{currency}}. Суми в інших валютах перераховано за поточними курсами, тому вони приблизні.',
    fxFootnote:
      '* Для цієї суми не було доступного курсу. Її наведено в списку, але не враховано в підсумках.',
    kindNote:
      '«повністю» — уся витрата (або частка дитини в ній); «позиція» — позиції чека, віднесені на дитину.',
    receipts: 'Чеки',
    receiptsOmitted: 'Ще {{count}} чеків не увійшли до виписки (обмеження розміру).',
    receipt: 'Чек — {{date}} {{merchant}}',
    page: 'Сторінка {{i}} з {{n}}',
  },
  be: {
    title: 'Выпіска выдаткаў на дзіця',
    child: 'Дзіця',
    period: 'Перыяд',
    dataAsOf: 'Даныя на {{timestamp}}',
    account: 'Рахунак',
    total: 'Разам',
    byCategory: 'Вынікі па катэгорыях',
    byMonth: 'Вынікі па месяцах',
    month: 'Месяц',
    lines: 'Выдаткі',
    date: 'Дата',
    merchant: 'Крама',
    description: 'Апісанне',
    category: 'Катэгорыя',
    original: 'Сума',
    converted: 'У {{currency}}',
    kind: 'Тып',
    whole: 'цалкам',
    line: 'пазіцыя',
    uncategorized: 'Без катэгорыі',
    amount: 'Сума',
    noData: 'За гэты перыяд на дзіця не аднесена ніводнага выдатку.',
    currencyNote:
      'Вынікі ў {{currency}}. Сумы ў іншых валютах пералічаны па цяперашніх курсах, таму яны прыблізныя.',
    fxFootnote:
      '* Для гэтай сумы не было даступнага курсу. Яна ёсць у спісе, але не ўвайшла ў вынікі.',
    kindNote:
      '«цалкам» — увесь выдатак (або доля дзіцяці ў ім); «пазіцыя» — пазіцыі чэка, аднесеныя на дзіця.',
    receipts: 'Чэкі',
    receiptsOmitted: 'Яшчэ {{count}} чэкаў не ўвайшлі ў выпіску (абмежаванне памеру).',
    receipt: 'Чэк — {{date}} {{merchant}}',
    page: 'Старонка {{i}} з {{n}}',
  },
};

/** `t` for a locale (unknown → English); `footer` is the fixed footer sentence. */
export function childStatementTranslator(locale: string): StatementT {
  const lang = LABELS[locale] ? locale : 'en';
  const labels = LABELS[lang];
  return (key, params) => {
    const raw = key === 'footer' ? STATEMENT_FOOTER[lang] : (labels[key] ?? LABELS.en[key] ?? key);
    if (!params) return raw;
    return raw.replace(/\{\{(\w+)\}\}/g, (m, name: string) =>
      name in params ? String(params[name]) : m
    );
  };
}

const PAGE_LEFT = 40;
const PAGE_WIDTH = 515; // A4 595 - 2 x 40
const CONTENT_BOTTOM = 770;
const FOOTER_Y = 792;
const ROW_MIN_HEIGHT = 12;

const money = (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`;
const asOf = (d: Date) => `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;

const COLS = {
  date: { x: 40, w: 52 },
  merchant: { x: 92, w: 80 },
  description: { x: 172, w: 118 },
  category: { x: 290, w: 75 },
  original: { x: 365, w: 70 },
  converted: { x: 435, w: 72 },
  kind: { x: 507, w: 48 },
};

const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isPng = (b: Buffer) =>
  b.length > 8 &&
  b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

/** The part of pdfkit's opened image this file reads (`openImage` is missing from @types/pdfkit). */
interface OpenedImage {
  width: number;
  height: number;
}

/** Stored receipts are ≤ 800 px wide (receipt-image-memory); never draw one wider than that. */
export const RECEIPT_MAX_WIDTH_PX = 800;

/** Receipt bytes are fetched this many at a time and embedded before the next batch is fetched. */
export const RECEIPT_BATCH_SIZE = 20;

/**
 * Draws the statement. Receipt bytes come from `loadImages` in batches of
 * `RECEIPT_BATCH_SIZE`, each embedded (pdfkit writes the image object out at
 * once) before the next is fetched, so only one batch of source bytes is on
 * the heap at a time; the service has already capped the appendix.
 */
export async function renderChildStatementPdf(
  data: StatementData,
  t: StatementT,
  loadImages: ReceiptImageLoader = async () => new Map()
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_LEFT,
    bufferPages: true,
    info: { Title: t('title') },
  });
  doc.registerFont('Inter', FONT_REGULAR);
  doc.registerFont('Inter-Bold', FONT_BOLD);

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const cur = data.currencyCode;
  const catName = (name: string | null) => name || t('uncategorized');

  // ── Cover ──────────────────────────────────────────────────────────────
  doc
    .font('Inter-Bold')
    .fontSize(20)
    .text(t('title'), PAGE_LEFT, 90, { width: PAGE_WIDTH, align: 'center' });
  doc.moveDown(1.2);
  doc.font('Inter-Bold').fontSize(16).text(data.childName, { width: PAGE_WIDTH, align: 'center' });
  doc.moveDown(0.8);
  doc.font('Inter').fontSize(11);
  doc.text(`${t('period')}: ${data.from} — ${data.to}`, { width: PAGE_WIDTH, align: 'center' });
  doc.text(`${t('account')}: ${data.accountName}`, { width: PAGE_WIDTH, align: 'center' });
  doc.text(t('dataAsOf', { timestamp: asOf(data.generatedAt) }), {
    width: PAGE_WIDTH,
    align: 'center',
  });
  doc.moveDown(1.5);
  doc
    .font('Inter-Bold')
    .fontSize(14)
    .text(`${t('total')}: ${money(data.total, cur)}`, { width: PAGE_WIDTH, align: 'center' });

  const foreign = data.lines.some((l) => l.currencyCode !== cur);
  if (foreign) {
    doc.moveDown(0.8);
    doc
      .font('Inter')
      .fontSize(9)
      .text(t('currencyNote', { currency: cur }), { width: PAGE_WIDTH, align: 'center' });
  }
  if (data.lines.length === 0) {
    doc.moveDown(1);
    doc.font('Inter').fontSize(10).text(t('noData'), { width: PAGE_WIDTH, align: 'center' });
  }

  // ── Totals by category and by month ───────────────────────────────────
  const twoColumnTable = (
    title: string,
    header: [string, string],
    rows: Array<[string, string]>
  ) => {
    if (rows.length === 0) return;
    if (doc.y > CONTENT_BOTTOM - 60) doc.addPage();
    doc.moveDown(1.2);
    doc.font('Inter-Bold').fontSize(13).text(title, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
    doc.moveDown(0.3);
    let y = doc.y;
    doc.fontSize(9).text(header[0], PAGE_LEFT, y, { width: 300 });
    doc.text(header[1], 360, y, { width: 155, align: 'right' });
    doc
      .moveTo(PAGE_LEFT, y + 13)
      .lineTo(PAGE_LEFT + PAGE_WIDTH, y + 13)
      .stroke();
    y += 18;
    doc.font('Inter').fontSize(9);
    for (const [a, b] of rows) {
      const h = Math.max(ROW_MIN_HEIGHT, doc.heightOfString(a, { width: 300 })) + 3;
      if (y + h > CONTENT_BOTTOM) {
        doc.addPage();
        y = PAGE_LEFT;
      }
      doc.text(a, PAGE_LEFT, y, { width: 300 });
      doc.text(b, 360, y, { width: 155, align: 'right' });
      y += h;
    }
    doc.x = PAGE_LEFT;
    doc.y = y;
  };

  twoColumnTable(
    t('byCategory'),
    [t('category'), t('amount')],
    data.byCategory.map((c) => [catName(c.name), money(c.amount, cur)])
  );
  twoColumnTable(
    t('byMonth'),
    [t('month'), t('amount')],
    data.byMonth.map((m) => [m.month, money(m.amount, cur)])
  );

  // ── Line table ─────────────────────────────────────────────────────────
  if (data.lines.length > 0) {
    doc.addPage();
    doc
      .font('Inter-Bold')
      .fontSize(13)
      .text(t('lines'), PAGE_LEFT, PAGE_LEFT, { width: PAGE_WIDTH });
    doc
      .font('Inter')
      .fontSize(8)
      .text(t('kindNote'), PAGE_LEFT, doc.y + 2, { width: PAGE_WIDTH });

    const drawHeader = (y: number): number => {
      doc.font('Inter-Bold').fontSize(7.5);
      const h = Math.max(
        ...(Object.keys(COLS) as Array<keyof typeof COLS>).map((k) =>
          doc.heightOfString(headerText(k), { width: COLS[k].w - 3 })
        )
      );
      for (const k of Object.keys(COLS) as Array<keyof typeof COLS>) {
        doc.text(headerText(k), COLS[k].x, y, { width: COLS[k].w - 3 });
      }
      doc
        .moveTo(PAGE_LEFT, y + h + 2)
        .lineTo(PAGE_LEFT + PAGE_WIDTH, y + h + 2)
        .stroke();
      doc.font('Inter').fontSize(7.5);
      return y + h + 6;
    };
    const headerText = (k: keyof typeof COLS): string =>
      k === 'converted'
        ? t('converted', { currency: cur })
        : k === 'original'
          ? t('original')
          : t(k);

    const cell = (l: StatementLine) => ({
      date: l.date,
      merchant: l.merchant || '-',
      description: l.description || '-',
      category: catName(l.categoryName),
      original: money(l.amount, l.currencyCode),
      converted: l.converted === null ? '—*' : money(l.converted, cur),
      kind: l.kind === 'line' ? t('line') : t('whole'),
    });

    const headerTop = doc.y + 8;
    const startY = drawHeader(headerTop);
    // A continuation page repeats the same header at the top margin.
    const pageTopY = PAGE_LEFT + (startY - headerTop);
    doc.font('Inter').fontSize(7.5);
    const plan = planTransactionRows(
      data.lines,
      (l) => {
        const c = cell(l);
        return (
          Math.max(
            ...(Object.keys(COLS) as Array<keyof typeof COLS>).map((k) =>
              doc.heightOfString(c[k], { width: COLS[k].w - 3 })
            )
          ) + 3
        );
      },
      { startY, minHeight: ROW_MIN_HEIGHT, pageBottom: CONTENT_BOTTOM, pageTopY }
    );

    let page = 0;
    for (const { row, y, page: p } of plan) {
      while (page < p) {
        doc.addPage();
        page += 1;
        // Column headers repeated on every continuation page.
        drawHeader(PAGE_LEFT);
      }
      const c = cell(row);
      for (const k of Object.keys(COLS) as Array<keyof typeof COLS>) {
        doc.text(c[k], COLS[k].x, y, { width: COLS[k].w - 3 });
      }
    }
    const last = plan[plan.length - 1];
    doc.x = PAGE_LEFT;
    doc.y = last.y + last.height + 6;

    if (data.lines.some((l) => l.converted === null)) {
      doc.font('Inter').fontSize(8);
      if (doc.y + doc.heightOfString(t('fxFootnote'), { width: PAGE_WIDTH }) > CONTENT_BOTTOM) {
        doc.addPage();
        doc.y = PAGE_LEFT;
      }
      doc.text(t('fxFootnote'), PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
    }
  }

  if (data.receiptsOmitted > 0) {
    doc.font('Inter').fontSize(8);
    const note = t('receiptsOmitted', { count: data.receiptsOmitted });
    if (doc.y + doc.heightOfString(note, { width: PAGE_WIDTH }) + 6 > CONTENT_BOTTOM) {
      doc.addPage();
      doc.y = PAGE_LEFT;
    }
    doc.text(note, PAGE_LEFT, doc.y + 6, { width: PAGE_WIDTH });
  }

  // ── Appendix: one receipt per page, bytes fetched batch by batch ─────────
  for (let b = 0; b < data.receipts.length; b += RECEIPT_BATCH_SIZE) {
    const batch = data.receipts.slice(b, b + RECEIPT_BATCH_SIZE);
    const images = await loadImages(batch.map((r) => r.expenseId));
    for (const r of batch) {
      const loaded = images.get(r.expenseId);
      if (!loaded) continue; // gone since planning
      // A long receipt is several photos, top to bottom: one page per part.
      const parts = Array.isArray(loaded) ? loaded : [loaded];
      const heading = t('receipt', { date: r.date, merchant: r.merchant || '' }).trim();
      for (let i = 0; i < parts.length; i++) {
        const image = parts[i];
        if (!isJpeg(image) && !isPng(image)) continue; // e.g. a stored PDF
        let img: OpenedImage;
        try {
          img = (doc as unknown as { openImage(src: Buffer): OpenedImage }).openImage(image);
        } catch {
          continue; // a corrupt image must not cost the user the whole statement
        }
        doc.addPage();
        doc
          .font('Inter-Bold')
          .fontSize(11)
          .text(parts.length > 1 ? `${heading} (${i + 1}/${parts.length})` : heading, PAGE_LEFT, PAGE_LEFT, {
            width: PAGE_WIDTH,
          });
        const top = doc.y + 8;
        // Never wider than the stored 800 px copy, and never wider than the page.
        const maxW = Math.min(PAGE_WIDTH, img.width, RECEIPT_MAX_WIDTH_PX);
        // pdfkit accepts the opened image object (it skips re-opening when `width`/`height` are set).
        doc.image(img as unknown as Buffer, PAGE_LEFT, top, { fit: [maxW, CONTENT_BOTTOM - top] });
      }
    }
    images.clear();
  }

  // ── Footer on every page (requires bufferPages) ───────────────────────
  // No `flushPages()` before this loop: it empties the page buffer, so
  // `bufferedPageRange()` would report zero pages and no footer would be drawn.
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    // Drawing below the bottom margin would make pdfkit open a new page.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Inter').fontSize(7.5).fillColor('#444444');
    doc.text(t('footer'), PAGE_LEFT, FOOTER_Y, {
      width: PAGE_WIDTH,
      align: 'center',
      lineBreak: false,
    });
    doc.text(t('page', { i: i - start + 1, n: count }), PAGE_LEFT, FOOTER_Y + 11, {
      width: PAGE_WIDTH,
      align: 'center',
      lineBreak: false,
    });
    doc.fillColor('black');
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}
