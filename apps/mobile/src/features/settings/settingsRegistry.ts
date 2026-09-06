/**
 * The settings shell's left pane, declared once.
 *
 * Nothing in this repo renders a component in CI, so this file exists for the
 * same reason `src/features/expenses/desktopTable.ts` does: it is the only
 * place a mistake in the shell's structure can be caught before a human sees
 * it. The shell (`src/components/settings/SettingsShell.tsx`) reads it and
 * decides nothing on its own.
 *
 * ## The rule, from the design spec
 *
 * > If the screen's purpose is to change how the app behaves for you, it is a
 * > **pane**. If its purpose is to look at or act on your money, it is a
 * > **link**.
 *
 * A pane fills the right side and the URL becomes `/settings/x`. A link
 * navigates out of the shell entirely and the URL becomes `/wallet`. Links sit
 * below a divider and carry an outbound arrow, so the two are never confused.
 *
 * ## Why almost everything is a link today
 *
 * A destination can only be *hosted* once its screen has been extracted out of
 * `app/` — `src/` may not import from `app/`, so until the extraction lands
 * there is nothing for the pane to render. The spec's answer is that an entry
 * not yet extracted **stays a link**: the left pane is then complete and
 * honest from day one, every row does exactly what its arrow promises, and a
 * later wave flips one entry from `link` to `pane` and changes nothing else.
 *
 * That is the property to preserve. If a later wave has to change the shape of
 * an entry rather than one word of it, the shape was wrong.
 *
 * ## Which rows are destined to be panes
 *
 * `SettingsPaneKey` is that list — the twelve screens that live under
 * `app/settings/` and configure the app. A key is in it whether or not its
 * entry is a pane yet, so `kind: 'pane'` is a compile error for anything
 * outside it: wave 4 cannot promote `tags/manage` without first admitting, in
 * this type, that it moved the file.
 */

/**
 * `'form'` caps the pane's content at {@link SETTINGS_FORM_MAX_WIDTH},
 * left-aligned — never centred, since centred content inside a left-aligned
 * shell reads adrift. `'full'` uses the whole pane, which is what the three
 * list screens want.
 */
export type SettingsPaneWidth = 'form' | 'full';

/** A form does not want 900px of line length. */
export const SETTINGS_FORM_MAX_WIDTH = 720;

/**
 * The twelve destinations under `app/settings/` that configure the app, and
 * are therefore hostable as a pane once extracted. Membership here is a
 * statement about the screen, not about whether it has been extracted yet.
 *
 * A const array rather than a bare union so the same fact exists at runtime:
 * it is the only thing that can distinguish "a settings route that will be a
 * pane" from "a settings route that will never be one" (`/settings/import` is
 * the latter), which is what lets a test insist every future pane decides its
 * content width before it lands.
 */
export const SETTINGS_PANE_KEYS = [
  'profile',
  'appearance',
  'ai',
  'widgets',
  'notifications',
  'bots',
  'security',
  'data',
  'categories',
  'merchants',
  'products',
  'about',
] as const;

export type SettingsPaneKey = (typeof SETTINGS_PANE_KEYS)[number];

/**
 * Everything else the left pane offers. These are places you work, commerce and
 * announcement flows, or screens that live outside `app/settings/` — none of
 * them is a control panel, so none is ever hosted in the right pane.
 */
export type SettingsLinkKey =
  | 'wallet'
  | 'shoppingList'
  | 'purchaseRequests'
  | 'subscriptions'
  | 'import'
  | 'subscription'
  | 'referral'
  | 'whatsNew'
  | 'accounts'
  | 'tags'
  | 'projects'
  | 'admin';

export type SettingsEntryKey = SettingsPaneKey | SettingsLinkKey;

interface SettingsEntryBase {
  /** Stable id. Also the `screen` a route hands to `SettingsRoute`. */
  key: SettingsEntryKey;
  /**
   * An i18n key that already exists in all nine locales. This entire body of
   * work has shipped without minting one, and the left pane deliberately has
   * no group headers so that it does not have to start now.
   */
  labelKey: string;
  /** Where the row goes. For a pane this is also the URL the shell shows. */
  route: string;
  /**
   * Rendered only for an admin, mirroring today's hub, which puts the admin
   * row in its own card behind `user.isAdmin`.
   */
  adminOnly?: boolean;
}

