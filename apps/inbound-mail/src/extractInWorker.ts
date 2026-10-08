import { join } from 'path';
import { Worker } from 'worker_threads';
import type { ExtractContext, ExtractedMessage } from './extract';

export class ExtractTimeoutError extends Error {
  constructor() {
    super('extract timed out');
    this.name = 'ExtractTimeoutError';
  }
}

export interface WorkerOptions {
  timeoutMs: number;
  /** Absolute path of the compiled worker script (tests point this at a fixture). */
  workerFile?: string;
  maxOldGenerationSizeMb?: number;
}

/**
 * One short-lived worker per message: a parser that hangs or blows up its heap is terminated
 * without taking the SMTP loop (or the process) with it. The worker's own heap is capped.
 */
export function extractInWorker(raw: Buffer, ctx: ExtractContext, opts: WorkerOptions): Promise<ExtractedMessage> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(opts.workerFile ?? join(__dirname, 'extractWorker.js'), {
      workerData: { raw, ctx },
      resourceLimits: { maxOldGenerationSizeMb: opts.maxOldGenerationSizeMb ?? 64 },
    });
    let done = false;
    const end = (fn: () => void): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void worker.terminate();
      fn();
    };
    const timer = setTimeout(() => end(() => reject(new ExtractTimeoutError())), opts.timeoutMs);
    worker.once('message', (m: { ok: boolean; result?: ExtractedMessage; error?: string }) =>
      end(() => (m.ok && m.result ? resolve(m.result) : reject(new Error(m.error ?? 'extract failed')))),
    );
    worker.once('error', (err) => end(() => reject(err)));
    worker.once('exit', (code) => end(() => reject(new Error(`extract worker exited ${code}`))));
  });
}
