import {
  resolveRailState,
  railIsVisible,
  chatColumnWidth,
  currentConversationTitle,
  conversationDateLabel,
  sortConversationsForDisplay,
  pinnedGroupBoundary,
  conversationMenuItems,
  canSaveRename,
  type RailState,
} from '../chatLayout';
import { CHAT_COLUMN_MAX_WIDTH } from '@/components/webLayout.constants';
import type { ChatConversation } from '@budget/shared-types';

const conversation = (id: string, extra: Partial<ChatConversation> = {}): ChatConversation => ({
  id,
  userId: 'u1',
  isShared: false,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  ...extra,
});

describe('resolveRailState', () => {
  // Catches: a `chatStore` that flips straight to 'hidden' before the first
  // fetch resolves, which would suppress the rail on a real account whose
  // conversations simply have not loaded yet.
  it('waits while idle or loading with nothing cached', () => {
    expect(resolveRailState('idle', 0)).toBe('loading');
    expect(resolveRailState('loading', 0)).toBe('loading');
  });

  // Catches: a rail that blanks itself the moment a background refresh
  // starts, discarding a perfectly good list the user was already reading.
  it('keeps showing a cached list while a refresh is in flight', () => {
    expect(resolveRailState('loading', 3)).toBe('list');
  });

  // Catches: an implementation that can't tell "haven't asked yet" apart
  // from "asked, and there truly are none" — only `ready`+0 may claim that,
  // per the design's own rule ("the only one that has actually established it").
  it('is the ONLY status allowed to claim "no conversations" — and only at count 0', () => {
    expect(resolveRailState('ready', 0)).toBe('hidden');
    expect(resolveRailState('ready', 5)).toBe('list');
  });

  // Catches: an error state rendering as 'hidden' (silently indistinguishable
  // from a genuinely empty account) instead of offering a retry affordance.
  it('offers a retry when the fetch failed and nothing is cached', () => {
    expect(resolveRailState('error', 0)).toBe('retry');
  });

  // Catches: an error wiping a list that was already loaded, contradicting
  // the design's "a loaded list beats nothing" rule for this exact row.
  it('keeps a loaded list even after a failed refresh', () => {
    expect(resolveRailState('error', 3)).toBe('list');
  });
});

describe('railIsVisible', () => {
  // Catches: an inverted or partial mapping (e.g. only 'list' visible, or
  // 'hidden' treated as visible) that would size the column against the
  // wrong rail width.
  it('is true for every state except hidden', () => {
    const states: RailState[] = ['loading', 'list', 'retry'];
    for (const s of states) expect(railIsVisible(s)).toBe(true);
    expect(railIsVisible('hidden')).toBe(false);
  });
});

describe('chatColumnWidth', () => {
  const gutter = 20;

  // Catches: subtracting only one gutter (or none), or using the wrong rail
  // width — either would move this off the design's own fixture value.
  it('is 704 at the desktop floor (1024) with the rail visible', () => {
    expect(chatColumnWidth(1024, gutter, true)).toBe(704);
  });

  // Catches: a cap that doesn't bite yet at 1080, i.e. subtracting the rail
  // and gutters without then clamping to CHAT_COLUMN_MAX_WIDTH.
  it('reaches the 760 cap at exactly 1080 with the rail visible', () => {
    expect(chatColumnWidth(1080, gutter, true)).toBe(CHAT_COLUMN_MAX_WIDTH);
  });

  // Catches: a formula that keeps growing past the cap instead of clamping,
  // which would silently widen the transcript past its measure on a large
  // monitor.
  it('stays at the 760 cap on wider windows, with the rail visible', () => {
    expect(chatColumnWidth(1440, gutter, true)).toBe(CHAT_COLUMN_MAX_WIDTH);
    expect(chatColumnWidth(1920, gutter, true)).toBe(CHAT_COLUMN_MAX_WIDTH);
  });

  // Catches: still subtracting the rail's width when it isn't occupying any
  // space, which would shrink the column below its cap for no reason once
  // the rail is suppressed (design: "ready"+0 -> hidden).
  it('is always at the 760 cap when the rail is hidden, at every desktop width', () => {
    expect(chatColumnWidth(1024, gutter, false)).toBe(CHAT_COLUMN_MAX_WIDTH);
    expect(chatColumnWidth(1080, gutter, false)).toBe(CHAT_COLUMN_MAX_WIDTH);
    expect(chatColumnWidth(1920, gutter, false)).toBe(CHAT_COLUMN_MAX_WIDTH);
  });

  // Catches: the exact defect the brief calls out — a bare subtraction with
  // no floor returns a negative width once the rail and gutters exceed the
  // window, which would crash or invert the layout rather than degrading.
  it('never returns a negative or zero width, even for a degenerate narrow window', () => {
    expect(chatColumnWidth(200, gutter, true)).toBeGreaterThan(0);
    expect(chatColumnWidth(0, gutter, true)).toBeGreaterThan(0);
    expect(chatColumnWidth(-500, gutter, false)).toBeGreaterThan(0);
  });
});

