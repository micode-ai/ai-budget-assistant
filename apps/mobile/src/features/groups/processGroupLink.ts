import { router } from 'expo-router';
import i18n from '@/i18n';
import { secureStorage } from '@/services/secureStorage';
import { useGroupStore } from '@/stores/groupStore';
import { showAlert } from '@/utils/alert';
import { isAlreadyMember, isLinkCodeInvalid } from './groupMath';
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

export type GroupLinkOutcome = 'linked' | 'duplicate' | 'alreadyMember' | 'invalid' | 'failed';

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
): Promise<GroupLinkOutcome> {
  if (claimed.has(code)) return 'duplicate';
  claimed.add(code);
  const go = (path: string) => (navigate === 'replace' ? router.replace(path as never) : router.push(path as never));

  try {
    const detail = await useGroupStore.getState().linkGuest(code);
    go(`/groups/${detail.id}`);
    return 'linked';
  } catch (e) {
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
