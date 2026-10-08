import { join } from 'path';
import { ExtractTimeoutError, extractInWorker } from './extractInWorker';
import { PASSING_AUTH } from './eml.testutil';

const ctx = { remoteIp: '1.1.1.1', helo: 'h', envelopeFrom: 'a@b.example', auth: PASSING_AUTH };
const fixture = (name: string): string => join(__dirname, 'testfixtures', name);

describe('extractInWorker', () => {
  it('returns the worker result', async () => {
    const r = await extractInWorker(Buffer.from('x'), ctx, { timeoutMs: 5000, workerFile: fixture('ok-worker.js') });
    expect(r).toMatchObject({ kind: 'receipt', subject: 'from-worker' });
  });

  it('terminates a hung parser at the timeout', async () => {
    const started = Date.now();
    await expect(
      extractInWorker(Buffer.from('x'), ctx, { timeoutMs: 200, workerFile: fixture('hang-worker.js') }),
    ).rejects.toBeInstanceOf(ExtractTimeoutError);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('rejects when the worker crashes', async () => {
    await expect(
      extractInWorker(Buffer.from('x'), ctx, { timeoutMs: 5000, workerFile: fixture('crash-worker.js') }),
    ).rejects.toThrow();
  });
});
