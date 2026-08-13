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
 */
export function useFirstRunOnboarding(gateOpen: boolean): void {
  const seen = useFirstRunStore((s) => s.seen);
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const canEdit = useAccountStore((s) => s.canEdit());
  const pathname = usePathname();
  // Fires at most once per mount even if the effect re-runs.
  const navigated = useRef(false);

  useEffect(() => {
    if (navigated.current) return;
    if (pathname === '/get-started') return;
    if (!gateOpen || seen || !canEdit || !currentAccountId) return;

    let cancelled = false;
    void (async () => {
      // SQLite, not the stores — see countTransactions' comment.
      const count = await countTransactions(currentAccountId).catch(() => 1);
      // `pathname` is a dependency below, so a route change to /get-started while
      // this query was in flight (e.g. the verification screen redirecting there
      // first) re-runs this effect, and its cleanup flips this closure's
      // `cancelled` before we get here — no separate live-pathname check needed.
      if (cancelled || navigated.current) return;
      if (!shouldShowFirstRun({ gateOpen, seen, hasTransactions: count > 0, canEdit })) return;
      navigated.current = true;
      router.replace('/get-started');
    })();

    return () => {
      cancelled = true;
    };
  }, [gateOpen, seen, canEdit, currentAccountId, pathname]);
}
