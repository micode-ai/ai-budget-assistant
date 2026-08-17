import {
  buildRecentMonthAnchors,
  formatDigestPeriod,
  formatMonthLabel,
  reportSelectionFromAnalytics,
  resolveReportDateRange,
} from '../reportDateRange';

// 17 Aug 2026, 08:21 local — the moment the off-by-one was reported from.
const NOW = new Date(2026, 7, 17, 8, 21);

describe('resolveReportDateRange', () => {
  it('starts "this month" on the 1st, not on the last day of the previous one', () => {
    expect(resolveReportDateRange({ mode: 'month' }, NOW)).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-17',
    });
  });

  it('starts "this year" on 1 January, not on 31 December of the year before', () => {
    expect(resolveReportDateRange({ mode: 'year' }, NOW)).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-08-17',
    });
  });

  it('returns the closed previous calendar quarter', () => {
    expect(resolveReportDateRange({ mode: 'quarter' }, NOW)).toEqual({
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    });
  });

  it('wraps to the previous year Q4 when asked in Q1', () => {
    expect(resolveReportDateRange({ mode: 'quarter' }, new Date(2026, 1, 3))).toEqual({
      startDate: '2025-10-01',
      endDate: '2025-12-31',
    });
  });

  it('ends the week preset on today', () => {
    expect(resolveReportDateRange({ mode: 'week' }, NOW)).toEqual({
      startDate: '2026-08-10',
      endDate: '2026-08-17',
    });
  });

  it('keeps the local calendar day late in the evening', () => {
    // 23:30 in a positive offset is the case where toISOString() rolled the
    // end date forward into tomorrow.
    expect(resolveReportDateRange({ mode: 'month' }, new Date(2026, 7, 17, 23, 30))).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-17',
    });
  });

  describe('specificMonth', () => {
    it('covers the whole month the anchor falls in', () => {
      expect(
        resolveReportDateRange({ mode: 'specificMonth', monthAnchor: new Date(2026, 1, 14) }, NOW),
      ).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' });
    });

    it('gets the last day of a leap February right', () => {
      expect(
        resolveReportDateRange({ mode: 'specificMonth', monthAnchor: new Date(2024, 1, 1) }, NOW),
      ).toEqual({ startDate: '2024-02-01', endDate: '2024-02-29' });
    });

    it('does not stop at the 30th in a 31-day month', () => {
      expect(
        resolveReportDateRange({ mode: 'specificMonth', monthAnchor: new Date(2026, 6, 9) }, NOW),
      ).toEqual({ startDate: '2026-07-01', endDate: '2026-07-31' });
    });

    it('is unusable without an anchor', () => {
      expect(resolveReportDateRange({ mode: 'specificMonth' }, NOW)).toBeNull();
    });
  });

  describe('custom', () => {
    it('passes both local calendar days through', () => {
      expect(
        resolveReportDateRange(
          {
            mode: 'custom',
            customStart: new Date(2026, 2, 1, 0, 0),
            customEnd: new Date(2026, 4, 20, 23, 59),
          },
          NOW,
        ),
      ).toEqual({ startDate: '2026-03-01', endDate: '2026-05-20' });
    });

    it('accepts a single-day range', () => {
      const day = new Date(2026, 7, 4);
      expect(
        resolveReportDateRange({ mode: 'custom', customStart: day, customEnd: day }, NOW),
      ).toEqual({ startDate: '2026-08-04', endDate: '2026-08-04' });
    });

    it('refuses a backwards range instead of sending it', () => {
      expect(
        resolveReportDateRange(
          { mode: 'custom', customStart: new Date(2026, 7, 20), customEnd: new Date(2026, 7, 1) },
          NOW,
        ),
      ).toBeNull();
    });

    it('is unusable while only one end is picked', () => {
      expect(
        resolveReportDateRange({ mode: 'custom', customStart: new Date(2026, 7, 1) }, NOW),
      ).toBeNull();
    });
  });
});

