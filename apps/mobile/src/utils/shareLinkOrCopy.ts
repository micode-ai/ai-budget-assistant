/**
 * What happened when the user asked to share a link.
 * - `shared`: the system share sheet took it.
 * - `dismissed`: the user closed the sheet — not an error.
 * - `copied`: no share sheet (a desktop browser refuses `navigator.share` with
 *   NotAllowedError or does not have it), so the link was copied instead.
 * - `manual`: neither worked; the caller shows the link for the user to copy.
 */
export type ShareOutcome = 'shared' | 'dismissed' | 'copied' | 'manual';

export interface ShareLinkDeps {
  share: (url: string) => Promise<{ action?: string } | void>;
  copy: (url: string) => Promise<unknown>;
}

/**
 * Shares a link, falling back to the clipboard where the platform has no share
 * sheet. Exists because on web `Share.share` rejects, and the shopping-list
 * share button reported that as "couldn't create the link" although the link
 * had been created and was simply never handed to the user.
 */
export async function shareLinkOrCopy(url: string, deps: ShareLinkDeps): Promise<ShareOutcome> {
  try {
    const result = await deps.share(url);
    return result && result.action === 'dismissedAction' ? 'dismissed' : 'shared';
  } catch (e) {
    if ((e as { name?: string } | null)?.name === 'AbortError') return 'dismissed';
    try {
      await deps.copy(url);
      return 'copied';
    } catch {
      return 'manual';
    }
  }
}
