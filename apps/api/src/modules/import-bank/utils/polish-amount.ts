export type AmountFormat = 'polish' | 'standard';

const EMPTY_MARKERS = new Set(['', '-', '–', '—']);

export function parsePolishAmount(raw: string, format: AmountFormat = 'polish'): number {
  if (raw == null) return NaN;
  const trimmed = String(raw).trim();
  if (EMPTY_MARKERS.has(trimmed)) return NaN;

  // Strip currency code suffix (PLN, EUR, USD, ...) and whitespace
  let s = trimmed.replace(/\s*[A-Z]{3}\s*$/u, '');
  // Strip NBSP + spaces (thousand separators)
  s = s.replace(/[\s ]/g, '');

  if (format === 'standard') {
    // 1,234.56 → 1234.56 — strip commas
    s = s.replace(/,/g, '');
  } else {
    // Polish: "1.234,56" or "1234,56" → "1234.56"
    // Auto-detect: if both comma and period exist, check which is the decimal
    // Standard (1,234.56): period is rightmost → strip commas
    // Polish (1.234,56): comma is rightmost → strip periods, convert comma to period
    if (s.includes(',') && s.includes('.')) {
      const lastCommaIdx = s.lastIndexOf(',');
      const lastPeriodIdx = s.lastIndexOf('.');
      if (lastPeriodIdx > lastCommaIdx) {
        // Standard format detected: 1,234.56
        s = s.replace(/,/g, '');
      } else {
        // Polish format: 1.234,56
        s = s.replace(/\./g, '');
        s = s.replace(/,/g, '.');
      }
    } else if (s.includes(',')) {
      // Only comma → Polish decimal: 1234,56
      s = s.replace(/,/g, '.');
    }
    // If only period, leave as-is (standard format bare amount)
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}
