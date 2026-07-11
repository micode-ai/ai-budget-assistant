import {
  clusterContributors,
  distinctClusterCount,
  DEFAULT_CORRELATION,
} from './community-price-correlation';

// Footprint helper: a contributor with the given cell keys.
function fp(cells: string[]): Set<string> {
  return new Set(cells);
}

const BROAD = ['p1|s1|r1|w1', 'p1|s1|r1|w2', 'p2|s2|r1|w1', 'p2|s2|r1|w2', 'p3|s3|r1|w1']; // 5 cells

describe('clusterContributors', () => {
  it('collapses a Sybil ring with identical broad footprints into one cluster', () => {
    const footprints = new Map<string, Set<string>>();
    for (const k of ['a', 'b', 'c', 'd', 'e']) footprints.set(k, fp(BROAD));
    const map = clusterContributors(footprints);
    const roots = new Set([...map.values()]);
    expect(roots.size).toBe(1); // 5 accounts → 1 cluster
  });

  it('does NOT cluster organic shoppers who merely overlap on a popular cell', () => {
    // Each buys milk at the same store one week (share 1 cell) but otherwise diverge.
    const footprints = new Map<string, Set<string>>([
      ['x', fp(['milk|biedronka|krakow|w1', 'x1|s|r|w', 'x2|s|r|w', 'x3|s|r|w', 'x4|s|r|w'])],
      ['y', fp(['milk|biedronka|krakow|w1', 'y1|s|r|w', 'y2|s|r|w', 'y3|s|r|w', 'y4|s|r|w'])],
      ['z', fp(['milk|biedronka|krakow|w1', 'z1|s|r|w', 'z2|s|r|w', 'z3|s|r|w', 'z4|s|r|w'])],
    ]);
    const map = clusterContributors(footprints);
    expect(new Set([...map.values()]).size).toBe(3); // stay independent
  });

  it('never clusters contributors below the minFootprint (small footprints)', () => {
    // Identical but tiny (2 cells < default 5) — organic light users must be spared.
    const footprints = new Map<string, Set<string>>([
      ['a', fp(['milk|b|k|w1', 'bread|b|k|w1'])],
      ['b', fp(['milk|b|k|w1', 'bread|b|k|w1'])],
      ['c', fp(['milk|b|k|w1', 'bread|b|k|w1'])],
    ]);
    const map = clusterContributors(footprints);
    expect(new Set([...map.values()]).size).toBe(3);
  });

  it('separates two distinct rings and keeps an independent contributor apart', () => {
    const ringA = ['A1|s|r|w', 'A2|s|r|w', 'A3|s|r|w', 'A4|s|r|w', 'A5|s|r|w'];
    const ringB = ['B1|s|r|w', 'B2|s|r|w', 'B3|s|r|w', 'B4|s|r|w', 'B5|s|r|w'];
    const footprints = new Map<string, Set<string>>([
      ['a1', fp(ringA)], ['a2', fp(ringA)], ['a3', fp(ringA)],
      ['b1', fp(ringB)], ['b2', fp(ringB)], ['b3', fp(ringB)],
      ['solo', fp(['S1|s|r|w', 'S2|s|r|w', 'S3|s|r|w', 'S4|s|r|w', 'S5|s|r|w'])],
    ]);
    const map = clusterContributors(footprints);
    // ringA→1, ringB→1, solo→1 == 3 clusters
    expect(new Set([...map.values()]).size).toBe(3);
    expect(map.get('a1')).toBe(map.get('a3'));
    expect(map.get('b1')).toBe(map.get('b3'));
    expect(map.get('a1')).not.toBe(map.get('b1'));
    expect(map.get('solo')).not.toBe(map.get('a1'));
  });

  it('respects a stricter Jaccard threshold', () => {
    // 80% overlap: merges at 0.8, stays apart at the default 0.9.
    const base = ['c1', 'c2', 'c3', 'c4'];
    const a = fp([...base, 'c5']); // {c1..c5}
    const b = fp([...base, 'c6']); // {c1..c4, c6} → Jaccard = 4/6 ≈ 0.67
    const footprints = new Map([['a', a], ['b', b]]);
    expect(new Set([...clusterContributors(footprints, { minFootprint: 5, jaccard: 0.6 }).values()]).size).toBe(1);
    expect(new Set([...clusterContributors(footprints, DEFAULT_CORRELATION).values()]).size).toBe(2);
  });
});

describe('distinctClusterCount', () => {
  it('counts raw distinct contributors when no cluster map is given', () => {
    expect(distinctClusterCount(['a', 'b', 'c', 'a'])).toBe(3);
    expect(distinctClusterCount(['a', 'b', 'c'], null)).toBe(3);
  });

  it('counts a ring as one when the cluster map merges it', () => {
    const map = new Map([['a', 'root'], ['b', 'root'], ['c', 'root'], ['ind', 'ind']]);
    expect(distinctClusterCount(['a', 'b', 'c'], map)).toBe(1); // ring → 1
    expect(distinctClusterCount(['a', 'b', 'ind'], map)).toBe(2); // ring + one independent
  });
});
