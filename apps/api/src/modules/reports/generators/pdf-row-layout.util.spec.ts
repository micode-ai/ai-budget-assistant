import { planTransactionRows } from './pdf-row-layout.util';

const OPTS = { startY: 100, minHeight: 14, pageBottom: 740, pageTopY: 50 };

/** Heights keyed by row label, standing in for PDFKit's heightOfString. */
const measureBy = (heights: Record<string, number>) => (row: string) => heights[row] ?? 8;

describe('planTransactionRows', () => {
  it('advances single-line rows by the minimum height', () => {
    const plan = planTransactionRows(['a', 'b', 'c'], () => 8, OPTS);
    expect(plan.map((p) => p.y)).toEqual([100, 114, 128]);
  });

  it('gives a wrapped row its measured height so the next row cannot land on it', () => {
    // This is the defect: 'long' needs 26pt (two lines). With the old fixed 14pt
    // step the next row started at 114 and collided with 'long' second line.
    const plan = planTransactionRows(
      ['short', 'long', 'after'],
      measureBy({ long: 26 }),
      OPTS,
    );
    expect(plan.map((p) => p.y)).toEqual([100, 114, 140]);
    expect(plan[1].height).toBe(26);
  });

  it('never lets a row start before the previous one ends', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'];
    const plan = planTransactionRows(rows, measureBy({ b: 40, d: 26 }), OPTS);
    for (let i = 1; i < plan.length; i += 1) {
      if (plan[i].page !== plan[i - 1].page) continue;
      expect(plan[i].y).toBeGreaterThanOrEqual(plan[i - 1].y + plan[i - 1].height);
    }
  });

  it('keeps a row that still fits above the footer', () => {
    // 720 + 14 = 734, which is at or above pageBottom.
    const plan = planTransactionRows(['a'], () => 8, { ...OPTS, startY: 720 });
    expect(plan[0]).toMatchObject({ page: 0, y: 720 });
  });

  it('breaks to a new page rather than running a row under the footer', () => {
    // 730 + 14 = 744 > 740, so even the FIRST row must move rather than be drawn
    // on top of the page footer.
    const plan = planTransactionRows(['a', 'b'], () => 8, { ...OPTS, startY: 730 });
    expect(plan[0]).toMatchObject({ page: 1, y: 50 });
    expect(plan[1]).toMatchObject({ page: 1, y: 64 });
  });

  it('accounts for a tall row when deciding the page break', () => {
    // A single-line row would still fit at 720; a three-line one would not.
    const plan = planTransactionRows(['tall'], measureBy({ tall: 42 }), {
      ...OPTS,
      startY: 720,
    });
    expect(plan[0]).toMatchObject({ page: 1, y: 50 });
  });

  it('does not loop forever on a row taller than a whole page', () => {
    // It cannot fit anywhere, so it is placed at the top of a fresh page and the
    // next row moves on again — never an infinite "add another page" cycle.
    const plan = planTransactionRows(['huge', 'next'], measureBy({ huge: 5000 }), OPTS);
    expect(plan[0]).toMatchObject({ page: 1, y: 50, height: 5000 });
    expect(plan[1]).toMatchObject({ page: 2, y: 50 });
  });

  it('treats a broken measurement as a single-line row instead of stacking', () => {
    const plan = planTransactionRows(['a', 'b'], () => NaN, OPTS);
    expect(plan.map((p) => p.y)).toEqual([100, 114]);
  });

  it('returns nothing for no rows', () => {
    expect(planTransactionRows([], () => 8, OPTS)).toEqual([]);
  });
});
