import {
  resolveRailState,
  railIsVisible,
  chatColumnWidth,
  currentConversationTitle,
  conversationDateLabel,
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
