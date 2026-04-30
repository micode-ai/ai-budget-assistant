import { cosineSimilarity, bestMatch } from './cosine';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('throws on length mismatch', () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow();
  });

  it('returns 0 for zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity([1, 0], [0, 0])).toBe(0);
  });

  it('is invariant under scaling', () => {
    const a = [3, 4];
    const b = [6, 8];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });
});

describe('bestMatch', () => {
  const query = [1, 0, 0];

  it('returns the highest-similarity candidate above threshold', () => {
    const candidates = [
      { id: 'a', vector: [0.9, 0.1, 0] },
      { id: 'b', vector: [0, 1, 0] },
      { id: 'c', vector: [0.99, 0.01, 0] },
    ];
    const result = bestMatch(query, candidates, 0.5);
    expect(result?.id).toBe('c');
    expect(result?.similarity).toBeGreaterThan(0.99);
  });

  it('returns null when no candidate crosses threshold', () => {
    const candidates = [{ id: 'a', vector: [0, 1] }];
    expect(bestMatch([1, 0], candidates, 0.5)).toBeNull();
  });

  it('returns null for empty candidate list', () => {
    expect(bestMatch(query, [], 0.5)).toBeNull();
  });

  it('returns the candidate at exactly the threshold', () => {
    // cosineSim of [1,0] vs [cos(60deg), sin(60deg)] = 0.5
    const candidates = [{ id: 'a', vector: [0.5, Math.sqrt(3) / 2] }];
    const result = bestMatch([1, 0], candidates, 0.5);
    expect(result?.id).toBe('a');
  });

  it('preserves meta on match', () => {
    const candidates = [{ id: 'a', vector: [1, 0], meta: 'category-name' }];
    const result = bestMatch([1, 0], candidates, 0.5);
    expect(result?.meta).toBe('category-name');
  });
});
