import { mergeConversationLists, type ConversationRow } from './conversation-list';

interface Row extends ConversationRow {
  label: string;
}

const row = (id: string, label = id): Row => ({ id, label });

describe('mergeConversationLists', () => {
  // Guards against the naive `[...pinned, ...recent]` concat: without the
  // dedup, a conversation that is BOTH pinned and inside the 20
  // most-recently-updated would render twice on the rail — once in the
  // pinned block, once again in the recent block.
  it('keeps a row that is both pinned and in the recent 20 exactly once, in the pinned block', () => {
    const pinned = [row('c1')];
    const recent = [row('c1'), row('c2')];

    const merged = mergeConversationLists(pinned, recent);

    expect(merged.filter((r) => r.id === 'c1')).toHaveLength(1);
    expect(merged).toEqual([row('c1'), row('c2')]);
  });

  // This is the entire justification for two queries instead of one sorted
  // list: a conversation pinned three months ago is outside `take: 20`
  // ordered by `updatedAt desc`, so it is never in `recent` at all. If the
  // merge only returned `recent` (or intersected the two arrays instead of
  // unioning them), an old pinned conversation would silently vanish from
  // the rail the moment twenty other conversations became more recent.
  it('includes a pinned row that is outside the recent 20 at all', () => {
    const pinned = [row('old-pin')];
    const recent = [row('c1'), row('c2'), row('c3')];

    const merged = mergeConversationLists(pinned, recent);

    expect(merged.map((r) => r.id)).toContain('old-pin');
    expect(merged).toHaveLength(4);
  });

  // Guards against a merge that assumes pins always exist (e.g. `pinned[0]`
  // indexing, or a fallback that substitutes something when the array is
  // empty) — the common case, an account with no pins, must reduce to
  // exactly today's recent-list behaviour.
  it('returns exactly the recent list when nothing is pinned', () => {
    const recent = [row('c1'), row('c2')];

    expect(mergeConversationLists([], recent)).toEqual(recent);
  });

  // Symmetric guard: an account where every visible conversation happens to
  // be pinned (or the recent query legitimately returns nothing) must not
  // crash on an empty `recent` array or silently drop the pinned rows.
  it('returns exactly the pinned list when there is no recent list', () => {
    const pinned = [row('p1'), row('p2')];

    expect(mergeConversationLists(pinned, [])).toEqual(pinned);
  });

  it('returns an empty array when both inputs are empty', () => {
    expect(mergeConversationLists([], [])).toEqual([]);
  });

  // The function must not re-sort — both queries already arrive `updatedAt
  // desc`, and re-sorting here (e.g. by id, or by re-deriving an order) would
  // silently disagree with the server order the client is meant to trust
  // verbatim. Passing inputs that are NOT in "natural" order and asserting
  // the merge preserves each block's given order (pinned first, then
  // recent-minus-pinned) catches a merge that quietly imposes its own order.
  it('preserves the order of each input block: pinned first, then recent minus pinned', () => {
    const pinned = [row('z-pin'), row('a-pin')];
    const recent = [row('m'), row('z-pin'), row('b')];

    const merged = mergeConversationLists(pinned, recent);

    expect(merged.map((r) => r.id)).toEqual(['z-pin', 'a-pin', 'm', 'b']);
  });

  // Guards against a merge that mutates its inputs (e.g. `pinned.push(...)`),
  // which would corrupt the caller's already-fetched arrays if they are read
  // again for anything else.
  it('does not mutate its inputs', () => {
    const pinned = [row('c1')];
    const recent = [row('c1'), row('c2')];
    const pinnedCopy = [...pinned];
    const recentCopy = [...recent];

    mergeConversationLists(pinned, recent);

    expect(pinned).toEqual(pinnedCopy);
    expect(recent).toEqual(recentCopy);
  });
});
