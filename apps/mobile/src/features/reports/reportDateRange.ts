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
import { getStartOfWeek } from '@budget/shared-utils';
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

function toInt(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) ? n : null;
}

/**
 * The Analytics tab's period, translated into a report selection.
 *
 * Analytics carries its own month/year state and its "Export report" button used
 * to push `/reports` with no params at all, so a report generated after paging
 * back to, say, June silently covered the CURRENT month instead (ABA-411). The
 * two sibling buttons in that file already passed the period to `/story` and
 * `/wrapped`; this closes the gap for reports.
 *
 * Rule: a period that is **still running** maps to the preset that ends today —
 * a report generated on the 17th must not print "1-31 August" in its header,
 * even though Analytics itself charts the whole month. No data exists past
 * today, so the file's contents are identical either way. A **finished** period
 * maps to its exact full span, which is what Analytics displayed.
 *
 * `null` means "nothing usable was passed" — the screen keeps its own default.
 */
export function reportSelectionFromAnalytics(
  params: {
    range?: string | null;
    month?: string | number | null;
    year?: string | number | null;
  },
  now: Date = new Date(),
): ReportRangeSelection | null {
  const { range } = params;

  // Analytics' week is the Monday-based calendar week, not the trailing 7 days
  // the `week` preset means, so carry its real start instead of the preset.
  if (range === 'week') {
    return { mode: 'custom', customStart: getStartOfWeek(now), customEnd: now };
  }

  const year = toInt(params.year);
  if (year === null) return null;

  if (range === 'year') {
    if (year === now.getFullYear()) return { mode: 'year' };
    return {
      mode: 'custom',
      customStart: new Date(year, 0, 1),
      customEnd: new Date(year, 11, 31),
    };
  }

  if (range !== 'month') return null;

  // `usePeriodNavigation` keeps the month 1-based.
  const month = toInt(params.month);
  if (month === null || month < 1 || month > 12) return null;

  if (year === now.getFullYear() && month === now.getMonth() + 1) return { mode: 'month' };
  return { mode: 'specificMonth', monthAnchor: new Date(year, month - 1, 1) };
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
