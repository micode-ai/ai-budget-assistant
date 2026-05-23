export type DateFormat = 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';

export function parsePolishDate(raw: string, format: DateFormat = 'auto'): string {
  if (!raw) return '';
  const s = raw.trim().split(/[\sT]/)[0];

  if (format === 'YYYY-MM-DD') {
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
  }

  if (format === 'DD-MM-YYYY' || format === 'DD.MM.YYYY') {
    const sep = format === 'DD-MM-YYYY' ? /-/ : /\./;
    const m = s.match(new RegExp(`^(\\d{1,2})${sep.source}(\\d{1,2})${sep.source}(\\d{4})$`));
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  }

  // auto
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  return '';
}
