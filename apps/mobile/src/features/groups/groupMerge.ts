import type { GroupDetail, GroupLinkAlreadyMemberDetails, GroupMember } from '@budget/shared-types';
import type { ApiErrorLike } from './groupMath';
import { balanceOf, isGroupWritable, liveMembers } from './groupDisplay';

/**
 * Merging two members (ABA-657). Pure, so it is what gets tested (nothing renders in CI). Mirrors the
 * server's `normaliseMergePair` + `mergeConsent` in `apps/api/src/modules/groups/group-merge.ts`; the
 * server re-checks everything, so this only decides what the member sheet offers.
 */

type Detail = Pick<GroupDetail, 'status' | 'isOwner' | 'myMemberId' | 'members' | 'balances'>;
type Member = Pick<GroupMember, 'id' | 'isAppUser' | 'isClaimed' | 'removedAt' | 'displayName'>;

export interface MergePair<M extends Member = Member> {
  /** The row that disappears into `into`. Always a guest row. */
  from: M;
  /** The row that survives and carries the combined balance. */
  into: M;
}

/**
 * Which way two members would merge, or null when this viewer may not merge them. An app-user row
 * always survives a guest row; two app users never merge; between two guests `selected` is the one
 * absorbed. The owner may merge into an UNCLAIMED guest row or into their own row; anyone may absorb an
 * unclaimed guest row into their own row.
 */
export function mergePair<M extends Member>(detail: Detail, selected: M, partner: M): MergePair<M> | null {
  if (!isGroupWritable(detail)) return null;
  if (selected.id === partner.id || selected.removedAt || partner.removedAt) return null;
  if (selected.isAppUser && partner.isAppUser) return null;
  const pair: MergePair<M> = selected.isAppUser ? { from: partner, into: selected } : { from: selected, into: partner };
  const intoIsMe = pair.into.id === detail.myMemberId;
  if (detail.isOwner && ((!pair.into.isAppUser && !pair.into.isClaimed) || intoIsMe)) return pair;
  if (intoIsMe && !pair.from.isClaimed) return pair;
  return null;
}

/** The members `selected` can be merged with, each with its direction, in list order. */
export function mergeCandidates(detail: Detail, selected: GroupMember): MergePair<GroupMember>[] {
  return liveMembers(detail)
    .map((m) => mergePair(detail, selected, m))
    .filter((p): p is MergePair<GroupMember> => p !== null);
}

/** The partner of each candidate pair (the member that is not `selected`), for the picker. */
export function mergePartners(detail: Detail, selected: GroupMember): GroupMember[] {
  return mergeCandidates(detail, selected).map((p) => (p.from.id === selected.id ? p.into : p.from));
}

/** "Merge with…" is offered when there is at least one member it could go with. */
export function canMergeMember(detail: Detail, selected: GroupMember): boolean {
  return mergeCandidates(detail, selected).length > 0;
}

/**
 * The confirm dialog's preview: what the survivor holds after the merge. A client-side sum, labelled
 * as a preview; the server computes the real figure and refuses the merge if it would differ.
 */
export function mergedBalancePreview(detail: Pick<GroupDetail, 'balances'>, pair: { from: { id: string }; into: { id: string } }): number {
  return Math.round((balanceOf(detail, pair.from.id) + balanceOf(detail, pair.into.id)) * 100) / 100;
}

export type MergeErrorReason = 'notAllowed' | 'bothAppUsers' | 'gone' | 'changed' | null;

/** Maps a merge failure to the copy to show; null = a generic error. */
export function mergeErrorReason(err: unknown): MergeErrorReason {
  const e = err as ApiErrorLike | null | undefined;
  if (!e) return null;
  if (e.status === 403 && e.code === 'MERGE_NOT_ALLOWED') return 'notAllowed';
  if (e.status === 409 && e.code === 'BOTH_APP_USERS') return 'bothAppUsers';
  if (e.status === 409 && (e.code === 'MERGE_CHANGED' || e.code === 'LEDGER_CHANGED')) return 'changed';
  if (e.status === 404) return 'gone';
  return null;
}

/**
 * The link-code flow's merge offer: a 409 ALREADY_MEMBER whose details say the caller's own row is
 * live, so the guest row (named) can be folded into it. Null when there is nothing to offer.
 */
export function linkMergeOffer(
  err: unknown,
): { guestName: string; myName: string; guestBalance?: number; currencyCode?: string } | null {
  const e = err as (ApiErrorLike & { details?: Partial<GroupLinkAlreadyMemberDetails> }) | null | undefined;
  if (!e || e.status !== 409 || e.code !== 'ALREADY_MEMBER') return null;
  const d = e.details;
  if (!d || d.canMerge !== true || typeof d.guestName !== 'string' || typeof d.myName !== 'string') return null;
  const offer: { guestName: string; myName: string; guestBalance?: number; currencyCode?: string } = {
    guestName: d.guestName,
    myName: d.myName,
  };
  if (typeof d.guestBalance === 'number' && Number.isFinite(d.guestBalance) && typeof d.currencyCode === 'string') {
    offer.guestBalance = d.guestBalance;
    offer.currencyCode = d.currencyCode;
  }
  return offer;
}
