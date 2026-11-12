/**
 * The child share card's content: year, year total, average per month and the
 * 800+ coverage percent — the name only when the parent turns it on, and never
 * a merchant or any line of spending.
 */
import type { TFunction } from 'i18next';
import type { ChildCostSummary } from '@budget/shared-types';
import { buildChildSharePayload } from '../childShare';
import { collectWebLines } from '../childCosts';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}(${JSON.stringify(opts)})` : key) as unknown as TFunction;

const summary: ChildCostSummary = {
  monthTotal: 120,
  yearTotal: 2400,
  averagePerMonth: 218.18,
  byCategory: [{ categoryId: 'food', amount: 2400 }],
  months: [],
  fxApproximate: false,
};

describe('buildChildSharePayload', () => {
  it('leaves the name out when the toggle is off (null)', () => {
    const p = buildChildSharePayload({ year: 2026, summary, coverage: null, currency: 'PLN', name: null, t });
    expect(p.title).toBe('childCosts.share.title({"year":2026})');
    expect(JSON.stringify(p)).not.toContain('Zosia');
    expect(p.lines).toHaveLength(2);
  });

  it('puts the name in the title only when given', () => {
    const p = buildChildSharePayload({ year: 2026, summary, coverage: null, currency: 'PLN', name: 'Zosia', t });
    expect(p.title).toContain('Zosia');
    expect(p.lines.some((l) => l.value.includes('Zosia') || l.label.includes('Zosia'))).toBe(false);
  });

  it('adds the coverage percent with benefit income, and nothing about categories or merchants', () => {
    const p = buildChildSharePayload({
      year: 2026,
      summary,
      coverage: { benefit: 9600, spending: 2400, percent: 400 },
      currency: 'PLN',
      name: null,
      t,
    });
    expect(p.lines).toHaveLength(3);
    expect(p.lines[2].value).toBe('400%');
    expect(JSON.stringify(p)).not.toContain('food');
  });
});

describe('collectWebLines', () => {
  const line = (over: Record<string, unknown>) =>
    ({ id: 'l1', expenseId: 'e1', description: 'x', totalPrice: 10, childId: null, isDeleted: false, ...over }) as never;

  it('takes the pulled lines of a line-attributed expense', () => {
    const lines = collectWebLines(
      [{ id: 'e1', items: [line({ childId: 'kidA', categoryId: 'toys' })] } as never],
      {},
    );
    expect(lines).toEqual([expect.objectContaining({ childId: 'kidA', categoryId: 'toys' })]);
  });

  it('prefers lines loaded and edited this session, keeping the pulled category', () => {
    const lines = collectWebLines(
      [{ id: 'e1', items: [line({ childId: 'kidA', categoryId: 'toys' })] } as never],
      { e1: [line({ childId: 'kidB' })] },
    );
    expect(lines).toEqual([expect.objectContaining({ childId: 'kidB', categoryId: 'toys' })]);
  });

  it('ignores loaded lines of an expense with no attribution anywhere', () => {
    expect(collectWebLines([{ id: 'e1' } as never], { e1: [line({})] })).toEqual([]);
  });
});
