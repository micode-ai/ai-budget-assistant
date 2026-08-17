/**
 * Turns the report screen's range selection into the `YYYY-MM-DD` pair that
 * `POST /reports/generate` takes.
 *
 * Every boundary is formatted with `toDateInputValue`, i.e. from local calendar
 * components. It must NEVER go through `toISOString()`: that converts to UTC,
 * so a local-midnight boundary lands on the previous day for any positive
 * offset. That is how a report labelled "this month" came back starting on the
 * last day of the previous month, and a yearly one on 31 December of the year
 * before — the same class of bug `src/utils/dateInput.ts` was written to stop.
 */
import { toDateInputValue } from '@/utils/dateInput';

export type ReportRangeMode =
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'specificMonth'
  | 'custom';

export interface ReportDateRange {
  startDate: string;
  endDate: string;
}

export interface ReportRangeSelection {
  mode: ReportRangeMode;
  /** Any day inside the wanted month. Only read for `specificMonth`. */
  monthAnchor?: Date | null;
  /** Only read for `custom`. */
  customStart?: Date | null;
  /** Only read for `custom`. */
  customEnd?: Date | null;
}

/** First day of the calendar quarter BEFORE the one `now` falls in. */
function previousQuarter(now: Date): { start: Date; end: Date } {
  const quarter = Math.floor(now.getMonth() / 3);
  const year = quarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const startMonth = quarter === 0 ? 9 : (quarter - 1) * 3;
  return {
    start: new Date(year, startMonth, 1),
    // Day 0 of the month after the quarter's last one = that last day.
    end: new Date(year, startMonth + 3, 0),
  };
}

/**
 * `null` means the selection is not usable yet — a custom range missing an end,
 * or one whose start is after its end. The screen keeps Generate disabled and
 * says why rather than silently sending a backwards range.
 */
export function resolveReportDateRange(
  selection: ReportRangeSelection,
  now: Date = new Date(),
): ReportDateRange | null {
  const today = toDateInputValue(now);

  switch (selection.mode) {
    case 'week': {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      return { startDate: toDateInputValue(start), endDate: today };
    }

    case 'month':
      return {
        startDate: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: today,
      };

    case 'quarter': {
      const { start, end } = previousQuarter(now);
      return { startDate: toDateInputValue(start), endDate: toDateInputValue(end) };
    }

    case 'year':
      return {
        startDate: toDateInputValue(new Date(now.getFullYear(), 0, 1)),
        endDate: today,
      };

    case 'specificMonth': {
      const anchor = selection.monthAnchor;
      if (!anchor || Number.isNaN(anchor.getTime())) return null;
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
      return { startDate: toDateInputValue(start), endDate: toDateInputValue(end) };
    }

    case 'custom': {
      const { customStart, customEnd } = selection;
      if (!customStart || !customEnd) return null;
      if (Number.isNaN(customStart.getTime()) || Number.isNaN(customEnd.getTime())) return null;
      const startDate = toDateInputValue(customStart);
      const endDate = toDateInputValue(customEnd);
      // String compare is safe: both are zero-padded YYYY-MM-DD.
      if (startDate > endDate) return null;
      return { startDate, endDate };
    }
  }
}

/**
 * Month anchors for the "specific month" picker, newest first, starting with
 * the month `now` falls in.
 */
export function buildRecentMonthAnchors(count: number, now: Date = new Date()): Date[] {
  const total = Math.max(0, Math.floor(count));
  const anchors: Date[] = [];
  for (let i = 0; i < total; i += 1) {
    anchors.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  return anchors;
}

function capitalizeFirst(value: string, locale: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);
}

/**
 * "Sierpień 2026". Intl gives a lower-case month name in several of our
 * locales, which reads wrong as a standalone label.
 */
export function formatMonthLabel(anchor: Date, locale: string): string {
  try {
    const formatted = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
    }).format(anchor);
    return capitalizeFirst(formatted, locale);
  } catch {
    return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`;
  }
}

/**
 * The monthly digest's server-sent `periodLabel` is a bare `YYYY-MM`, which
 * reads like a machine field next to the money. Anything that isn't that shape
 * is passed through untouched.
 */
export function formatDigestPeriod(periodLabel: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(periodLabel);
  if (!match) return periodLabel;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return periodLabel;
  return formatMonthLabel(new Date(Number(match[1]), month - 1, 1), locale);
}
