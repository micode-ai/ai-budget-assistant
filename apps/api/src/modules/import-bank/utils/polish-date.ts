export type DateFormat = 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';

/**
 * Builds the ISO day, or '' when the calendar has no such day. Every branch of
 * parsePolishDate goes through here: an impossible date such as "2019-13-01"
 * becomes Invalid Date downstream, and Prisma rejects the whole query that
 * carries it — one bad cell used to fail an entire import preview.
 */
function toIsoDay(year: string, month: string, day: string): string {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1) return '';
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > daysInMonth) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

const DAY_MONTH_YEAR = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;

export function parsePolishDate(raw: string, format: DateFormat = 'auto'): string {
  if (!raw) return '';
  const s = raw.trim().split(/[\sT]/)[0];

  if (format === 'YYYY-MM-DD') {
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return m ? toIsoDay(m[1], m[2], m[3]) : '';
  }

  if (format === 'DD-MM-YYYY' || format === 'DD.MM.YYYY') {
    const sep = format === 'DD-MM-YYYY' ? /-/ : /\./;
    const m = s.match(new RegExp(`^(\\d{1,2})${sep.source}(\\d{1,2})${sep.source}(\\d{4})$`));
    return m ? toIsoDay(m[3], m[2], m[1]) : '';
  }

  if (format === 'MM/DD/YYYY') {
    const m = s.match(DAY_MONTH_YEAR);
    return m ? toIsoDay(m[3], m[1], m[2]) : '';
  }

  // auto
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toIsoDay(m[1], m[2], m[3]);

  m = s.match(DAY_MONTH_YEAR);
  if (m) return toIsoDay(m[3], m[2], m[1]);

  return '';
}

/**
 * Decides, for a whole file, whether its `nn/nn/yyyy` dates are month-first.
 * Apps such as Monefy write dates in the exporting device's locale, so a US
 * phone produces `01/13/2019`. One row cannot tell `01/03` apart, but a file
 * can: month-first only when some second component exceeds 12 and no first
 * one does. Anything else, including a file ambiguous throughout, stays on the
 * day-first default the target markets use.
 */
export function inferSlashDateOrder(raws: string[]): 'auto' | 'MM/DD/YYYY' {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const raw of raws) {
    const m = (raw ?? '').trim().split(/[\sT]/)[0].match(DAY_MONTH_YEAR);
    if (!m) continue;
    if (Number(m[1]) > 12) firstOver12 = true;
    if (Number(m[2]) > 12) secondOver12 = true;
  }
  return secondOver12 && !firstOver12 ? 'MM/DD/YYYY' : 'auto';
}
