import { shareInFlight } from '../shareInFlight';

describe('shareInFlight', () => {
  it('gives concurrent callers the same request', async () => {
    let resolve!: (v: string) => void;
    const fn = jest.fn(() => new Promise<string>((r) => { resolve = r; }));
    const load = shareInFlight(fn);
    const a = load();
    const b = load();
    resolve('ok');
    await expect(a).resolves.toBe('ok');
    await expect(b).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh request once the previous one settled, even after a failure', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('ok');
    const load = shareInFlight(fn);
    await expect(load()).rejects.toThrow('offline');
    await expect(load()).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
