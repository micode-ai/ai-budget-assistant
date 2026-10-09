import type { GroupDetail, GroupMember, GroupMemberEventView } from '@budget/shared-types';
import type { ApiErrorLike } from './groupMath';
import { isGroupWritable } from './groupDisplay';

/**
 * Pure helpers for group ownership (ABA-650): who may be offered "Make owner", who may adopt an
 * orphaned group, how a membership event reads, and which owner error a request failed with. Also
 * the owner's per-guest claim reset (ABA-651). Apart
 * from the components because nothing renders a component in CI, so this is where they are tested.
 */

export interface GroupEventText {
  /** An i18n key under `groups.`. */
  key:
    | 'groups.event_ownerTransferred'
    | 'groups.event_ownerSucceeded'
    | 'groups.event_ownerOrphaned'
    | 'groups.event_ownerAdopted'
    | 'groups.event_memberMerged'
    | 'groups.event_claimReset';
  params: Record<string, string>;
}

/**
 * How an event row reads. `owner_transferred` covers four cases, told apart by its fields (see
 * `GroupMemberEventView`): no target = orphaned; subject = target = adopted; no actor = succession on
 * an account departure; otherwise a manual transfer.
 */
export function describeGroupEvent(e: GroupMemberEventView): GroupEventText {
  const from = e.subjectName;
  const to = e.targetName ?? '';
  switch (e.kind) {
    case 'owner_transferred':
      if (!e.targetMemberId) return { key: 'groups.event_ownerOrphaned', params: { from } };
      if (e.targetMemberId === e.subjectMemberId) return { key: 'groups.event_ownerAdopted', params: { to: to || from } };
      if (!e.actorMemberId) return { key: 'groups.event_ownerSucceeded', params: { from, to } };
      return { key: 'groups.event_ownerTransferred', params: { from, to } };
    case 'member_merged':
      return { key: 'groups.event_memberMerged', params: { from, to } };
    case 'claim_reset':
      return { key: 'groups.event_claimReset', params: { from, actor: e.actorName ?? '' } };
  }
}

/**
 * "Make owner" is offered to the owner, on an active group, for another live member who uses the
 * app. The server also requires that member's account to be active (it cannot be seen here).
 */
export function canMakeOwner(
  detail: Pick<GroupDetail, 'status' | 'isOwner' | 'myMemberId'>,
  member: Pick<GroupMember, 'id' | 'isAppUser' | 'removedAt'>,
): boolean {
  return (
    isGroupWritable(detail) &&
    detail.isOwner &&
    member.id !== detail.myMemberId &&
    member.isAppUser &&
    !member.removedAt
  );
}

/**
 * "Reset this person's login" (ABA-651) is offered to the owner, on an active group, for a live
 * guest (not an app user) whose name a browser currently holds. Mirrors the server's rule: app users
 * are refused (their identity is the JWT) and an unclaimed name has nothing to reset.
 */
export function canResetClaim(
  detail: Pick<GroupDetail, 'status' | 'isOwner' | 'myMemberId'>,
  member: Pick<GroupMember, 'id' | 'isAppUser' | 'isClaimed' | 'removedAt'>,
): boolean {
  return (
    isGroupWritable(detail) &&
    detail.isOwner &&
    member.id !== detail.myMemberId &&
    !member.isAppUser &&
    member.isClaimed &&
    !member.removedAt
  );
}

export type ClaimResetErrorReason = 'notClaimed' | 'gone' | null;

/** Maps a reset failure to the copy to show; null = a generic error. */
export function claimResetErrorReason(err: unknown): ClaimResetErrorReason {
  const e = err as ApiErrorLike | null | undefined;
  if (!e) return null;
  if (e.status === 409 && e.code === 'NOT_CLAIMED') return 'notClaimed';
  if (e.status === 404) return 'gone';
  return null;
}

/**
 * Adoption is offered only when the SERVER says this member is eligible (`canAdopt`: a live app-user
 * member from before the group lost its owner), on an orphaned, active group.
 */
export function canAdoptGroup(
  detail: Pick<GroupDetail, 'status' | 'isOrphaned' | 'canAdopt'> | null | undefined,
): boolean {
  return !!detail && detail.isOrphaned === true && detail.canAdopt === true && isGroupWritable(detail);
}

export type OwnerErrorReason = 'limit' | 'changed' | 'invalidTarget' | 'hasOwner' | null;

/** Maps a transfer / adopt failure to the copy to show; null = a generic error. */
export function ownerErrorReason(err: unknown): OwnerErrorReason {
  const e = err as ApiErrorLike | null | undefined;
  if (!e) return null;
  if (e.status === 409 && e.code === 'OWNER_LIMIT') return 'limit';
  if (e.status === 409 && e.code === 'OWNER_CHANGED') return 'changed';
  if (e.status === 409 && e.code === 'GROUP_HAS_OWNER') return 'hasOwner';
  if (e.status === 400 && e.code === 'OWNER_TARGET_INVALID') return 'invalidTarget';
  return null;
}
