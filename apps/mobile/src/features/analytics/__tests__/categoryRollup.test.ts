import { rollUpCategoryTotals } from '../categoryRollup';

const tree: Record<string, string | null> = { P: 'G', Q: 'G', X: null, Y: null };
const parentOf = (id: string) => tree[id] ?? null;
const m = (e: [string | null, number][]) => new Map<string | null, number>(e);

/** Deterministic PRNG (mulberry32) so the property test is reproducible. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

describe('rollUpCategoryTotals', () => {
  it('rolls a child into its parent', () => {
    const r = rollUpCategoryTotals(m([['G', 100], ['P', 20]]), [], parentOf);
    expect(r).toHaveLength(1);
    expect(r[0].categoryId).toBe('G');
    expect(r[0].amount).toBe(120);
    expect(r[0].children.map((c) => [c.categoryId, c.amount, c.isParentSelf])).toEqual([
      ['P', 20, false],
      ['G', 100, true],
    ]);
  });

  it('omits the self slice when the parent has no own spend', () => {
    const r = rollUpCategoryTotals(m([['P', 20], ['Q', 5]]), [], parentOf);
    expect(r).toHaveLength(1);
    expect(r[0].amount).toBe(25);
    expect(r[0].children.some((c) => c.isParentSelf)).toBe(false);
  });

  it('null key stays top-level', () => {
    const r = rollUpCategoryTotals(m([[null, 7], ['P', 3]]), [], parentOf);
    const n = r.find((x) => x.categoryId === null)!;
    expect(n.amount).toBe(7);
    expect(n.children).toEqual([]);
  });

  it('unknown parent keeps the child top-level', () => {
    const r = rollUpCategoryTotals(m([['P', 4]]), [], () => null);
    expect(r).toHaveLength(1);
    expect(r[0].categoryId).toBe('P');
    expect(r[0].children).toEqual([]);
  });

  it('top-level total equals input total', () => {
    const random = seeded(20261027);
    for (let t = 0; t < 20; t++) {
      const keys: (string | null)[] = ['G', 'P', 'Q', 'X', 'Y', null];
      const input = m(
        keys.filter(() => random() > 0.3).map((k): [string | null, number] => [k, Math.round(random() * 1000) / 10]),
      );
      const total = [...input.values()].reduce((a, b) => a + b, 0);
      const out = rollUpCategoryTotals(input, [], parentOf).reduce((a, n) => a + n.amount, 0);
      expect(out).toBeCloseTo(total, 6);
    }
  });

  it('top-level total equals input total for a 3-level or self-parent tree', () => {
    // A -> B -> C (three levels) and S -> S (self-parent): malformed trees a
    // well-behaved parentOf never yields, but the roll-up must still not drop money.
    const bad: Record<string, string> = { A: 'B', B: 'C', S: 'S' };
    const badParentOf = (id: string) => bad[id] ?? null;
    const input = m([['A', 1], ['B', 2], ['C', 4], ['S', 8], [null, 16]]);
    const nodes = rollUpCategoryTotals(input, [m([['A', 1], ['S', 2]])], badParentOf);
    expect(nodes.reduce((a, n) => a + n.amount, 0)).toBe(31);
    const s = nodes.find((n) => n.categoryId === 'S')!;
    expect(s.amount).toBe(8);
    expect(s.children).toEqual([]);
    expect(s.trailing).toEqual([2]);
  });

  it('trailing series sums own and children per month', () => {
    const r = rollUpCategoryTotals(
      m([['G', 10], ['P', 5]]),
      [m([['G', 1], ['P', 2], ['Q', 4]]), m([['P', 3]])],
      parentOf,
    );
    expect(r[0].trailing).toEqual([7, 3]);
    expect(r[0].children.find((c) => c.categoryId === 'P')!.trailing).toEqual([2, 3]);
  });

  it('parent with children only in trailing months has no children now', () => {
    const r = rollUpCategoryTotals(m([['G', 10]]), [m([['P', 2]])], parentOf);
    expect(r[0].children).toEqual([]);
    expect(r[0].trailing).toEqual([2]);
  });
});
