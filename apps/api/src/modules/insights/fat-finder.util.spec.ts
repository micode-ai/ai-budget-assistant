import { computeSeverity, normalizeFatFinderFindings } from './fat-finder.util';

describe('computeSeverity', () => {
  it.each([
    [0, 1000, 'low'],
    [49, 1000, 'low'],
    [50, 1000, 'medium'],
    [100, 1000, 'medium'],
    [101, 1000, 'high'],
    [10, 0, 'low'],
  ])('savings %d of %d -> %s', (s, t, expected) => {
    expect(computeSeverity(s, t)).toBe(expected);
  });
});

describe('normalizeFatFinderFindings', () => {
  const raw = (over: Record<string, unknown> = {}) => ({
    type: 'subscription',
    title: 'Netflix',
    description: 'd',
    currentMonthly: 60,
    suggestedMonthly: 20,
    actionSuggestion: 'cancel',
    relatedExpenses: [{ description: 'n', amount: 60, date: '2026-01-02' }],
    ...over,
  });

  it('computes savings, severity and total in code', () => {
    const { findings, totalPotentialSavings } = normalizeFatFinderFindings(
      [raw(), raw({ title: 'B', currentMonthly: 100, suggestedMonthly: 90 })],
      500,
    );
    expect(findings[0]).toMatchObject({ potentialSavings: 40, severity: 'medium' });
    expect(findings[1]).toMatchObject({ potentialSavings: 10, severity: 'low' });
    expect(totalPotentialSavings).toBe(50);
  });

  it('clamps suggestedMonthly into [0, currentMonthly]', () => {
    const { findings } = normalizeFatFinderFindings(
      [raw({ suggestedMonthly: 500 }), raw({ suggestedMonthly: -10 })],
      1000,
    );
    expect(findings[0]).toMatchObject({ suggestedMonthly: 60, potentialSavings: 0 });
    expect(findings[1]).toMatchObject({ suggestedMonthly: 0, potentialSavings: 60 });
  });

  it('ignores model-supplied potentialSavings/severity, drops invalid entries and caps at 7', () => {
    const many = Array.from({ length: 10 }, () => raw({ potentialSavings: 9999, severity: 'high' }));
    const { findings } = normalizeFatFinderFindings([null, { title: 5 }, ...many], 100000);
    expect(findings).toHaveLength(7);
    expect(findings[0].potentialSavings).toBe(40);
    expect(findings[0].severity).toBe('low');
  });

  it('returns empty for non-array input', () => {
    expect(normalizeFatFinderFindings(undefined, 100)).toEqual({ findings: [], totalPotentialSavings: 0 });
  });
});
