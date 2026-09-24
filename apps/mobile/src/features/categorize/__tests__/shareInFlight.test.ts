import { shareInFlight } from '../shareInFlight';

describe('shareInFlight', () => {
  it('gives concurrent callers with the same key the same request', async () => {
    let resolve!: (v: string) => void;
    const fn = jest.fn(() => new Promise<string>((r) => { resolve = r; }));
    const load = shareInFlight(fn);
    const a = load('acc-1');
    const b = load('acc-1');
    resolve('ok');
    await expect(a).resolves.toBe('ok');
    await expect(b).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('never hands one account the request started for another', async () => {
    const fn = jest.fn((key: string) => Promise.resolve(`data-${key}`));
    const load = shareInFlight(fn);
    const [a, b] = await Promise.all([load('acc-1'), load('acc-2')]);
    expect(a).toBe('data-acc-1');
    expect(b).toBe('data-acc-2');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('starts a fresh request once the previous one settled, even after a failure', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('ok');
    const load = shareInFlight(fn);
    await expect(load('acc-1')).rejects.toThrow('offline');
    await expect(load('acc-1')).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
