import {
  ROUTE_BUDGET_NEW,
  ROUTE_EXPENSE_NEW,
  ROUTE_IMPORT,
  ROUTE_INCOME_NEW,
  ROUTE_RECEIPT,
  ROUTE_SET_BALANCE,
  ROUTE_VOICE,
  resolveDialogAction,
} from '../dashboardDialogs';

/**
 * These pin the one decision this feature is: which desktop-dashboard actions
 * open over the dashboard and which replace it.
 *
 * The production change each catches, named before writing:
 *  - deleting a route from `ROUTE_DIALOGS` (silently regressing that entry to a
 *    full-screen push — the exact defect the dialogs exist to fix, and one
 *    nothing else in this repo can observe, since no component is rendered in
 *    CI);
 *  - adding `/settings/import` to it (boxing a four-route wizard in a dialog);
 *  - swapping two kinds, which would open the voice recorder from "Scan a
 *    receipt" or the income form from "Add expense".
 *
 * The last case is why every route is asserted rather than a sample: three
 * separate surfaces (first-run cards, checklist steps, rail quick actions) now
 * resolve through this one function, and a route dropped from the table breaks
 * whichever of them happened to own it — which is not obvious from the table.
 */
describe('resolveDialogAction', () => {
  it('opens each in-place flow as a dialog, each as its own kind', () => {
    expect(resolveDialogAction(ROUTE_EXPENSE_NEW)).toEqual({ kind: 'dialog', dialog: 'expense' });
    expect(resolveDialogAction(ROUTE_INCOME_NEW)).toEqual({ kind: 'dialog', dialog: 'income' });
    expect(resolveDialogAction(ROUTE_RECEIPT)).toEqual({ kind: 'dialog', dialog: 'receipt' });
    expect(resolveDialogAction(ROUTE_VOICE)).toEqual({ kind: 'dialog', dialog: 'voice' });
    expect(resolveDialogAction(ROUTE_BUDGET_NEW)).toEqual({ kind: 'dialog', dialog: 'budget' });
    expect(resolveDialogAction(ROUTE_SET_BALANCE)).toEqual({ kind: 'dialog', dialog: 'wallet' });
  });

  it('gives every dialog route a distinct kind', () => {
    // A copy-paste in the table (two routes mapped to the same kind) would make
    // one of them silently open the other's dialog, which reads as a wiring bug
    // three components away from the actual cause.
    const kinds = [
      ROUTE_EXPENSE_NEW,
      ROUTE_INCOME_NEW,
      ROUTE_RECEIPT,
      ROUTE_VOICE,
      ROUTE_BUDGET_NEW,
      ROUTE_SET_BALANCE,
    ].map((route) => {
      const action = resolveDialogAction(route);
      return action.kind === 'dialog' ? action.dialog : route;
    });
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('keeps the import wizard a page', () => {
    expect(resolveDialogAction(ROUTE_IMPORT)).toEqual({ kind: 'navigate', route: ROUTE_IMPORT });
  });

  it('degrades an entry it has no dialog for to navigation, carrying the route through', () => {
    expect(resolveDialogAction('/settings/data')).toEqual({
      kind: 'navigate',
      route: '/settings/data',
    });
  });

  it('does not treat inherited Object properties as dialogs', () => {
    // `ROUTE_DIALOGS` is a `Map` precisely because an object literal answered
    // these with a truthy prototype member — the call site would then have
    // crashed on a function where a dialog kind belonged. Caught here first.
    expect(resolveDialogAction('constructor').kind).toBe('navigate');
    expect(resolveDialogAction('toString').kind).toBe('navigate');
  });
});
