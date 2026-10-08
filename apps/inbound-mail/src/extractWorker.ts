import { parentPort, workerData } from 'worker_threads';
import { extractMessage, type ExtractContext } from './extract';

/** Runs inside a worker_thread: mailparser + html-to-text on untrusted bytes, off the main loop. */
const data = workerData as { raw: Uint8Array; ctx: ExtractContext };
extractMessage(Buffer.from(data.raw), data.ctx).then(
  (result) => parentPort?.postMessage({ ok: true, result }),
  (err: unknown) => parentPort?.postMessage({ ok: false, error: err instanceof Error ? err.name : 'unknown' }),
);