describe('currentConversationTitle', () => {
  // Catches: reading the wrong array entry (e.g. always the first one)
  // rather than matching by id.
  it('returns the matching conversation\'s title', () => {
    const list = [conversation('a', { title: 'Grocery spend' }), conversation('b', { title: 'Budget check' })];
    expect(currentConversationTitle(list, 'b')).toBe('Budget check');
  });

  // Catches: treating "no conversation selected" the same as "found one, but
  // render an empty string" — a caller needs a clean `null` to decide whether
  // to hide the title bar or fall back to translated placeholder text.
  it('is null when no conversation is currently open', () => {
    const list = [conversation('a', { title: 'Grocery spend' })];
    expect(currentConversationTitle(list, null)).toBeNull();
  });

  // Catches: throwing or returning undefined instead of null when the current
  // id doesn't (yet) match anything in the loaded list.
  it('is null when the current id is not in the list', () => {
    const list = [conversation('a', { title: 'Grocery spend' })];
    expect(currentConversationTitle(list, 'missing')).toBeNull();
  });

  // Catches: returning an empty string for an untitled conversation instead
  // of null — the caller can't tell "blank" from "nothing to show" and would
  // render a bare title bar (or a translated fallback) inconsistently.
  it('is null, not an empty string, for a conversation with no title', () => {
    const list = [conversation('a', { title: '' }), conversation('b')];
    expect(currentConversationTitle(list, 'a')).toBeNull();
    expect(currentConversationTitle(list, 'b')).toBeNull();
  });
});

describe('conversationDateLabel', () => {
  // Catches: a reformat (e.g. a numeric date, or year included) that would
  // make this a silent, un-reviewed change to what `ChatHistorySheet` already
  // ships on the phone — this is a deliberate byte-identical second copy of
  // that one expression, not an extraction from it.
  it('formats as month-short + numeric day, matching ChatHistorySheet\'s own expression', () => {
    const date = new Date('2026-09-03T12:00:00Z');
    expect(conversationDateLabel(date)).toBe(
      date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    );
  });

  // Catches: adding `year: 'numeric'` (or any other option) to the format —
  // a real, easy-to-make regression the exact-string comparison above would
  // NOT catch if the same option were (accidentally) added to both places.
  it('never includes the year', () => {
    const date = new Date('2026-09-03T12:00:00Z');
    expect(conversationDateLabel(date)).not.toMatch(/2026/);
  });
});

