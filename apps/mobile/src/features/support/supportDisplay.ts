import type { SupportMessageView } from '@budget/shared-types';

/** Max characters in one message — the API's `@MaxLength(4000)` on `SendSupportMessageDto.body`. */
export const SUPPORT_MESSAGE_MAX_LENGTH = 4000;

export type SupportAltLabelKey = 'support.showOriginal' | 'support.showTranslation';

export interface BubbleText {
  primary: string;
  /** Reserved for a two-text layout; the bubble swaps texts instead, so this is always `null` today. */
  secondary: string | null;
  /** The toggle under the bubble, or `null` when there is nothing to toggle to. */
  altLabelKey: SupportAltLabelKey | null;
}

/**
 * What a bubble shows. A developer reply carries the original (`body`, in the
 * developer's language) and a translation into the user's language; which one
 * leads follows the thread's `autoTranslate`, and `showAlt` (a per-bubble tap)
 * swaps them — so the original is always one tap away wherever a translation
 * is shown (global constraint). A user-authored message is always shown as
 * typed: its translation exists for the developer, not for its author.
 */
export function bubbleText(msg: SupportMessageView, autoTranslate: boolean, showAlt: boolean): BubbleText {
  const translation = msg.translatedBody?.trim() ? msg.translatedBody : null;
  if (msg.author === 'user' || translation === null || translation === msg.body) {
    return { primary: msg.body, secondary: null, altLabelKey: null };
  }
  const translatedFirst = autoTranslate !== showAlt;
  return translatedFirst
    ? { primary: translation, secondary: null, altLabelKey: 'support.showOriginal' }
    : { primary: msg.body, secondary: null, altLabelKey: 'support.showTranslation' };
}

/** The status line under the last user message: `read` once the developer opened it. */
export function lastUserStatus(messages: readonly SupportMessageView[]): 'sent' | 'read' | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].author === 'user') return messages[i].readAt ? 'read' : 'sent';
  }
  return null;
}

export type SupportErrorKey = 'support.errorLimit' | 'support.errorUnavailable' | 'support.errorSend';

/** 429 = the daily send limit (10/24h, fail-closed on the server); 503 = the limiter is down, retry later. */
export function supportErrorKey(error: unknown): SupportErrorKey {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  if (status === 429) return 'support.errorLimit';
  if (status === 503) return 'support.errorUnavailable';
  return 'support.errorSend';
}

/** Older messages first, de-duplicated by id — merges a fetched page into what is already shown. */
export function mergeMessages(
  existing: readonly SupportMessageView[],
  incoming: readonly SupportMessageView[],
): SupportMessageView[] {
  const byId = new Map<string, SupportMessageView>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );
}
