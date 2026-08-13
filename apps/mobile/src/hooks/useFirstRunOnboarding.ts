import { useEffect, useRef } from 'react';
import { router, usePathname } from 'expo-router';
import { useAccountStore } from '@/stores/accountStore';
import { useFirstRunStore } from '@/stores/firstRunStore';
import { countTransactions } from '@/db/expenseRepository';
import { shouldShowFirstRun } from '@/features/onboarding/shouldShowFirstRun';

/**
 * Sends a brand-new user to the first-run screen once, at the moment the app is
 * fully ready.
 *
 * Lives here rather than on the email-verification screen because Google
 * sign-in routes straight to the tabs and never passes through verification —
 * hanging the trigger off that screen would silently exclude every Google
 * sign-up. This is the point where all sign-in paths converge.
 *
 * One of the cross-cutting hooks composed by RootNavigator (ABA-354): a new
 * concern of this kind gets its own hook here, never another inline useEffect.
 *
 * Pathname guard: the email-verification path separately does
 * `router.replace('/get-started?next=welcome')` so a newly registered user
 * still reaches the pricing screen after onboarding. If this hook's own
 * `router.replace('/get-started')` (no `next`) fires on top of that
 * navigation, the `next` param is lost and the user is silently dropped from
 * that funnel. Both navigations are individually correct — only their
 * combination is wrong — so the guard has to be pathname-based, not a state
 * flag: once `/get-started` is already the current route (no matter who
 * opened it), this hook must never navigate to it again.
 *
 * The guard is read from a ref (`pathnameRef`), not from `pathname` as an
 * effect dependency. `seen` never becomes `true` for an existing user — only
 * `get-started.tsx`'s own handlers set it — so an established user's
 * `hasTransactions`/`seen` combination never changes either, meaning nothing
 * about this hook's *other* dependencies ever changes again for that user
 * post-mount. Putting `pathname` in the dependency array would therefore
 * re-run this effect, and re-issue a fresh SQLite `countTransactions` read,
 * on every screen transition for the rest of the session, forever, for every
 * user who isn't brand-new — real contention against this codebase's single
 * SQLite connection. The ref is updated every render (see the assignment
 * below) without being a dependency, so the guard still reads the live
 * pathname without paying for a re-run on every navigation.
 *
 * This narrows the clobbering race, it does not close it: `cancelled` is set
 * by this effect's own cleanup, and nothing orders that against the
 * `countTransactions` promise's continuation resolving as a microtask — they
 * are independently scheduled. So the ref is *also* re-read immediately
 * before `router.replace`, after the await, which is the one check with any
 * chance of observing a route change that happened while the query was in
 * flight. Do not treat this as settled: the two checks (top-of-effect,
 * post-await) shrink the window a navigation from elsewhere could land in
 * without being seen, but they do not make it zero.
 */
export function useFirstRunOnboarding(gateOpen: boolean): void {
  const seen = useFirstRunStore((s) => s.seen);
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const canEdit = useAccountStore((s) => s.canEdit());
  const pathname = usePathname();
  // Live pathname for the guard, updated every render without being an
  // effect dependency — see the docstring above for why it must not be one.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  // Fires at most once per mount even if the effect re-runs.
  const navigated = useRef(false);

  useEffect(() => {
    if (navigated.current) return;
    if (pathnameRef.current === '/get-started') return;
    if (!gateOpen || seen || !canEdit || !currentAccountId) return;

    let cancelled = false;
    void (async () => {
      // SQLite, not the stores — see countTransactions' comment.
      const count = await countTransactions(currentAccountId).catch(() => 1);
      if (cancelled || navigated.current) return;
      // Re-read the live ref: the route may have changed to /get-started
      // (e.g. email verification redirecting there first) while the query
      // above was in flight. This is the check the top-of-effect one can't
      // substitute for — see the docstring's "narrows, does not close" note.
      if (pathnameRef.current === '/get-started') return;
      if (!shouldShowFirstRun({ gateOpen, seen, hasTransactions: count > 0, canEdit })) return;
      navigated.current = true;
      router.replace('/get-started');
    })();

    return () => {
      cancelled = true;
    };
  }, [gateOpen, seen, canEdit, currentAccountId]);
}
