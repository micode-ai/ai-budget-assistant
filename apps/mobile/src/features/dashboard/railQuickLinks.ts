import type { AccountType } from '@budget/shared-types';
import type { QuickActionKey } from '@/stores/quickActionStore';
import { ROUTE_CONVERTER, ROUTE_EXCHANGE, ROUTE_TRANSFER } from './dashboardDialogs';
import { isPurchaseRequestAccount } from './attentionEnrichment';

/**
 * The desktop rail's second card: the quick actions that are NOT capture
 * actions — exchange, converter, transfers, subscriptions, shopping.
 *
 * ## Why this card exists at all
 *
 * The desktop dashboard retired `HomeQuickActionStrip` and replaced it with a
 * fixed four-item capture card (`DashboardRail`'s `RailQuickActions`). The
 * design spec named the consequence out loud and left it open: the other
 * five-to-six configured quick actions got no desktop shortcut, and
 * `/converter` in particular became reachable from nowhere at all — the strip
 * was its only entry point in the entire app. This card closes that.
 *
 * ## Why it reads the store while the card above it does not
 *
 * The capture card is fixed because those four actions are part of the
 * layout's own shape. These are not: they are "whichever shortcuts this user
 * wants on their home screen", which is exactly what Settings -> Widgets ->
 * Quick actions already means on the phone. Reading `quickActionStore` here
 * makes that one screen govern both platforms — no second settings surface,
 * and no separate desktop list to keep in sync — and it resolves the spec's
 * own worry about a fixed card sitting next to a fully configurable
 * everything-else: create-actions are the layout, navigation shortcuts are the
 * user's.
 *
 * ## Why it is a pure module rather than a map inside the component
 *
 * Nothing in this repo renders a component in CI, so every decision that can
 * be silently wrong — which keys are excluded, how `shopping_hub` expands,
 * which rows a viewer or a personal account may not see, whose order wins —
 * lives here where a test can read it. The component is left with layout only.
 * Same reason `resolveSetupSteps` and `dashboardDialogs` are modules.
 */

/**
 * Stable row ids. Deliberately NOT the same set as `QuickActionKey`:
 * `shopping_hub` is one key and two rows, so a row needs an identity of its
 * own to be addressed by a test or special-cased by a caller.
 */
export type RailQuickLinkId =
  | 'exchange'
  | 'converter'
  | 'transfers'
  | 'subscriptions'
  | 'shoppingList'
  | 'purchaseRequests';

export interface RailQuickLink {
  id: RailQuickLinkId;
  /**
   * Where tapping the row goes. A ROUTE, never a dialog kind — the card hands
   * this straight to `onOpenRoute`, so `resolveDialogAction`'s single table
   * stays the only thing that decides what a route opens. Three of these six
   * resolve to dialogs today; the three list screens navigate.
   */
  route: string;
  /** i18n key for the label. Every key here already exists in all 9 locales. */
  labelKey: string;
  /**
   * Ionicons glyph name, typed as a literal union rather than
   * `keyof typeof Ionicons.glyphMap` so this module needs no runtime import of
   * `@expo/vector-icons`. Each is the icon the app already uses for that same
   * destination elsewhere (the Wallet screen's own action row, the settings
   * hub's rows), so the shortcut and the place it leads to look alike.
   */
  icon:
    | 'swap-horizontal'
    | 'calculator-outline'
    | 'arrow-forward-circle-outline'
    | 'repeat-outline'
    | 'basket-outline'
    | 'cart-outline';
}

interface LinkDefinition extends RailQuickLink {
  /**
   * True for a row whose destination writes money — the API refuses these to a
   * viewer, so offering them would be offering something that cannot work.
   *
   * The other four are deliberately NOT gated. The converter computes nothing
   * server-side; a subscription list is a read; shopping-list items are
   * collaborative and explicitly not `ViewerBlockGuard`-ed; and any member,
   * viewer included, may vote on a purchase request. Hiding those would deny
   * what the server grants — the rule ABA-484's rate-alerts row already
   * follows. (The phone's strip gates all ten behind one `canEdit`; this is
   * narrower on purpose, and the narrowing is what the test pins.)
   */
  requiresEdit: boolean;
  /** True for a row that needs somebody else on the account to make sense. */
  requiresOtherMembers: boolean;
}

