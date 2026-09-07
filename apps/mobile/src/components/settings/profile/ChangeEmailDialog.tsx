/**
 * Kept in step by hand with the real dialog's copy in
 * `ChangeEmailDialog.web.tsx` — one prop, so a `.types.ts` third file (the
 * `SettingsRoute` convention) would cost more than it protects. `WebShell`
 * does the same.
 */
interface Props {
  onClose: () => void;
}

/**
 * Native: there is no pane, so there is no dialog. A phone reaches the email
 * change the way it always has — `ProfileSettings` pushes
 * `/settings/change-email`, a real route with a real back arrow — and this
 * component is never rendered, only imported.
 *
 * Deliberately a real no-op rather than a re-export of
 * `ChangeEmailDialog.web.tsx`. That file's scrim is a raw `<div>`, which is not
 * merely unused on a phone but would throw if it ever rendered; a re-export
 * would pull it, and `ChangeEmailView` with it, into the native graph and put
 * the safety back on a chain of reasoning about which provider sets
 * `desktop: true`. Metro resolving `.web.tsx` on web and this file everywhere
 * else is enforced by the bundler instead. Same shape and same reason as
 * `WebShell.tsx` and `ShareImageCard.web.tsx`'s counterpart.
 *
 * `null`, not `<>{children}</>`: unlike `WebShell` this component wraps
 * nothing — its whole content is desktop chrome.
 */
export function ChangeEmailDialog(_props: Props) {
  return null;
}
