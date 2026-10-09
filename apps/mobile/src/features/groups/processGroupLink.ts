import { router } from 'expo-router';
import i18n from '@/i18n';
import { secureStorage } from '@/services/secureStorage';
import { useGroupStore } from '@/stores/groupStore';
import { showAlert } from '@/utils/alert';
import { isAlreadyMember, isLinkCodeInvalid } from './groupMath';
import { linkMergeOffer } from './groupMerge';
import { PENDING_GROUP_LINK_KEY, resolvePendingGroupLink } from './groupLink';

/** Holds a link code across sign-in. A code lives 10 minutes server-side, so a stale one fails loudly later. */
export async function stashPendingGroupLink(code: string): Promise<void> {
  await secureStorage.setItem(PENDING_GROUP_LINK_KEY, code);
}

/** Reads and clears the stashed code. Returns null when there is none (or it was junk, which is cleared). */
export async function takePendingGroupLink(): Promise<string | null> {
  const outcome = resolvePendingGroupLink(await secureStorage.getItem(PENDING_GROUP_LINK_KEY));
  if (outcome.status === 'none') return null;
  await secureStorage.removeItem(PENDING_GROUP_LINK_KEY);
  return outcome.status === 'resume' ? outcome.code : null;
}

/** Codes already being (or finished being) processed in this session. The server code is single-use. */
const claimed = new Set<string>();

export type GroupLinkOutcome = 'linked' | 'duplicate' | 'alreadyMember' | 'mergeOffer' | 'invalid' | 'failed';

/** ABA-657: the guest row the code names can be merged into the caller's own row. */
export interface GroupLinkMergeOffer {
  guestName: string;
  myName: string;
  /** The guest row's net balance in `currencyCode`, when the server sent it. */
  guestBalance?: number;
  currencyCode?: string;
}

/**
 * Spends a link code: binds the signed-in user to the guest member it was minted for, then opens
 * the group. Safe to call twice for the same code (a re-mounted screen, or the post-sign-in flush
 * racing the route): the second call is a no-op, because the first one consumed the code and a
 * second request would fail with "expired" right after a success.
 *
 * `navigate` is `replace` from the link screen (it replaces itself) and `push` from the flush, which
 * runs over whatever screen the user landed on after sign-in.
 */
export async function processGroupLink(
  code: string,
  navigate: 'replace' | 'push',
  /**
   * ABA-657: the link screen passes this to show its "merge into your account" state itself. Without
   * it (the post-sign-in flush) a merge offer opens the link screen with the same code, which asks
   * again: the server put the unspent code back when it answered ALREADY_MEMBER.
   */
  onMergeOffer?: (offer: GroupLinkMergeOffer) => void,
): Promise<GroupLinkOutcome> {
  if (claimed.has(code)) return 'duplicate';
  claimed.add(code);
  const go = (path: string) => (navigate === 'replace' ? router.replace(path as never) : router.push(path as never));

  try {
    const detail = await useGroupStore.getState().linkGuest(code);
    go(`/groups/${detail.id}`);
    return 'linked';
  } catch (e) {
    const offer = linkMergeOffer(e);
    if (offer) {
      if (onMergeOffer) {
        onMergeOffer(offer);
      } else {
        claimed.delete(code);
        go(`/groups/link?code=${encodeURIComponent(code)}`);
      }
      return 'mergeOffer';
    }
    if (isAlreadyMember(e)) {
      showAlert(i18n.t('groups.linkTitle'), i18n.t('groups.linkAlreadyMember'));
      go('/groups');
      return 'alreadyMember';
    }
    if (isLinkCodeInvalid(e)) {
      // The code is spent or expired; retrying the same one can never work.
      showAlert(i18n.t('groups.linkTitle'), i18n.t('groups.linkInvalid'));
      go('/groups');
      return 'invalid';
    }
    // Anything else (offline, 5xx) leaves the code unspent, so allow another attempt.
    claimed.delete(code);
    showAlert(i18n.t('groups.linkTitle'), i18n.t('groups.linkFailed'));
    return 'failed';
  }
}

/**
 * ABA-657: the follow-up to a merge offer. Folds the guest row into the caller's own row and opens
 * the group; a spent or expired code (or one whose browser claim changed since) is 410.
 */
export async function mergeGroupLink(code: string): Promise<'merged' | 'invalid' | 'failed'> {
  try {
    const detail = await useGroupStore.getState().linkGuest(code, { merge: true });
    router.replace(`/groups/${detail.id}` as never);
    return 'merged';
  } catch (e) {
    if (isLinkCodeInvalid(e)) {
      showAlert(i18n.t('groups.linkTitle'), i18n.t('groups.linkInvalid'));
      router.replace('/groups' as never);
      return 'invalid';
    }
    showAlert(i18n.t('groups.linkTitle'), i18n.t('groups.linkMergeFailed'));
    return 'failed';
  }
}
