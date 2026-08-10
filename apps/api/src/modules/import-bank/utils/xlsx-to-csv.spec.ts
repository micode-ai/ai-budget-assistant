import * as ExcelJS from 'exceljs';
import { isXlsxBuffer, xlsxToCsv } from './xlsx-to-csv';

async function buildWorkbook(rows: (string | number)[][], sheetName = 'Sheet1'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('isXlsxBuffer', () => {
  it('accepts a real workbook', async () => {
    expect(isXlsxBuffer(await buildWorkbook([['a']]))).toBe(true);
  });

  it('rejects CSV text', () => {
    expect(isXlsxBuffer(Buffer.from('Data;Kwota\n2026-01-01;-12,00'))).toBe(false);
  });

  it('rejects a PDF', () => {
    expect(isXlsxBuffer(Buffer.from('%PDF-1.7\n...'))).toBe(false);
  });

  it('rejects a truncated buffer', () => {
    expect(isXlsxBuffer(Buffer.from([0x50]))).toBe(false);
  });
});

describe('xlsxToCsv', () => {
  it('converts the first sheet to semicolon-delimited CSV', async () => {
    const buf = await buildWorkbook([
      ['Data operacji', 'Kwota', 'Opis'],
      ['2026-01-01', -12.5, 'Sklep'],
      ['2026-01-02', 40, 'Zwrot'],
    ]);
    const csv = await xlsxToCsv(buf);
    expect(csv.split('\n')[0]).toBe('Data operacji;Kwota;Opis');
    expect(csv.split('\n')[1]).toBe('2026-01-01;-12.5;Sklep');
  });

  it('quotes cells containing the delimiter', async () => {
    const buf = await buildWorkbook([['Opis'], ['Sklep; Warszawa']]);
    const csv = await xlsxToCsv(buf);
    expect(csv.split('\n')[1]).toBe('"Sklep; Warszawa"');
  });

  it('skips leading blank rows so the header row lands first', async () => {
    const buf = await buildWorkbook([[], [], ['Data', 'Kwota'], ['2026-01-01', -5]]);
    const csv = await xlsxToCsv(buf);
    expect(csv.split('\n')[0]).toBe('Data;Kwota');
  });

  it('throws a typed error on a workbook with no sheets', async () => {
    const wb = new ExcelJS.Workbook();
    const empty = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(xlsxToCsv(empty)).rejects.toThrow('XLSX_EMPTY');
  });

  // A typed date column is the most common shape of a real bank XLSX export.
  // cellToString() reads it via toISOString().slice(0, 10), which routes
  // through UTC — the same bug class this repo documents in
  // apps/mobile/src/utils/dateInput.ts. Verified empirically (see the
  // ABA fix report for the two probe scripts this test is distilled from):
  // a real spreadsheet date cell is a plain numeric Excel SERIAL plus a date
  // `numFmt` — that is what the XLSX file format itself stores, with no
  // per-cell timezone concept at all, and it is what Excel / bank export
  // tooling actually writes. ExcelJS's reader converts that serial to a JS
  // Date at UTC MIDNIGHT of the intended calendar day, REGARDLESS of the
  // reading process's own timezone — checked directly under both
  // Europe/Minsk (UTC+3, this suite's default) and TZ=UTC, byte-identical
  // both times. So `.toISOString().slice(0, 10)` is correct here.
  //
  // (Building the fixture the OTHER way — `ws.addRow([new Date(y, m, d)])`,
  // i.e. handing ExcelJS a JS Date built from LOCAL wall-clock components —
  // does NOT reproduce a real file: that write path preserves the Date's
  // absolute instant, and a local midnight in a positive-UTC-offset
  // timezone falls on the PREVIOUS UTC day, one day short. That is a
  // documented ExcelJS write-side gotcha for callers who hand it a
  // local-time `Date`, not a defect in real XLSX files or in this
  // function's read side — real exports never go through that JS API, so
  // this test deliberately does not exercise it.)
  it('converts a typed Date cell (raw Excel serial + date format, as real exports store it) to the correct calendar day', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Data', 'Kwota']);
    // Excel's 1900 date system: a naive day count since 1899-12-30, with no
    // timezone semantics in the file format itself.
    const serial = (Date.UTC(2026, 0, 15) - Date.UTC(1899, 11, 30)) / 86400000;
    const row = ws.addRow([serial, -12.5]);
    row.getCell(1).numFmt = 'yyyy-mm-dd';
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const csv = await xlsxToCsv(buf);
    const [dateCell] = csv.split('\n')[1].split(';');
    expect(dateCell).toBe('2026-01-15');
  });
});
