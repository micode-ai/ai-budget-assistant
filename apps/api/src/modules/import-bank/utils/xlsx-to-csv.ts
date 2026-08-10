import * as ExcelJS from 'exceljs';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"

/**
 * An XLSX file is a zip archive. Checking the zip magic alone would also
 * accept .docx/.odt/.jar, so we additionally require the "xl/" path that
 * only a spreadsheet part contains. Reading the raw bytes for that marker is
 * enough — a full unzip happens later in xlsxToCsv.
 */
export function isXlsxBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 4) return false;
  for (let i = 0; i < ZIP_MAGIC.length; i++) {
    if (buf[i] !== ZIP_MAGIC[i]) return false;
  }
  return buf.includes('xl/', 0, 'latin1');
}

const escapeCell = (value: string): string =>
  /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const cellToString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  // A real XLSX date cell is a plain numeric Excel serial plus a date
  // `numFmt` — the file format itself carries no timezone concept. Verified
  // empirically (under both UTC and a UTC+3 process) that ExcelJS's reader
  // converts such a cell to a JS Date at UTC MIDNIGHT of the intended
  // calendar day regardless of the reading process's own timezone, so
  // reading the UTC day back out here is correct and stable across server
  // timezones. (This does NOT hold for a Date object handed to ExcelJS's own
  // write API via local wall-clock components — an unrelated ExcelJS
  // write-side quirk that a real bank/spreadsheet export never goes
  // through, since it never uses that JS API to produce its file.) See
  // xlsx-to-csv.spec.ts's Date-cell test for the reproduction.
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    // ExcelJS rich text / formula / hyperlink cells.
    const rich = value as { richText?: { text: string }[]; result?: unknown; text?: string };
    if (Array.isArray(rich.richText)) return rich.richText.map((p) => p.text).join('');
    if (rich.result !== undefined) return cellToString(rich.result);
    if (rich.text !== undefined) return String(rich.text);
    return '';
  }
  return String(value);
};

/**
 * Convert the first worksheet to semicolon-delimited CSV text. Leading blank
 * rows are dropped so the header row is line 0, which is what peekHeaders and
 * every parser assume.
 */
export async function xlsxToCsv(buf: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buf as unknown as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('XLSX_EMPTY');

  const lines: string[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as unknown[]).slice(1); // ExcelJS is 1-indexed
    const cells = values.map((v) => escapeCell(cellToString(v)));
    if (cells.every((c) => c === '')) return;
    lines.push(cells.join(';'));
  });

  if (lines.length === 0) throw new Error('XLSX_EMPTY');
  return lines.join('\n');
}