describe('buildRecentMonthAnchors', () => {
  it('starts with the current month and walks back', () => {
    const anchors = buildRecentMonthAnchors(3, NOW);
    expect(anchors.map((a) => [a.getFullYear(), a.getMonth(), a.getDate()])).toEqual([
      [2026, 7, 1],
      [2026, 6, 1],
      [2026, 5, 1],
    ]);
  });

  it('crosses the year boundary', () => {
    const anchors = buildRecentMonthAnchors(3, new Date(2026, 0, 15));
    expect(anchors.map((a) => [a.getFullYear(), a.getMonth()])).toEqual([
      [2026, 0],
      [2025, 11],
      [2025, 10],
    ]);
  });

  it('returns nothing for a non-positive count', () => {
    expect(buildRecentMonthAnchors(0, NOW)).toEqual([]);
  });
});

describe('reportSelectionFromAnalytics', () => {
  // What the whole mapping exists for: paging Analytics back to June and hitting
  // "Export report" must not generate August.
  it('carries a past month over as that whole month', () => {
    const selection = reportSelectionFromAnalytics(
      { range: 'month', month: '6', year: '2026' },
      NOW,
    );
    expect(selection?.mode).toBe('specificMonth');
    expect(resolveReportDateRange(selection!, NOW)).toEqual({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
  });

  it('ends the running month today rather than printing a future date', () => {
    const selection = reportSelectionFromAnalytics(
      { range: 'month', month: '8', year: '2026' },
      NOW,
    );
    expect(selection).toEqual({ mode: 'month' });
    expect(resolveReportDateRange(selection!, NOW)).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-17',
    });
  });

  it('maps a past year to its full span', () => {
    const selection = reportSelectionFromAnalytics({ range: 'year', year: '2025' }, NOW);
    expect(resolveReportDateRange(selection!, NOW)).toEqual({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });
  });

  it('ends the running year today', () => {
    const selection = reportSelectionFromAnalytics({ range: 'year', year: '2026' }, NOW);
    expect(selection).toEqual({ mode: 'year' });
    expect(resolveReportDateRange(selection!, NOW)).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-08-17',
    });
  });

  it("uses Analytics' Monday-based week, not the trailing-7-days preset", () => {
    // 17 Aug 2026 is a Monday, where the two differ most: the calendar week has
    // just started, the preset would reach back into the previous week.
    const selection = reportSelectionFromAnalytics({ range: 'week' }, NOW);
    expect(resolveReportDateRange(selection!, NOW)).toEqual({
      startDate: '2026-08-17',
      endDate: '2026-08-17',
    });
    expect(resolveReportDateRange({ mode: 'week' }, NOW)).toEqual({
      startDate: '2026-08-10',
      endDate: '2026-08-17',
    });
  });

  it('accepts numbers as well as the router\'s strings', () => {
    expect(reportSelectionFromAnalytics({ range: 'month', month: 6, year: 2026 }, NOW)?.mode).toBe(
      'specificMonth',
    );
  });

  it('falls back to the screen default when nothing usable was passed', () => {
    expect(reportSelectionFromAnalytics({}, NOW)).toBeNull();
    expect(reportSelectionFromAnalytics({ range: 'month', year: '2026' }, NOW)).toBeNull();
    expect(reportSelectionFromAnalytics({ range: 'month', month: '13', year: '2026' }, NOW))
      .toBeNull();
    expect(reportSelectionFromAnalytics({ range: 'quarter', year: '2026' }, NOW)).toBeNull();
    expect(reportSelectionFromAnalytics({ range: 'month', month: 'abc', year: '2026' }, NOW))
      .toBeNull();
  });
});

describe('formatMonthLabel', () => {
  it('capitalises a locale that lower-cases its month names', () => {
    expect(formatMonthLabel(new Date(2026, 7, 1), 'pl-PL')).toBe('Sierpień 2026');
  });

  it('formats English too', () => {
    expect(formatMonthLabel(new Date(2026, 7, 1), 'en-US')).toBe('August 2026');
  });
});

describe('formatDigestPeriod', () => {
  it('turns the server label into a readable month', () => {
    expect(formatDigestPeriod('2026-08', 'pl-PL')).toBe('Sierpień 2026');
  });

  it('passes through anything that is not YYYY-MM', () => {
    expect(formatDigestPeriod('2026-08-17 — 2026-09-01', 'pl-PL')).toBe(
      '2026-08-17 — 2026-09-01',
    );
    expect(formatDigestPeriod('2026-13', 'pl-PL')).toBe('2026-13');
  });
});
