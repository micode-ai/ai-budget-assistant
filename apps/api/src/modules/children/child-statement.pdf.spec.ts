import { execFileSync } from 'child_process';
import {
  childStatementTranslator,
  RECEIPT_BATCH_SIZE,
  renderChildStatementPdf,
  STATEMENT_FOOTER,
} from './child-statement.pdf';
import type { StatementData, StatementLine } from './child-statement.service';

// 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Page texts through `pdf-parse`, run in a child Node process: inside Jest's VM
 * pdfjs cannot set up its fake worker ("dynamic import callback was invoked
 * without --experimental-vm-modules").
 */
function pageTexts(pdf: Buffer): string[] {
  const script =
    "const {PDFParse}=require('pdf-parse');const b=[];process.stdin.on('data',d=>b.push(d));" +
    "process.stdin.on('end',async()=>{const p=new PDFParse({data:Buffer.concat(b)});" +
    'const r=await p.getText();process.stdout.write(JSON.stringify(r.pages.map(x=>x.text)));await p.destroy();});';
  const out = execFileSync(process.execPath, ['-e', script], { input: pdf, cwd: __dirname, maxBuffer: 64 * 1024 * 1024 });
  return (JSON.parse(out.toString('utf8')) as string[]).map((t) => t.replace(/\s+/g, ' '));
}

const line = (i: number, over: Partial<StatementLine> = {}): StatementLine => ({
  expenseId: `e${i}`,
  date: `2026-0${(i % 9) + 1}-1${i % 10}`,
  merchant: 'Biedronka "Codziennie Niskie Ceny" 4357',
  description: 'School supplies and a rather long description that wraps inside its column',
  categoryName: 'Education',
  amount: 10 + i,
  currencyCode: 'PLN',
  converted: 10 + i,
  kind: i % 2 ? 'line' : 'whole',
  ...over,
});

const data = (over: Partial<StatementData> = {}): StatementData => ({
  childName: 'Ala',
  accountName: 'Home budget',
  from: '2026-01-01',
  to: '2026-10-31',
  locale: 'pl',
  currencyCode: 'PLN',
  generatedAt: new Date('2026-11-12T09:30:00Z'),
  total: 123.45,
  byCategory: [{ categoryId: 'c1', name: 'Education', amount: 123.45 }],
  byMonth: [{ month: '2026-03', amount: 123.45 }],
  lines: [line(1)],
  fxApproximate: false,
  receipts: [],
  receiptsOmitted: 0,
  ...over,
});

/** A loader serving `images` by expense id (what `ChildStatementService.loadReceiptImages` returns). */
const loaderFor = (images: Record<string, Buffer>) => async (ids: string[]) =>
  new Map(ids.filter((id) => images[id]).map((id) => [id, images[id]] as [string, Buffer]));

const render = (d: StatementData, images: Record<string, Buffer> = {}) =>
  renderChildStatementPdf(d, childStatementTranslator(d.locale), loaderFor(images));

describe('renderChildStatementPdf', () => {
  jest.setTimeout(60_000);

  it('every page carries the footer sentence (pl verbatim)', async () => {
    const lines = Array.from({ length: 140 }, (_, i) => line(i));
    const receipts = [
      { expenseId: 'e1', date: '2026-03-11', merchant: 'CCC' },
      { expenseId: 'e2', date: '2026-03-12', merchant: 'Rossmann' },
    ];
    const pages = pageTexts(await render(data({ lines, receipts }), { e1: PNG, e2: PNG }));
    expect(pages.length).toBeGreaterThanOrEqual(5);
    expect(STATEMENT_FOOTER.pl).toBe(
      'Zestawienie sporządzone w aplikacji AI Budżet na podstawie danych wprowadzonych przez użytkownika',
    );
    for (const text of pages) expect(text).toContain(STATEMENT_FOOTER.pl);
  });

  it('the footer is translated for other locales, on every page', async () => {
    const pages = pageTexts(await render(data({ locale: 'en' })));
    for (const text of pages) expect(text).toContain(STATEMENT_FOOTER.en);
  });

  it('every supported locale has a footer sentence', () => {
    for (const l of ['en', 'pl', 'de', 'es', 'fr', 'ru', 'ua', 'be', 'nl']) {
      expect(STATEMENT_FOOTER[l]).toBeTruthy();
      expect(childStatementTranslator(l)('footer')).toBe(STATEMENT_FOOTER[l]);
    }
  });

  it('cover: child name, period, "data as of", account name; no court/certified wording', async () => {
    const [cover, ...rest] = pageTexts(await render(data({ locale: 'en' })));
    expect(cover).toContain('Ala');
    expect(cover).toContain('Home budget');
    expect(cover).toContain('2026-01-01');
    expect(cover).toContain('2026-10-31');
    expect(cover).toContain('Data as of 2026-11-12 09:30 UTC');
    expect([cover, ...rest].join(' ')).not.toMatch(/certif|court|sąd/i);
  });

  it('unknown-rate line listed, excluded from total, footnote present', async () => {
    const pages = pageTexts(
      await render(
        data({
          locale: 'en',
          lines: [line(1), line(2, { currencyCode: 'XYZ', amount: 30, converted: null })],
          fxApproximate: true,
        }),
      ),
    );
    const all = pages.join(' ');
    expect(all).toContain('XYZ 30.00');
    expect(all).toContain(childStatementTranslator('en')('fxFootnote'));
  });

  it('receipt appendix: one image per page', async () => {
    const receipts = [
      { expenseId: 'e1', date: '2026-03-11', merchant: 'CCC' },
      { expenseId: 'e2', date: '2026-03-12', merchant: 'Rossmann' },
      // Not a JPEG/PNG (a stored PDF receipt): skipped, never crashes the statement.
      { expenseId: 'e3', date: '2026-03-13', merchant: 'Zabka' },
      // Gone since planning (deleted meanwhile): skipped.
      { expenseId: 'e4', date: '2026-03-14', merchant: 'Lidl' },
    ];
    const pages = pageTexts(
      await render(data({ locale: 'en', receipts }), { e1: PNG, e2: PNG, e3: Buffer.from('%PDF-1.4') }),
    );
    const receiptPages = pages.filter((p) => p.includes('Receipt —'));
    expect(receiptPages).toHaveLength(2);
    expect(receiptPages[0]).toContain('CCC');
    expect(receiptPages[1]).toContain('Rossmann');
  });

  it('fetches receipt bytes in batches, one batch at a time', async () => {
    const receipts = Array.from({ length: RECEIPT_BATCH_SIZE * 2 + 3 }, (_, i) => ({
      expenseId: `r${i}`,
      date: '2026-03-11',
      merchant: 'CCC',
    }));
    const calls: string[][] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const loader = async (ids: string[]) => {
      calls.push(ids);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return new Map(ids.map((id) => [id, PNG] as [string, Buffer]));
    };
    const pdf = await renderChildStatementPdf(data({ locale: 'en', receipts }), childStatementTranslator('en'), loader);
    expect(calls.map((c) => c.length)).toEqual([RECEIPT_BATCH_SIZE, RECEIPT_BATCH_SIZE, 3]);
    expect(maxInFlight).toBe(1);
    expect(RECEIPT_BATCH_SIZE).toBeLessThanOrEqual(20);
    expect(pageTexts(pdf).filter((p) => p.includes('Receipt —'))).toHaveLength(receipts.length);
  });

  it('statement appendix includes all parts of a long receipt, one page each', async () => {
    const receipts = [
      { expenseId: 'long', date: '2026-03-11', merchant: 'CCC' },
      { expenseId: 'one', date: '2026-03-12', merchant: 'Lidl' },
    ];
    const loader = async (ids: string[]) =>
      new Map<string, Buffer | Buffer[]>(
        ids.map((id) => [id, id === 'long' ? [PNG, PNG, PNG] : PNG] as [string, Buffer | Buffer[]]),
      );
    const pdf = await renderChildStatementPdf(data({ locale: 'en', receipts }), childStatementTranslator('en'), loader);
    const pages = pageTexts(pdf).filter((p) => p.includes('Receipt —'));
    expect(pages).toHaveLength(4);
    expect(pages.filter((p) => p.includes('CCC'))).toHaveLength(3);
    expect(pages.some((p) => p.includes('(1/3)'))).toBe(true);
    expect(pages.some((p) => p.includes('(3/3)'))).toBe(true);
    // A single-image receipt keeps today's heading (no part counter).
    expect(pages.find((p) => p.includes('Lidl'))).not.toContain('(1/1)');
  });

  it('says how many receipts the caps left out', async () => {
    const t = childStatementTranslator('en');
    const all = pageTexts(await render(data({ locale: 'en', receiptsOmitted: 7 }))).join(' ');
    expect(all).toContain(t('receiptsOmitted', { count: 7 }));
    expect(t('receiptsOmitted', { count: 7 })).toContain('7');
    for (const l of ['pl', 'de', 'es', 'fr', 'ru', 'ua', 'be', 'nl']) {
      expect(childStatementTranslator(l)('receiptsOmitted', { count: 7 })).not.toBe(t('receiptsOmitted', { count: 7 }));
    }
  });
});
