import { createTransferQueueFlusher } from '../transferQueueFlusher';

describe('createTransferQueueFlusher', () => {
  it('runs flush once per request outside the interval', async () => {
    let t = 0;
    const flush = jest.fn(async () => {});
    const f = createTransferQueueFlusher({ flush, now: () => t, minIntervalMs: 1000 });
    expect(await f.request()).toBe(true);
    t = 1000;
    expect(await f.request()).toBe(true);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('throttles requests inside the interval', async () => {
    let t = 0;
    const flush = jest.fn(async () => {});
    const f = createTransferQueueFlusher({ flush, now: () => t, minIntervalMs: 1000 });
    await f.request();
    t = 999;
    expect(await f.request()).toBe(false);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('does not double-send while a flush is in flight', async () => {
    let release!: () => void;
    const flush = jest.fn(() => new Promise<void>((r) => (release = r)));
    const f = createTransferQueueFlusher({ flush, now: () => 0, minIntervalMs: 0 });
    const first = f.request();
    expect(await f.request()).toBe(false);
    release();
    await first;
    expect(flush).toHaveBeenCalledTimes(1);
    const second = f.request();
    release();
    expect(await second).toBe(true);
  });

  it('warns, never throws, when flush rejects', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const f = createTransferQueueFlusher({
      flush: async () => {
        throw new Error('offline');
      },
      now: () => 0,
    });
    await expect(f.request()).resolves.toBe(true);
    expect(warn).toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
    warn.mockRestore();
    err.mockRestore();
  });
});
