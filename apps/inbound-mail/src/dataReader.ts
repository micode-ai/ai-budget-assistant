import type { Readable } from 'stream';
import type { ByteBudget } from './budget';

export type AbortReason = 'size' | 'budget' | 'timeout';

export type DataResult =
  | { aborted: null; raw: Buffer; release: () => void }
  | { aborted: AbortReason };

export interface DataLimits {
  maxBytes: number;
  timeoutMs: number;
  budget: ByteBudget;
}

/**
 * Reads a DATA stream into memory under three hard limits: the per-message size, the global
 * in-flight byte budget and a total wall-clock time. On any breach it stops buffering,
 * destroys the stream (it does NOT keep draining a hostile upload) and frees what it
 * reserved. On success the caller owns `release()` and must call it once the bytes are done.
 */
export function readData(stream: Readable, limits: DataLimits): Promise<DataResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const finish = (result: DataResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      resolve(result);
    };
    const abort = (reason: AbortReason): void => {
      limits.budget.release(total);
      chunks.length = 0;
      stream.destroy();
      finish({ aborted: reason });
    };
    const onData = (chunk: Buffer): void => {
      if (settled) return;
      if (total + chunk.length > limits.maxBytes) return abort('size');
      if (!limits.budget.tryReserve(chunk.length)) return abort('budget');
      total += chunk.length;
      chunks.push(chunk);
    };
    const onEnd = (): void => {
      const held = total;
      finish({
        aborted: null,
        raw: Buffer.concat(chunks),
        release: () => limits.budget.release(held),
      });
      chunks.length = 0;
    };
    const onError = (): void => abort('timeout');
    const timer = setTimeout(() => abort('timeout'), limits.timeoutMs);

    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onError);
  });
}