describe('sortConversationsForDisplay (ABA-514)', () => {
  // Two pinned (p2 newer than p1), two unpinned (u1 newer than u2), given in
  // an order that matches NEITHER the expected output NOR any obvious
  // grouping — this is the fixture the brief calls for: reproducing the
  // server's order from a shuffled input, not merely "pinned ends up first".
  const p1 = conversation('p1', { isPinned: true, updatedAt: new Date('2026-08-01T00:00:00Z') });
  const p2 = conversation('p2', { isPinned: true, updatedAt: new Date('2026-08-15T00:00:00Z') });
  const u1 = conversation('u1', { isPinned: false, updatedAt: new Date('2026-09-01T00:00:00Z') });
  const u2 = conversation('u2', { isPinned: false, updatedAt: new Date('2026-07-01T00:00:00Z') });

  // Catches: sorting the WHOLE list by `updatedAt desc` alone (which would
  // put u1 — the most recently updated conversation of all four — first,
  // ahead of both pins) instead of partitioning by `isPinned` first. This is
  // the one test that actually exercises "reproduce the server's order",
  // since a naive "filter pinned to the front, keep the rest in input order"
  // implementation would pass a weaker "pinned first" check but fail this
  // exact ordering.
  it('reproduces the server order — pinned block by updatedAt desc, then the rest by updatedAt desc — from a shuffled input', () => {
    const shuffled = [u1, p1, u2, p2];
    expect(sortConversationsForDisplay(shuffled).map((c) => c.id)).toEqual(['p2', 'p1', 'u1', 'u2']);
  });

  // Catches: an implementation that sorts the caller's array in place
  // (`.sort()` on the original reference) instead of on filtered copies —
  // which would corrupt whatever list the store or a render still holds a
  // reference to.
  it('does not mutate its input array', () => {
    const input = [u1, p1, u2, p2];
    sortConversationsForDisplay(input);
    expect(input.map((c) => c.id)).toEqual(['u1', 'p1', 'u2', 'p2']);
  });

  // Catches: treating `isPinned: undefined` (a row from a pre-ABA-514 SQLite
  // cache, or one a call site never set) as truthy via a loose `!c.isPinned`
  // inversion mistake, or otherwise letting an unknown pin state land in the
  // pinned block instead of defaulting to unpinned.
  it('treats a missing isPinned as unpinned, not pinned', () => {
    const unknown = conversation('unknown'); // isPinned omitted entirely
    const pinned = conversation('pinned', { isPinned: true, updatedAt: new Date('2026-01-01T00:00:00Z') });
    expect(sortConversationsForDisplay([unknown, pinned]).map((c) => c.id)).toEqual(['pinned', 'unknown']);
  });
});

describe('pinnedGroupBoundary (ABA-514)', () => {
  // Catches: a boundary computed even when nothing is pinned, which would
  // draw a divider above the very first row.
  it('is null when nothing is pinned', () => {
    const list = [conversation('a'), conversation('b')];
    expect(pinnedGroupBoundary(list)).toBeNull();
  });

  // Catches: a boundary computed even when EVERYTHING is pinned, which would
  // draw a divider below the last row for no reason (there is no second
  // group for it to separate from).
  it('is null when everything is pinned', () => {
    const list = [conversation('a', { isPinned: true }), conversation('b', { isPinned: true })];
    expect(pinnedGroupBoundary(list)).toBeNull();
  });

  // Catches: an off-by-one in either direction — this is the one case where
  // a wrong constant (pinnedCount instead of pinnedCount - 1, or vice versa)
  // would silently draw the divider one row too high or too low.
  it('is the index of the last pinned row when both groups exist', () => {
    const list = [
      conversation('p1', { isPinned: true }),
      conversation('p2', { isPinned: true }),
      conversation('u1', { isPinned: false }),
    ];
    expect(pinnedGroupBoundary(list)).toBe(1);
  });

  // Catches: throwing, or returning a non-null index, on an empty list.
  it('is null for an empty list', () => {
    expect(pinnedGroupBoundary([])).toBeNull();
  });

  // Documents the contract rather than re-deriving it: this function trusts
  // an ALREADY-ORDERED (pinned-first) list and counts only the LEADING run of
  // pinned rows. Catches a rewrite that instead counts pinned rows anywhere
  // in the array, which would silently accept an out-of-order list and
  // report a boundary that doesn't correspond to anything drawn on screen.
  it('counts only the leading run of pinned rows, not pinned rows scattered through an unordered list', () => {
    const outOfOrder = [conversation('u1', { isPinned: false }), conversation('p1', { isPinned: true })];
    expect(pinnedGroupBoundary(outOfOrder)).toBeNull();
  });
});

