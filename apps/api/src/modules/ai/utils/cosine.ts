export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export interface VectorCandidate<T> {
  id: T;
  vector: number[];
  meta?: unknown;
}

export interface VectorMatch<T> {
  id: T;
  similarity: number;
  meta?: unknown;
}

export function bestMatch<T>(
  query: number[],
  candidates: VectorCandidate<T>[],
  threshold: number,
): VectorMatch<T> | null {
  let best: VectorMatch<T> | null = null;
  for (const c of candidates) {
    const sim = cosineSimilarity(query, c.vector);
    if (sim >= threshold && (!best || sim > best.similarity)) {
      best = { id: c.id, similarity: sim, meta: c.meta };
    }
  }
  return best;
}
