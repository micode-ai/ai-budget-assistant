import type { ChatConversation } from '@budget/shared-types';
import { CHAT_COLUMN_MAX_WIDTH, CHAT_RAIL_WIDTH } from '@/components/webLayout.constants';

/**
 * Pure layout/state arithmetic for the desktop chat screen (ABA-513). Lives
 * apart from `ChatDesktop.tsx` for the same reason `desktopTable.ts`/
 * `desktopSelection.ts` do — nothing in this repo renders a component in CI,
 * so this file is the only place a mistake in any of these five answers can
 * be caught before a human sees it. Theme-free by design: every input the
 * functions below need is passed in, so nothing here depends on `useTheme()`
 * or on any store.
 */

/** Mirrors `chatStore`'s `conversationsStatus` — see the design's rail-state table. */
export type ConversationListStatus = 'idle' | 'loading' | 'ready' | 'error';

/** The rail's four renderable states. `'hidden'` is the ONLY one that occupies no width. */
export type RailState = 'hidden' | 'loading' | 'list' | 'retry';

/**
 * The rail's three-valued rule, from the design's own table:
 *
 * | status         | count | rail      |
 * |----------------|-------|-----------|
 * | idle / loading | 0     | `loading` | — the wait
 * | loading        | N     | `list`    | — paint what we have, refresh underneath
 * | ready          | 0     | `hidden`  | — the ONLY state allowed to claim "no conversations"
 * | ready          | N     | `list`    |
 * | error          | 0     | `retry`   |
 * | error          | N     | `list`    | — a loaded list beats nothing
 *
 * `idle` with a non-zero count is not in that table (nothing has been fetched
 * yet, so the cache should be empty) but is handled the same way as `loading`
 * with a non-zero count for the same reason the table gives that row: a
 * cached list beats a wait, whatever put it there.
 */
export function resolveRailState(status: ConversationListStatus, count: number): RailState {
  if (status === 'ready') return count > 0 ? 'list' : 'hidden';
  if (status === 'error') return count > 0 ? 'list' : 'retry';
  // 'idle' or 'loading': nothing has been confirmed yet.
  return count > 0 ? 'list' : 'loading';
}

/** Only `'hidden'` occupies zero width — every other state reserves the rail's column. */
export function railIsVisible(state: RailState): boolean {
  return state !== 'hidden';
}

/**
 * The smallest width this function will ever return. Unreachable through any
 * real call site: the only caller gates on `isDesktopWeb()`
 * (`windowWidth >= DESKTOP_MIN_WIDTH`, 1024), and at that floor with the real
 * gutter (20) and rail (280) the arithmetic below already clears 700px. This
 * exists purely so a future caller — or a test — cannot turn a negative
 * subtraction into a negative or zero style width; it is deliberately NOT a
 * second design measurement (the brief is explicit that the 1024-1439 band
 * needs no second threshold), just a floor under nonsense input.
 */
const MIN_COLUMN_WIDTH = 1;

/**
 * The transcript's content-container width: capped at `CHAT_COLUMN_MAX_WIDTH`,
 * shrinking only when the window is too narrow to reach it once the rail (if
 * visible) and two page gutters are subtracted. `gutter` is a parameter, not
 * an import of `theme.spacing[5]`, so this stays theme-free and this table is
 * literally its test fixture (design doc, "The measure"):
 *
 * | window | rail visible | column |
 * |--------|--------------|--------|
 * | 1024   | yes          | 704    |
 * | 1080   | yes          | 760    | — cap reached
 * | 1440   | yes          | 760    |
 * | 1920   | yes          | 760    |
 * | any    | no           | 760    |
 */
export function chatColumnWidth(windowWidth: number, gutter: number, railVisible: boolean): number {
  const railWidth = railVisible ? CHAT_RAIL_WIDTH : 0;
  const available = windowWidth - railWidth - gutter * 2;
  return Math.min(CHAT_COLUMN_MAX_WIDTH, Math.max(MIN_COLUMN_WIDTH, available));
}

/**
 * The current conversation's raw, untranslated title — or `null` when there
 * is nothing to display, for either of two reasons a caller must treat alike:
 * no conversation is currently open (`currentConversationId` is null, or
 * refers to a conversation not yet in `conversations`), or the conversation
 * exists but was never given a title. Either way the caller supplies its own
 * fallback (`t('chat.conversationUntitled')`) or hides the title bar — this
 * function never bakes in translated text, the same reason `desktopTable.ts`'s
 * `DayGroup.day` stays an ISO string rather than a formatted label.
 */
export function currentConversationTitle(
  conversations: ChatConversation[],
  currentConversationId: string | null,
): string | null {
  if (!currentConversationId) return null;
  const found = conversations.find((c) => c.id === currentConversationId);
  return found?.title || null;
}

/**
 * A DELIBERATE second copy of the one-line expression inside
 * `ChatHistorySheet.tsx` (`date.toLocaleDateString(undefined, { month:
 * 'short', day: 'numeric' })`), NOT an extraction from it — collapsing the
 * two into one shared function would mean editing the phone's already-shipped
 * file for no functional gain, the same reasoning `financial-month.ts` and
 * `receipt-category-split.ts` give for their own mirrored pairs (there: two
 * runtimes that can't share a module; here: one screen the mobile rendering
 * rule says must not change, and a second screen that needs the identical
 * formatting). Do NOT "fix" this by making `ChatHistorySheet` import from
 * here, or the reverse — that edits the mobile file this branch is not
 * allowed to touch.
 */
export function conversationDateLabel(updatedAt: Date): string {
  return updatedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
