/**
 * Pure helpers for the join-by-link flow (ABA-647): what the join view shows for a preview, and
 * which body to send. No React, no network.
 */
import type { GroupJoinPreview, GroupSummary, JoinGroupDto } from '@budget/shared-types';

/** Where a preview request stands. A failed request is NOT "no free names". */
export type JoinPreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'error' }
  | { status: 'ready'; preview: GroupJoinPreview };

export type JoinViewKind = 'idle' | 'loading' | 'notFound' | 'error' | 'archived' | 'alreadyMember' | 'choose';

/** Archived wins over alreadyMember: a read-only group offers neither joining nor a join-flow exit. */
export function joinViewKind(state: JoinPreviewState): JoinViewKind {
  if (state.status !== 'ready') return state.status;
  if (state.preview.status === 'archived') return 'archived';
  if (state.preview.alreadyMember) return 'alreadyMember';
  return 'choose';
}

/** `null` selection = nothing picked yet; `'new'` = "I'm not on the list"; otherwise an unclaimed member id. */
export type JoinSelection = string | null;
export const JOIN_NEW_NAME = 'new';

/** With no free names the only option is a new name, so it is selected implicitly. */
export function effectiveSelection(selection: JoinSelection, preview: GroupJoinPreview): JoinSelection {
  if (preview.unclaimed.length === 0) return JOIN_NEW_NAME;
  if (selection && selection !== JOIN_NEW_NAME && !preview.unclaimed.some((m) => m.id === selection)) return null;
  return selection;
}

export function canSubmitJoin(selection: JoinSelection, name: string, preview: GroupJoinPreview): boolean {
  const sel = effectiveSelection(selection, preview);
  if (!sel) return false;
  return sel === JOIN_NEW_NAME ? name.trim().length > 0 : true;
}

/** The join body, or null when the form is not submittable. */
export function buildJoinDto(
  token: string,
  selection: JoinSelection,
  name: string,
  preview: GroupJoinPreview,
): JoinGroupDto | null {
  if (!canSubmitJoin(selection, name, preview)) return null;
  const sel = effectiveSelection(selection, preview);
  return sel === JOIN_NEW_NAME
    ? { guestToken: token, displayName: name.trim() }
    : { guestToken: token, memberId: sel as string };
}

/**
 * The group to open for an "already in" preview. The server sends `groupId` to members; the match
 * by name/emoji/currency among the user's own groups is only a fallback for an older API, and only
 * an unambiguous match is used.
 */
export function findGroupIdForPreview(groups: GroupSummary[], preview: GroupJoinPreview): string | null {
  if (preview.groupId) return preview.groupId;
  const hits = groups.filter(
    (g) =>
      g.name === preview.groupName &&
      (g.emoji ?? null) === (preview.emoji ?? null) &&
      g.currencyCode === preview.currencyCode,
  );
  return hits.length === 1 ? hits[0].id : null;
}
