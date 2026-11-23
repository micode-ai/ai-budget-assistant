import { toDateInputValue } from '@/utils/dateInput';

export type PeriodPreset = 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'custom';

/** Calendar-day range for a preset, built from local date parts (never `toISOString`). */
export function periodRange(
  preset: PeriodPreset,
  now: Date,
  custom?: { start: string; end: string },
): { start: string; end: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'lastMonth':
      return { start: toDateInputValue(new Date(y, m - 1, 1)), end: toDateInputValue(new Date(y, m, 0)) };
    case 'thisYear':
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    case 'lastYear':
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
    case 'custom':
      if (custom) return custom;
    // falls through to this month when no custom range is set yet
    case 'thisMonth':
    default:
      return { start: toDateInputValue(new Date(y, m, 1)), end: toDateInputValue(new Date(y, m + 1, 0)) };
  }
}
