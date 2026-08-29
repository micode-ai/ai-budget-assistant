import { createOrderedVisibilityStore } from '../orderedVisibilityStore';

const KEYS = ['a', 'b', 'c', 'd'] as const;
type Key = (typeof KEYS)[number];

describe('createOrderedVisibilityStore pure helpers', () => {
  it('resolveVisibility defaults everything to true when no defaultVisibility is given', () => {
    const { resolveVisibility } = createOrderedVisibilityStore(KEYS, {
      mmkvId: 'test-default-true',
      orderStorageKey: 'order',
    });
    const vis = resolveVisibility(() => undefined);
    expect(vis).toEqual({ a: true, b: true, c: true, d: true });
  });

  it('resolveVisibility falls back to a supplied per-key default', () => {
    const { resolveVisibility } = createOrderedVisibilityStore(KEYS, {
      mmkvId: 'test-custom-default',
      orderStorageKey: 'order',
      defaultVisibility: { a: true, b: false, c: true, d: false },
    });
    const vis = resolveVisibility(() => undefined);
    expect(vis.b).toBe(false);
    expect(vis.d).toBe(false);
    expect(vis.a).toBe(true);
  });

  it('resolveVisibility lets an explicit stored value win over the default', () => {
    const { resolveVisibility } = createOrderedVisibilityStore(KEYS, {
      mmkvId: 'test-explicit-wins',
      orderStorageKey: 'order',
      defaultVisibility: { a: true, b: false, c: true, d: true },
    });
    const read = (k: string) => (k === 'b' ? 'true' : undefined);
    expect(resolveVisibility(read).b).toBe(true);
  });

  it('resolveOrder defaults to the key list when unset or malformed', () => {
    const { resolveOrder } = createOrderedVisibilityStore(KEYS, {
      mmkvId: 'test-order-default',
      orderStorageKey: 'order',
    });
    expect(resolveOrder(undefined)).toEqual([...KEYS]);
    expect(resolveOrder('{not json')).toEqual([...KEYS]);
  });

  it('resolveOrder drops unknown keys and de-dupes', () => {
    const { resolveOrder } = createOrderedVisibilityStore(KEYS, {
      mmkvId: 'test-order-dedupe',
      orderStorageKey: 'order',
    });
    const out = resolveOrder(JSON.stringify(['c', 'bogus', 'a', 'c']));
    expect(out.filter((k) => k === 'c')).toHaveLength(1);
    expect(out).not.toContain('bogus');
  });

  it('append mode (default) puts missing keys at the end', () => {
    const { resolveOrder } = createOrderedVisibilityStore(KEYS, {
      mmkvId: 'test-append-mode',
      orderStorageKey: 'order',
    });
    // 'a' was persisted before 'd' existed in KEYS.
    const out = resolveOrder(JSON.stringify(['c', 'a']));
    expect(out).toEqual(['c', 'a', 'b', 'd']);
  });

  it('insertMissingByPosition mode inserts a missing key at its intended slot', () => {
    const { resolveOrder } = createOrderedVisibilityStore(KEYS, {
      mmkvId: 'test-positional-mode',
      orderStorageKey: 'order',
      insertMissingByPosition: true,
    });
    // KEYS = [a, b, c, d]; persisted order lacks 'b' (index 1) -> reinserted
    // between 'a' and 'c', not appended after 'd'.
    const out = resolveOrder(JSON.stringify(['a', 'c', 'd']));
    expect(out).toEqual(['a', 'b', 'c', 'd']);
  });

  it('insertMissingByPosition appends when the missing key sorts last', () => {
    const { resolveOrder } = createOrderedVisibilityStore(KEYS, {
      mmkvId: 'test-positional-append',
      orderStorageKey: 'order',
      insertMissingByPosition: true,
    });
    const out = resolveOrder(JSON.stringify(['a', 'b', 'c']));
    expect(out).toEqual(['a', 'b', 'c', 'd']);
  });

  it('store actions persist through the visibility key prefix', () => {
    const { useStore } = createOrderedVisibilityStore(KEYS, {
      mmkvId: 'test-store-actions',
      orderStorageKey: 'order',
      visibilityKeyPrefix: 'vis:',
    });
    useStore.getState().toggle('a' as Key);
    expect(useStore.getState().visibility.a).toBe(false);
    useStore.getState().setVisible('a' as Key, true);
    expect(useStore.getState().visibility.a).toBe(true);
    useStore.getState().reorder(['d', 'a', 'b', 'c'] as Key[]);
    expect(useStore.getState().order).toEqual(['d', 'a', 'b', 'c']);
    useStore.getState().resetOrder();
    expect(useStore.getState().order).toEqual([...KEYS]);
  });
});
