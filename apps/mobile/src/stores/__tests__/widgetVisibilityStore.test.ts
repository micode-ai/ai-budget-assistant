import { WIDGET_KEYS, resolveVisibility, resolveOrder } from '../widgetVisibilityStore';

describe('widgetVisibilityStore', () => {
  it('defaults every widget to visible when nothing is stored', () => {
    const vis = resolveVisibility(() => undefined);
    for (const k of WIDGET_KEYS) {
      expect(vis[k]).toBe(true);
    }
  });

  it('order defaults to WIDGET_KEYS when unset', () => {
    expect(resolveOrder(undefined)).toEqual([...WIDGET_KEYS]);
  });

  it('inserts a newly-added widget at its intended position, not the end', () => {
    // familyFeed is WIDGET_KEYS[0]; simulate a persisted order from before it
    // existed by omitting it.
    const withoutFamilyFeed = WIDGET_KEYS.filter((k) => k !== 'familyFeed');
    const out = resolveOrder(JSON.stringify(withoutFamilyFeed));
    expect(out[0]).toBe('familyFeed');
    expect(out).toEqual([...WIDGET_KEYS]);
  });
});
