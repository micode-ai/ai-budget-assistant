import {
  ENTRY_ROUTE_IMPORT,
  ENTRY_ROUTE_MANUAL,
  ENTRY_ROUTE_RECEIPT,
  ENTRY_ROUTE_VOICE,
  resolveEntryAction,
} from '../firstRunEntries';

/**
 * These pin the one decision this feature is: which first-run entries open over
 * the dashboard and which replace it.
 *
 * The production change each catches, named before writing:
 *  - deleting a route from `CAPTURE_DIALOGS` (silently regressing that entry to
 *    a full-screen push — the exact defect the dialogs exist to fix, and one
 *    nothing else in this repo can observe, since no component is rendered in
 *    CI);
 *  - adding `/settings/import` to it (boxing a four-route wizard into a dialog);
 *  - swapping two capture entries' dialog kinds, which would open the voice
 *    recorder from the "scan a receipt" card.
 */
describe('resolveEntryAction', () => {
  it('opens the three capture flows as dialogs, each as its own kind', () => {
    expect(resolveEntryAction(ENTRY_ROUTE_RECEIPT)).toEqual({ kind: 'dialog', dialog: 'receipt' });
    expect(resolveEntryAction(ENTRY_ROUTE_MANUAL)).toEqual({ kind: 'dialog', dialog: 'manual' });
    expect(resolveEntryAction(ENTRY_ROUTE_VOICE)).toEqual({ kind: 'dialog', dialog: 'voice' });
  });

  it('keeps the import wizard a page', () => {
    expect(resolveEntryAction(ENTRY_ROUTE_IMPORT)).toEqual({
      kind: 'navigate',
      route: ENTRY_ROUTE_IMPORT,
    });
  });

  it('degrades an entry it has no dialog for to navigation, carrying the route through', () => {
    expect(resolveEntryAction('/income/new')).toEqual({ kind: 'navigate', route: '/income/new' });
  });

  it('does not treat inherited Object properties as dialogs', () => {
    // `CAPTURE_DIALOGS` is a plain object literal, so a lookup of `toString`
    // or `constructor` finds a truthy prototype member. Returning
    // `{ kind: 'dialog', dialog: <a function> }` for a route named after one
    // would be a crash at the call site rather than a wrong screen — the same
    // `Object.prototype` false-positive class the AI-import validator
    // documents avoiding with a `Set`.
    expect(resolveEntryAction('constructor').kind).toBe('navigate');
    expect(resolveEntryAction('toString').kind).toBe('navigate');
  });
});
