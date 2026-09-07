import { useCallback, useRef, useState } from 'react';
import { router } from 'expo-router';
import { GetStartedMobile, type GetStartedHandle } from '../GetStartedMobile';
import { CreateDialog } from '@/components/expenses/desktop/CreateDialog';
import { ReceiptDialog } from '@/components/expenses/desktop/ReceiptDialog';
import { VoiceDialog } from '@/components/expenses/desktop/VoiceDialog';
import {
  resolveDialogAction,
  type DashboardDialogKind,
} from '@/features/dashboard/dashboardDialogs';
import type { ExpenseCreatePrefill } from '@/components/expenses/create/ExpenseCreateForm';

/**
 * Desktop web first-run screen (ABA-514).
 *
 * `/get-started` was assumed to be phone-and-narrow-web-only, because
 * `useFirstRunOnboarding` bails on web. That assumption was wrong:
 * `app/(auth)/verify-email.tsx` does `router.replace('/get-started?next=welcome')`
 * with no platform guard, so every web user who registers by e-mail and
 * verifies lands here — a real desktop surface with the phone's four
 * full-page entry cards.
 *
 * Same screen as the phone — `GetStartedMobile`, unmodified — with three of
 * its four entries (`/expense/receipt`, `/expense/voice`, `/expense/new`)
 * opening a DIALOG over it instead of navigating away, exactly as
 * `DashboardDesktop` already does for the same four routes via the same
 * table (`resolveDialogAction`, `dashboardDialogs.ts` — called here, never
 * re-implemented or extended). `/settings/import` keeps navigating: see that
 * table's own doc comment for why (it is four routes, not one, and wants
 * width a dialog would take away).
 *
 * ## Why this needed a ref, not just the extra prop
 *
 * `GetStartedMobile` advances off this screen through a `useFocusEffect`: an
 * effect watches the transaction count and sets `pendingFinish`, acted on only
 * when the screen regains FOCUS — i.e. after a pushed entry screen pops back.
 * A dialog never takes focus away from the screen underneath it, so on this
 * path nothing would ever call `finish()`: the user would add their first
 * expense inside the dialog, close it, and sit on this screen forever with
 * nothing happening. `GetStartedHandle.finishIfPending` is the same check,
 * run from `closeDialog` below instead of from a focus event — it is a no-op
 * whenever no transaction actually landed (a cancelled scan, a form closed
 * with nothing saved), exactly like the focus-driven check it stands in for.
 */
export function GetStartedDesktop() {
  const handleRef = useRef<GetStartedHandle>(null);
  const [dialog, setDialog] = useState<DashboardDialogKind | null>(null);
  const [createPrefill, setCreatePrefill] = useState<ExpenseCreatePrefill | null>(null);

  const closeDialog = useCallback(() => {
    setDialog(null);
    setCreatePrefill(null);
    // The dialog path never regains focus on this screen, so
    // `useFocusEffect` inside `GetStartedMobile` can't fire — ask it directly
    // whether a transaction landed while the dialog covered it.
    handleRef.current?.finishIfPending();
  }, []);

  /**
   * Every card hands a ROUTE here, never a dialog kind, so the table in
   * `dashboardDialogs.ts` stays the only thing that knows which routes
   * resolve in place — same shape as `DashboardDesktop`'s `openRoute`.
   */
  const onSelect = useCallback((route: string) => {
    const action = resolveDialogAction(route);
    if (action.kind === 'dialog') setDialog(action.dialog);
    else router.push(action.route as never);
  }, []);

  return (
    <>
      <GetStartedMobile ref={handleRef} onSelect={onSelect} />

      {dialog === 'expense' && (
        <CreateDialog kind="expense" initial={createPrefill ?? undefined} onClose={closeDialog} />
      )}
      {dialog === 'receipt' && (
        <ReceiptDialog
          onClose={closeDialog}
          onEdit={(prefill) => {
            // "Edit" on the confirm card, mirrors `DashboardDesktop`: swap to
            // the manual-entry dialog with the scan's values rather than
            // closing. This is not the dialog closing — nothing has been
            // saved yet — so `finishIfPending` deliberately does not run here.
            setCreatePrefill(prefill);
            setDialog('expense');
          }}
        />
      )}
      {dialog === 'voice' && <VoiceDialog onClose={closeDialog} />}
    </>
  );
}