describe('conversationMenuItems (ABA-514)', () => {
  // Catches: giving a non-owner (a co-member reading another member's shared
  // conversation) anything beyond Pin/Unpin — decision 1's fork: pin is read
  // visibility, not creator-only, but rename/delete stay creator-only.
  it('gives a non-owner only the pin/unpin item, unpinned case', () => {
    const row = conversation('c1', { isPinned: false, isShared: true });
    expect(conversationMenuItems(row, { isOwner: false })).toEqual([
      { action: 'pin', labelKey: 'chat.pinConversation', icon: 'pin-outline' },
    ]);
  });

  // Catches: the label/icon not flipping to the "unpin" state for an already
  // -pinned row, even for a non-owner (pin is per-viewer — a non-owner who
  // pinned a shared conversation must see "Unpin", not "Pin", on their own
  // menu).
  it('gives a non-owner only the pin/unpin item, pinned case', () => {
    const row = conversation('c1', { isPinned: true, isShared: true });
    expect(conversationMenuItems(row, { isOwner: false })).toEqual([
      { action: 'unpin', labelKey: 'chat.unpinConversation', icon: 'pin' },
    ]);
  });

  // Catches: dropping Rename/Delete for the owner, or getting their order
  // wrong, or forgetting the divider that must appear directly before
  // Delete — the design's "Pin/Unpin · Rename · ─── · Delete" layout,
  // checked here as a full array equality rather than a length/membership
  // check that could pass with the items in any order.
  it('gives the owner Pin, Rename, then Delete with a divider before Delete', () => {
    const row = conversation('c1', { isPinned: false });
    expect(conversationMenuItems(row, { isOwner: true })).toEqual([
      { action: 'pin', labelKey: 'chat.pinConversation', icon: 'pin-outline' },
      { action: 'rename', labelKey: 'chat.renameConversation', icon: 'create-outline' },
      { action: 'delete', labelKey: 'common.delete', icon: 'trash-outline', destructive: true, dividerBefore: true },
    ]);
  });

  // Catches: Delete rendered without `destructive: true` — the Global
  // Constraints forbid a hand-authored red button, so the CALLER relies on
  // this flag to route Delete through `showAlert`'s own destructive styling.
  // A missing flag would silently strip that styling with no visible error
  // anywhere in this pure layer.
  it('marks only the delete item as destructive', () => {
    const row = conversation('c1', { isPinned: true });
    const items = conversationMenuItems(row, { isOwner: true });
    expect(items.filter((i) => i.destructive).map((i) => i.action)).toEqual(['delete']);
  });
});

describe('canSaveRename (ABA-514)', () => {
  // Catches: allowing Save to fire with nothing typed, which would write an
  // empty title (decision 3 explicitly does not offer clearing a title back
  // to null/empty).
  it('rejects an empty next value', () => {
    expect(canSaveRename('Grocery run', '')).toBe(false);
  });

  // Catches: trimming only for the emptiness check but not stopping a
  // whitespace-only value from otherwise looking "non-empty".
  it('rejects a whitespace-only next value', () => {
    expect(canSaveRename('Grocery run', '   ')).toBe(false);
  });

  // Catches: allowing a request that would write back exactly what's already
  // there.
  it('rejects an unchanged value', () => {
    expect(canSaveRename('Grocery run', 'Grocery run')).toBe(false);
  });

  // Catches: comparing the raw (untrimmed) next value against current,
  // which would treat "Grocery run" -> "  Grocery run  " as a real change
  // and spend a request writing back the same title with incidental
  // whitespace.
  it('rejects a value unchanged modulo trim (extra whitespace added)', () => {
    expect(canSaveRename('Grocery run', '  Grocery run  ')).toBe(false);
  });

  // Catches the same defect from the other side: a CURRENT title that itself
  // carries incidental whitespace must still be recognized as unchanged
  // against a trimmed next value.
  it('rejects a value unchanged modulo trim (current already had whitespace)', () => {
    expect(canSaveRename('  Grocery run  ', 'Grocery run')).toBe(false);
  });

  // Catches: refusing to save a brand-new title for an untitled conversation
  // because `current === null` was mishandled as "always unchanged" instead
  // of "nothing to compare against".
  it('allows a new title when the conversation currently has none', () => {
    expect(canSaveRename(null, 'New title')).toBe(true);
  });

  // Catches: a null current title bypassing the emptiness check entirely.
  it('still rejects empty/whitespace when the conversation currently has no title', () => {
    expect(canSaveRename(null, '')).toBe(false);
    expect(canSaveRename(null, '   ')).toBe(false);
  });

  // Catches: an overzealous "unchanged" comparison that rejects a genuine
  // change.
  it('allows a genuinely different title', () => {
    expect(canSaveRename('Grocery run', 'Budget check-in')).toBe(true);
  });
});