export interface SettingsPaneEntry extends SettingsEntryBase {
  kind: 'pane';
  key: SettingsPaneKey;
  width: SettingsPaneWidth;
}

export interface SettingsLinkEntry extends SettingsEntryBase {
  kind: 'link';
  /**
   * Present on a settings screen that is destined to be a pane and has not
   * been extracted yet, absent on a destination that will never be hosted.
   * Declaring it up front is what makes the flip to `kind: 'pane'` a one-word
   * change that cannot forget to decide the cap — and the cap is the whole
   * reported defect.
   */
  width?: SettingsPaneWidth;
}

export type SettingsEntry = SettingsPaneEntry | SettingsLinkEntry;

/**
 * The four rows that have no other entry point anywhere in the app: none of
 * them has a top-bar tab, so the settings left pane is the only way to reach
 * them. They may not be dropped, and by the rule above they may not become
 * panes either.
 */
export const ENTRY_POINT_ONLY_ROUTES: readonly string[] = [
  '/wallet',
  '/shopping-list',
  '/purchase-requests',
  '/subscriptions',
];

/**
 * Ordered as the left pane draws it: the shell renders every pane in this
 * order, then a divider, then every link in this order. Keeping one array in
 * the final intended order means a row rises into the pane block in the right
 * place the day it is extracted, with no second list to reorder.
 */
export const SETTINGS_ENTRIES: readonly SettingsEntry[] = [
  // --- Configure the app. Panes, once extracted (waves 1-3). ---
  { kind: 'link', key: 'profile', labelKey: 'settingsNav.profile', route: '/settings/profile', width: 'form' },
  { kind: 'pane', key: 'appearance', labelKey: 'settingsNav.appearance', route: '/settings/appearance', width: 'form' },
  { kind: 'pane', key: 'ai', labelKey: 'settingsNav.ai', route: '/settings/ai', width: 'form' },
  { kind: 'pane', key: 'widgets', labelKey: 'settingsNav.widgets', route: '/settings/widgets', width: 'form' },
  { kind: 'pane', key: 'notifications', labelKey: 'settingsNav.notifications', route: '/settings/notifications', width: 'form' },
  { kind: 'pane', key: 'bots', labelKey: 'settings.bots.title', route: '/settings/bots', width: 'form' },
  { kind: 'pane', key: 'security', labelKey: 'settingsNav.security', route: '/settings/security', width: 'form' },
  { kind: 'pane', key: 'data', labelKey: 'settingsNav.data', route: '/settings/data', width: 'form' },
  // Promoted out of the `reference` sub-hub, which dissolves on desktop — one
  // level of depth removed. These three are list screens and want the width.
  { kind: 'link', key: 'categories', labelKey: 'settingsNav.categories', route: '/settings/categories', width: 'full' },
  { kind: 'link', key: 'merchants', labelKey: 'settingsNav.merchants', route: '/settings/merchants', width: 'full' },
  { kind: 'link', key: 'products', labelKey: 'settingsNav.products', route: '/settings/products', width: 'full' },
  { kind: 'pane', key: 'about', labelKey: 'settingsNav.about', route: '/settings/about', width: 'form' },

  // --- Places you work. Links, permanently: they are in settings only
  //     because a phone has no room for more tabs. ---
  { kind: 'link', key: 'wallet', labelKey: 'settingsNav.wallet', route: '/wallet' },
  { kind: 'link', key: 'shoppingList', labelKey: 'shoppingList.title', route: '/shopping-list' },
  { kind: 'link', key: 'purchaseRequests', labelKey: 'purchaseRequests.settingsTitle', route: '/purchase-requests' },
  { kind: 'link', key: 'subscriptions', labelKey: 'subscriptionManager.title', route: '/subscriptions' },
  // A wizard, not a screen: five files driven by `useImportStore`, with a
  // preview and a column mapper that are full-width workspaces. A wizard
  // inside a pane is a trap, so this one is a link permanently.
  { kind: 'link', key: 'import', labelKey: 'bankImport.title', route: '/settings/import' },
  // Account-level, but each is a commerce, share or announcement flow rather
  // than a control panel.
  { kind: 'link', key: 'subscription', labelKey: 'subscription.managePlan', route: '/subscription' },
  { kind: 'link', key: 'referral', labelKey: 'referral.settingsTitle', route: '/referral' },
  { kind: 'link', key: 'whatsNew', labelKey: 'settingsNav.whatsNew', route: '/whats-new' },
  // Configure the app by the rule, but they live outside `app/settings/`, so
  // they become panes only when they are extracted (wave 4).
  { kind: 'link', key: 'accounts', labelKey: 'accounts.manage', route: '/account/list' },
  { kind: 'link', key: 'tags', labelKey: 'settingsNav.tags', route: '/tags/manage' },
  { kind: 'link', key: 'projects', labelKey: 'settingsNav.projects', route: '/projects' },
  { kind: 'link', key: 'admin', labelKey: 'admin.openPanel', route: '/admin', adminOnly: true },
];

