import { createAccountListCache } from '../accountListCache';

type Item = { id: string };

describe('accountListCache (ABA-833)', () => {
  it('notifies every subscriber on each write, so a mounted tab sees a pet added elsewhere', () => {
    const cache = createAccountListCache<Item>();
    const tab = jest.fn();
    const settings = jest.fn();
    cache.subscribe(tab);
    cache.subscribe(settings);

    cache.set('acc', []);
    expect(tab).toHaveBeenCalledTimes(1);
    expect(cache.get('acc')).toEqual([]);

    cache.update('acc', (list) => [...list, { id: 'yoka' }]);
    expect(tab).toHaveBeenCalledTimes(2);
    expect(settings).toHaveBeenCalledTimes(2);
    expect(cache.get('acc')).toEqual([{ id: 'yoka' }]);
  });

  it('stops notifying after unsubscribe', () => {
    const cache = createAccountListCache<Item>();
    const l = jest.fn();
    const off = cache.subscribe(l);
    off();
    cache.set('acc', [{ id: 'a' }]);
    expect(l).not.toHaveBeenCalled();
  });

  it('keeps accounts apart, and update on an uncached account is a no-op', () => {
    const cache = createAccountListCache<Item>();
    const l = jest.fn();
    cache.subscribe(l);
    cache.update('other', () => [{ id: 'x' }]);
    expect(cache.get('other')).toBeUndefined();
    expect(l).not.toHaveBeenCalled();
    cache.set('a', [{ id: '1' }]);
    expect(cache.get('b')).toBeUndefined();
  });

  it('marks a missing or old entry stale, so the next reader revalidates an early empty answer', () => {
    const cache = createAccountListCache<Item>(1000);
    expect(cache.isStale('acc', 0)).toBe(true);
    cache.set('acc', [], 10_000);
    expect(cache.isStale('acc', 10_500)).toBe(false);
    expect(cache.isStale('acc', 11_001)).toBe(true);
    // A confirmed write keeps the load time: it does not postpone revalidation.
    cache.update('acc', (l) => [...l, { id: 'n' }]);
    expect(cache.isStale('acc', 11_001)).toBe(true);
  });

  it('clear (sign-out) and delete drop entries and notify readers', () => {
    const cache = createAccountListCache<Item>();
    cache.set('a', [{ id: '1' }]);
    cache.set('b', [{ id: '2' }]);
    const l = jest.fn();
    cache.subscribe(l);
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    cache.clear();
    expect(cache.get('b')).toBeUndefined();
    expect(l).toHaveBeenCalledTimes(2);
    cache.clear();
    expect(l).toHaveBeenCalledTimes(2);
  });

  it('a listener that unsubscribes while notified does not break the others', () => {
    const cache = createAccountListCache<Item>();
    const second = jest.fn();
    const off = cache.subscribe(() => off());
    cache.subscribe(second);
    cache.set('a', []);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
