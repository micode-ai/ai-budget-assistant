import { PassThrough } from 'stream';
import { ByteBudget } from './budget';
import { readData } from './dataReader';

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('ByteBudget', () => {
  it('reserves up to the limit and refuses beyond it without changing state', () => {
    const b = new ByteBudget(100);
    expect(b.tryReserve(60)).toBe(true);
    expect(b.tryReserve(41)).toBe(false);
    expect(b.inUse).toBe(60);
    expect(b.tryReserve(40)).toBe(true);
    b.release(100);
    expect(b.inUse).toBe(0);
    b.release(5);
    expect(b.inUse).toBe(0);
  });
});

describe('readData', () => {
  it('returns the bytes and holds the reservation until release()', async () => {
    const budget = new ByteBudget(1000);
    const s = new PassThrough();
    const p = readData(s, { maxBytes: 500, timeoutMs: 1000, budget });
    s.write(Buffer.from('hello '));
    s.end(Buffer.from('world'));
    const res = await p;
    expect(res.aborted).toBeNull();
    if (res.aborted === null) {
      expect(res.raw.toString()).toBe('hello world');
      expect(budget.inUse).toBe(11);
      res.release();
      expect(budget.inUse).toBe(0);
    }
  });

  it('aborts and destroys the stream the moment the size is exceeded (no draining)', async () => {
    const budget = new ByteBudget(10_000);
    const s = new PassThrough();
    const p = readData(s, { maxBytes: 10, timeoutMs: 1000, budget });
    s.write(Buffer.alloc(8));
    s.write(Buffer.alloc(8));
    expect(await p).toEqual({ aborted: 'size' });
    await tick();
    expect(s.destroyed).toBe(true);
    expect(budget.inUse).toBe(0);
  });

  it('aborts with "budget" when the global in-flight budget is exhausted, and frees its own bytes', async () => {
    const budget = new ByteBudget(100);
    expect(budget.tryReserve(90)).toBe(true); // another session
    const s = new PassThrough();
    const p = readData(s, { maxBytes: 1000, timeoutMs: 1000, budget });
    s.write(Buffer.alloc(5));
    s.write(Buffer.alloc(20));
    expect(await p).toEqual({ aborted: 'budget' });
    expect(s.destroyed).toBe(true);
    expect(budget.inUse).toBe(90);
  });

  it('aborts a slowloris that trickles past the total DATA time', async () => {
    const budget = new ByteBudget(1000);
    const s = new PassThrough();
    const p = readData(s, { maxBytes: 500, timeoutMs: 80, budget });
    s.write(Buffer.from('a'));
    const trickle = setInterval(() => !s.destroyed && s.write('a'), 20);
    expect(await p).toEqual({ aborted: 'timeout' });
    clearInterval(trickle);
    expect(s.destroyed).toBe(true);
    expect(budget.inUse).toBe(0);
  });
});
