import { DEFAULT_VISIBILITY, QUICK_ACTION_KEYS, type QuickActionKey } from '@/stores/quickActionStore';
import {
  ROUTE_CONVERTER,
  ROUTE_EXCHANGE,
  ROUTE_TRANSFER,
} from '../dashboardDialogs';
import { resolveRailQuickLinks } from '../railQuickLinks';

/**
 * These pin the whole of the desktop rail's quick-links card, because nothing
 * in this repo renders a component in CI — the component is left with layout
 * only, and every decision that can be silently wrong lives in the module
 * under test.
 *
 * The production changes each catches, named before writing:
 *  - a capture action leaking in (it is already in the fixed card directly
 *    above, so the same button would appear twice, 60px apart);
 *  - `shopping_hub` half-expanding, or its two rows surviving after the user
 *    turned the single key off;
 *  - "Purchase requests" appearing on a personal account, where there is
 *    nobody else to vote;
 *  - a write action offered to a viewer, whom the API refuses;
 *  - the stored order being ignored, which is the entire point of reading the
 *    store rather than hardcoding a list.
 */

const allOn = (overrides: Partial<Record<QuickActionKey, boolean>> = {}) => ({
  ...DEFAULT_VISIBILITY,
  ...overrides,
});

const ids = (links: { id: string }[]) => links.map((l) => l.id);

describe('resolveRailQuickLinks', () => {
  it('returns the six default links in the stored order, with shopping split in two', () => {
    const links = resolveRailQuickLinks({
      order: [...QUICK_ACTION_KEYS],
      visibility: allOn(),
      accountType: 'shared',
      canEdit: true,
    });

    // `QUICK_ACTION_KEYS`' own order, capture actions removed, `shopping_hub`
    // becoming its two real destinations in place.
    expect(ids(links)).toEqual([
      'exchange',
      'converter',
      'transfers',
      'subscriptions',
      'shoppingList',
      'purchaseRequests',
    ]);
  });

  it('never offers a capture action — those are the fixed card above it', () => {
    const links = resolveRailQuickLinks({
      order: [...QUICK_ACTION_KEYS],
      // Including the two that ship hidden, turned on: a user who enables them
      // must not get them here either, or "Voice" would sit in both cards.
      visibility: allOn({ voice_income: true, scan_invoice: true }),
      accountType: 'shared',
      canEdit: true,
    });

    const routes = links.map((l) => l.route);
    expect(routes).not.toContain('/expense/new');
    expect(routes).not.toContain('/expense/receipt');
    expect(routes).not.toContain('/expense/voice');
    // Deferred, deliberately: hosting these needs `app/income/voice.tsx` and
    // `app/income/receipt.tsx` extracted into `src/` first. Pinned so the
    // omission stays a decision instead of becoming a surprise.
    expect(routes).not.toContain('/income/voice');
    expect(routes).not.toContain('/income/receipt');
  });

  it('follows the user’s own order', () => {
    const links = resolveRailQuickLinks({
      order: ['subscriptions', 'shopping_hub', 'exchange', 'converter', 'transfers'],
      visibility: allOn(),
      accountType: 'shared',
      canEdit: true,
    });

    expect(ids(links)).toEqual([
      'subscriptions',
      'shoppingList',
      'purchaseRequests',
      'exchange',
      'converter',
      'transfers',
    ]);
  });

  it('drops a link the user turned off', () => {
    const links = resolveRailQuickLinks({
      order: [...QUICK_ACTION_KEYS],
      visibility: allOn({ converter: false, subscriptions: false }),
      accountType: 'shared',
      canEdit: true,
    });

    expect(ids(links)).toEqual(['exchange', 'transfers', 'shoppingList', 'purchaseRequests']);
  });

  it('drops BOTH shopping rows when the single shopping_hub key is off', () => {
    const links = resolveRailQuickLinks({
      order: [...QUICK_ACTION_KEYS],
      visibility: allOn({ shopping_hub: false }),
      accountType: 'shared',
      canEdit: true,
    });

    expect(ids(links)).toEqual(['exchange', 'converter', 'transfers', 'subscriptions']);
  });

  it('hides purchase requests on a personal account but keeps the shopping list', () => {
    const links = resolveRailQuickLinks({
      order: [...QUICK_ACTION_KEYS],
      visibility: allOn(),
      accountType: 'personal',
      canEdit: true,
    });

    expect(ids(links)).toContain('shoppingList');
    expect(ids(links)).not.toContain('purchaseRequests');
  });

  it('treats an unknown account type as not-yet-known, not as shared', () => {
    // `undefined !== 'personal'` is true, so the obvious inequality would show
    // the row on a dashboard that does not yet know whose account it is — the
    // same trap `isPurchaseRequestAccount` documents.
    const links = resolveRailQuickLinks({
      order: [...QUICK_ACTION_KEYS],
      visibility: allOn(),
      accountType: undefined,
      canEdit: true,
    });

    expect(ids(links)).not.toContain('purchaseRequests');
  });

  it('hides only the write actions from a viewer', () => {
    const links = resolveRailQuickLinks({
      order: [...QUICK_ACTION_KEYS],
      visibility: allOn(),
      accountType: 'shared',
      canEdit: false,
    });

    // Recording an exchange or a transfer is a write the API refuses a viewer.
    expect(ids(links)).not.toContain('exchange');
    expect(ids(links)).not.toContain('transfers');
    // The rest are reads, or writes the API grants a viewer on purpose
    // (shopping-list items are collaborative, and any member may vote on a
    // purchase request). Hiding them would deny what the server allows.
    expect(ids(links)).toEqual(['converter', 'subscriptions', 'shoppingList', 'purchaseRequests']);
  });

  it('renders a duplicated stored key once', () => {
    const links = resolveRailQuickLinks({
      order: ['exchange', 'exchange', 'shopping_hub', 'shopping_hub'],
      visibility: allOn(),
      accountType: 'shared',
      canEdit: true,
    });

    expect(ids(links)).toEqual(['exchange', 'shoppingList', 'purchaseRequests']);
  });

  it('ignores a key it has no link for', () => {
    const links = resolveRailQuickLinks({
      order: ['add_expense', 'nonsense' as QuickActionKey, 'converter'],
      visibility: allOn(),
      accountType: 'shared',
      canEdit: true,
    });

    expect(ids(links)).toEqual(['converter']);
  });

  it('gives every link a distinct id and route', () => {
    const links = resolveRailQuickLinks({
      order: [...QUICK_ACTION_KEYS],
      visibility: allOn(),
      accountType: 'shared',
      canEdit: true,
    });

    expect(new Set(ids(links)).size).toBe(links.length);
    expect(new Set(links.map((l) => l.route)).size).toBe(links.length);
  });

  it('names the three routes that resolve as dialogs', () => {
    // The card hands a ROUTE to `onOpenRoute`, and `resolveDialogAction` is
    // what turns it into a dialog. If these ever stop matching, the three
    // form-shaped destinations silently start replacing the dashboard again.
    const byId = new Map(
      resolveRailQuickLinks({
        order: [...QUICK_ACTION_KEYS],
        visibility: allOn(),
        accountType: 'shared',
        canEdit: true,
      }).map((l) => [l.id, l.route]),
    );

    expect(byId.get('exchange')).toBe(ROUTE_EXCHANGE);
    expect(byId.get('converter')).toBe(ROUTE_CONVERTER);
    expect(byId.get('transfers')).toBe(ROUTE_TRANSFER);
  });
});