/**
 * One store key -> the row(s) it contributes, in the order they should appear
 * when that key is visible.
 *
 * The capture keys (`add_expense`, `scan_receipt`, `voice_expense`) have no
 * entry because the fixed card directly above already carries them — a row
 * here would be the same button twice, 60px apart. `voice_income` and
 * `scan_invoice` have none either, and that is a deferred gap rather than a
 * judgement: both are off by default, and hosting them in a dialog the way
 * their expense twins are hosted needs `app/income/voice.tsx` and
 * `app/income/receipt.tsx` extracted into `src/` first. Offering them as
 * plain navigations in the meantime would put two actions in one card where
 * one opens over the dashboard and its sibling replaces it, which is the
 * inconsistency `dashboardDialogs` exists to prevent.
 *
 * A `Map`, not an object literal, for the same reason `ROUTE_DIALOGS` is one:
 * an object literal answers a lookup of `constructor`/`toString` with a
 * truthy inherited member, so a junk key from stored JSON could resolve to a
 * function and crash the call site rather than being ignored.
 */
const LINKS_BY_KEY: ReadonlyMap<QuickActionKey, readonly LinkDefinition[]> = new Map([
  [
    'exchange',
    [
      {
        id: 'exchange',
        route: ROUTE_EXCHANGE,
        labelKey: 'dashboard.exchangeCurrency',
        icon: 'swap-horizontal',
        requiresEdit: true,
        requiresOtherMembers: false,
      },
    ],
  ],
  [
    'converter',
    [
      {
        id: 'converter',
        route: ROUTE_CONVERTER,
        labelKey: 'dashboard.currencyConverter',
        icon: 'calculator-outline',
        requiresEdit: false,
        requiresOtherMembers: false,
      },
    ],
  ],
  [
    'transfers',
    [
      {
        id: 'transfers',
        route: ROUTE_TRANSFER,
        labelKey: 'dashboard.transfers',
        icon: 'arrow-forward-circle-outline',
        requiresEdit: true,
        requiresOtherMembers: false,
      },
    ],
  ],
  [
    'subscriptions',
    [
      {
        id: 'subscriptions',
        route: '/subscriptions',
        labelKey: 'subscriptionManager.title',
        icon: 'repeat-outline',
        requiresEdit: false,
        requiresOtherMembers: false,
      },
    ],
  ],
  [
    // ONE key, TWO rows. On the phone this key opens a bottom sheet with these
    // same two items; on desktop the rail has the room, and a popover holding
    // two links is a phone idiom plus an extra click. Turning the key off in
    // Settings therefore removes both rows — a user who hid "Shopping" hid
    // shopping, not one half of it.
    'shopping_hub',
    [
      {
        id: 'shoppingList',
        route: '/shopping-list',
        labelKey: 'dashboard.shoppingListFull',
        icon: 'basket-outline',
        requiresEdit: false,
        requiresOtherMembers: false,
      },
      {
        id: 'purchaseRequests',
        route: '/purchase-requests',
        labelKey: 'dashboard.purchaseRequest',
        icon: 'cart-outline',
        requiresEdit: false,
        // A purchase request asks the other members to vote. On a personal
        // account there are none, so the row would open a screen whose answer
        // is already known — the same predicate, and the same reasoning, as
        // the attention panel's own purchase-request row.
        requiresOtherMembers: true,
      },
    ],
  ],
]);

export interface RailQuickLinksInputs {
  /** `quickActionStore.order` — the user's own order, already validated by the store. */
  order: QuickActionKey[];
  /** `quickActionStore.visibility`. */
  visibility: Record<QuickActionKey, boolean>;
  /** `currentAccountType`; `undefined` while the account list is still loading. */
  accountType: AccountType | undefined;
  /** `accountStore.canEdit()`. */
  canEdit: boolean;
}

/**
 * The rows the card should draw, in the order it should draw them.
 *
 * Returns `[]` freely — the card is not rendered at all when this is empty,
 * which is the correct answer for a user who turned every one of these off.
 * There is no minimum and no filler: same as the rail's own widget list.
 */
export function resolveRailQuickLinks({
  order,
  visibility,
  accountType,
  canEdit,
}: RailQuickLinksInputs): RailQuickLink[] {
  const showOtherMemberRows = isPurchaseRequestAccount(accountType);

  // De-dupe before mapping, exactly as `DashboardRail` does for `widgetOrder`:
  // a duplicated key in stored JSON would otherwise draw the same row twice.
  return [...new Set(order)]
    .filter((key) => visibility[key])
    .flatMap((key) => LINKS_BY_KEY.get(key) ?? [])
    .filter((link) => (link.requiresEdit ? canEdit : true))
    .filter((link) => (link.requiresOtherMembers ? showOtherMemberRows : true))
    .map(({ requiresEdit: _requiresEdit, requiresOtherMembers: _requiresOtherMembers, ...link }) => link);
}