export function isPaneEntry(entry: SettingsEntry): entry is SettingsPaneEntry {
  return entry.kind === 'pane';
}

export function isLinkEntry(entry: SettingsEntry): entry is SettingsLinkEntry {
  return entry.kind === 'link';
}

/**
 * The rows this user may see. Splitting admin out here rather than in the
 * shell keeps the one conditional row testable — a leak would otherwise be
 * invisible to everything in CI.
 */
export function visibleSettingsEntries(isAdmin: boolean): readonly SettingsEntry[] {
  return isAdmin ? SETTINGS_ENTRIES : SETTINGS_ENTRIES.filter((entry) => !entry.adminOnly);
}

/**
 * The entry the shell may host for a given selection, or `undefined`.
 *
 * `undefined` for a link key is the load-bearing case: it is what stops the
 * shell swallowing the shopping list, and what keeps a link row out of the
 * selected state. `undefined` for an unknown key covers a stale bookmark,
 * which falls back to the no-selection pane rather than a blank one.
 */
export function resolveSettingsPane(key: string | undefined): SettingsPaneEntry | undefined {
  if (!key) return undefined;
  return SETTINGS_ENTRIES.find((entry): entry is SettingsPaneEntry => isPaneEntry(entry) && entry.key === key);
}

/**
 * Whether the desktop shell hosts this route in its right pane — which is the
 * same question as "does this route already have a left pane telling the user
 * where they are, and what else there is".
 *
 * `app/_layout.tsx` asks it to decide `headerShown`, mirroring what
 * `app/(tabs)/_layout.tsx` already does with `headerShown: !isDesktopWeb`:
 * there `WebTopBar` replaces the per-screen header, here the settings shell
 * does. On a hosted route the stack header is not merely redundant — its back
 * arrow is a false promise, since it leaves settings entirely rather than
 * returning to the pane list that is already on screen.
 *
 * It answers from {@link SETTINGS_ENTRIES} and never from a second list, which
 * is the whole point: a later wave promoting one entry from `link` to `pane`
 * drops that screen's header with no edit in `app/_layout.tsx` at all, and —
 * just as load-bearing — a settings route that is STILL a link keeps its
 * header, because such a route renders as a full page on desktop with no pane
 * list beside it and would otherwise strand the user with no way back.
 *
 * Accepts either the expo-router screen name (`settings/appearance`) or the
 * registry's own route (`/settings/appearance`): the two differ only by the
 * leading slash, and a caller holding one should not have to know which.
 */
export function isShellHostedSettingsRoute(routeName: string): boolean {
  const route = routeName.startsWith('/') ? routeName : `/${routeName}`;
  return SETTINGS_ENTRIES.some((entry) => isPaneEntry(entry) && entry.route === route);
}

/** `undefined` means "no cap" — the pane's own width. */
export function paneContentMaxWidth(entry: SettingsPaneEntry): number | undefined {
  return entry.width === 'form' ? SETTINGS_FORM_MAX_WIDTH : undefined;
}
