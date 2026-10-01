/**
 * The loaders' re-entry guard must coalesce calls for the same account only.
 * The account-blind version handed a post-switch call the previous account's
 * promise, which then aborted on its own "account switched" check — so the new
 * account was never loaded and its screens kept the old account's amounts.
 */
import { createAccountScopedInflight } from '../accountScopedInflight';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('createAccountScopedInflight', () => {
  it('joins a call for the same account to the running one', async () => {
    const coalesce = createAccountScopedInflight();
    const d = deferred();
    const run = jest.fn(() => d.promise);

    const a = coalesce('acc-1', run);
    const b = coalesce('acc-1', run);
    expect(b).toBe(a);
    d.resolve();
    await a;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs a call for another account after the running one instead of joining it', async () => {
    const coalesce = createAccountScopedInflight();
    const d = deferred();
    const order: string[] = [];
    const runA = jest.fn(async () => { await d.promise; order.push('acc-1'); });
    const runB = jest.fn(async () => { order.push('acc-2'); });

    const a = coalesce('acc-1', runA);
    const b = coalesce('acc-2', runB);
    expect(b).not.toBe(a);
    // Not started yet: the new run waits so it is the last to write.
    await Promise.resolve();
    expect(runB).not.toHaveBeenCalled();

    d.resolve();
    await b;
    expect(order).toEqual(['acc-1', 'acc-2']);
  });

  it('still runs the next account when the previous run rejected', async () => {
    const coalesce = createAccountScopedInflight();
    const a = coalesce('acc-1', () => Promise.reject(new Error('offline')));
    const runB = jest.fn(async () => {});
    const b = coalesce('acc-2', runB);

    await expect(a).rejects.toThrow('offline');
    await b;
    expect(runB).toHaveBeenCalledTimes(1);
  });

  it('starts fresh once the running call has settled', async () => {
    const coalesce = createAccountScopedInflight();
    const run = jest.fn(async () => {});
    await coalesce('acc-1', run);
    await coalesce('acc-1', run);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
