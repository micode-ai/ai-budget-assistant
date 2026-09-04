import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
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
 * ## An established user must never reach this screen
 *
 * Two independent guards, because a button in every tab header used to defeat
 * this:
 *
 * 1. **A non-empty account marks the flag seen.** `markSeen()` is otherwise
 *    called only from `get-started.tsx`, which an established user never
 *    visits — so `seen` stayed `false` for the entire installed base forever,
 *    and every re-evaluation of this trigger was one empty local account away
 *    from showing onboarding on top of someone's real data. Recording it here
 *    is what makes the check genuinely once per install.
 * 2. **At most one evaluation per app session** (`checked`), whatever happens
 *    to the account afterwards. The account switcher sits in every tab header
 *    and in the home hero; the trip-invite deep link and push deep links also
 *    switch accounts. Each switch used to re-arm this effect and re-count
 *    against the newly selected account — and an account the user has not
 *    opened yet has no local rows at all, so it counts zero. Guard 1 alone
 *    makes that improbable; guard 2 makes it structurally unreachable.
 *
 * `checked` is set as soon as the query is *issued*, not when it resolves, so
 * a concurrent account change cannot slip a second query in behind the await.
 *
 * ## The destination is carried out-of-band, not in the URL
 *
 * The email-verification path navigates to `/get-started?next=welcome` so a
 * newly registered user still reaches the pricing screen afterwards. If this
 * hook's own param-less `router.replace('/get-started')` landed on top of that
 * navigation, the param — and with it the whole pricing step — was silently
 * lost. A pathname guard could only narrow that window: nothing orders a
 * SQLite promise's continuation against React committing a route change.
 *
 * So `verify-email.tsx` sets `firstRunStore.nextAfter` *synchronously before*
 * it navigates, and this hook bails when it is set. That is deterministic —
 * the flag is written before the navigation rather than observed after it —
 * and `get-started.tsx` honours it as well as the param, so the destination
 * survives even if the two navigations do collide.
 *
 * This also removes the `usePathname()` subscription that used to live here:
 * it re-rendered RootNavigator (95 `<Stack.Screen>` elements with freshly
 * allocated inline `options`) on every single navigation in the app, for a
 * hook that is a no-op for almost every user.
 */
export function useFirstRunOnboarding(gateOpen: boolean): void {
  const seen = useFirstRunStore((s) => s.seen);
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const canEdit = useAccountStore((s) => s.canEdit());
  // Evaluated at most once per app session — see guard 2 above.
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    // Web has no SQLite: db/client.web.ts's executeSql returns [], so the
    // count is always 0 and the premise of the whole check is false there.
    // Every other SQLite-backed feature degrades on web by showing less data;
    // this one would degrade by interrupting an established user with a screen
    // built on a wrong answer — and app.ai-budget.pl is live. Same platform
    // bail as captureCurrentLocation / NotificationCapture.ios.ts.
    if (Platform.OS === 'web') return;
    // Email verification is already sending this user to /get-started with a
    // destination attached; do not race it with a param-less navigation.
    if (useFirstRunStore.getState().nextAfter) return;
    if (!gateOpen || seen || !canEdit || !currentAccountId) return;

    checked.current = true;
    void (async () => {
      // SQLite, not the stores — see countTransactions' comment.
      const count = await countTransactions(currentAccountId).catch(() => null);
      // A failed read is not evidence either way: skip this session without
      // burning the flag, so a genuinely new user still gets the screen next
      // launch rather than losing it to one transient SQLite error.
      if (count === null) return;
      if (count > 0) {
        // This device belongs to an activated user. Record it so no later
        // account switch, reinstall-restore or app session re-asks.
        useFirstRunStore.getState().markSeen();
        return;
      }
      if (!shouldShowFirstRun({ gateOpen, seen, hasTransactions: false, canEdit })) return;
      router.replace('/get-started');
    })();
  }, [gateOpen, seen, canEdit, currentAccountId]);
}
