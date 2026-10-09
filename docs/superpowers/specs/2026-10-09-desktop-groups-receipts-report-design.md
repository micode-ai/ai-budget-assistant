# Groups, e-receipt inbox and import report — Desktop Web Design (ABA-646)

Web only, `>= 1024px`. Phone and native bundles are unchanged by construction (see "Platform split"). Nothing here was rendered; layout, hover, focus and theme legibility are unverified until someone looks at the deployed build (see Open questions).

## Goal

Give the three screens that shipped phone-only (shared groups, the e-mail receipt inbox + confirm, the post-import report) a desktop layout in the transactions-screen language, a desktop entry point for Groups, and a desktop-shaped inbound banner, without a second implementation of any form.

## Sources read

Design language `docs/contracts/desktop-web-design-language.md` (header says "two shipped screens"; `docs/design/` holds 7 docs plus the wiki pages for the later waves, so the sample is larger than its header: dashboard, settings shell, chat, analytics, budgets all followed). Closest structural precedents: transactions ledger (table + dialogs), dashboard (focus column + ~300px rail, `railQuickLinks.ts`, `dashboardDialogs.ts`), settings shell (pane vs link vs child route), `TransferDialog`/`ReceiptDialog` (hosting dialogs). Wiki: `shared-groups`, `inbound-e-receipts`, `bank-statement-import`.

## Findings that change the plan

1. **`groups` is already a `QuickActionKey`** (`quickActionStore.ts`, default visible, route `/groups`, label `groups.title`) and the phone strip renders it, but `railQuickLinks.ts`'s `LINKS_BY_KEY` has no entry, so it is silently dropped on desktop. The "six default links" test pins the count by accident of the old default set. The answer is to **add a seventh row**, not swap one (nothing else deserves removal), and update the pin.
2. **`InboundReceiptsBanner` is already mounted in `ExpensesDesktop`** (line ~509) but is the phone banner verbatim: whole-row `Pressable`, no labelled action, no hover/focus state, sits in a stack with two `UncategorizedBanner`s that have a real action button.
3. **Hosted views call `router` directly**: `GroupExpenseForm` (`router.back()`), `GroupCreateForm`/`GroupJoinView` (`router.replace`), `GroupMembersView` and `useGroupOwnerActions` (`router.dismissTo('/groups')`), `EmailReceiptConfirm` (`router.back()`). A dialog is not a route, so each needs an optional `onDone`-style callback whose default is today's `router` call (the `useTransferForm.onSaved` precedent). `GroupExpenseScreenView` also renders `<Stack.Screen options>`; a hosted copy would retitle the route underneath (dashboard invariant: a hosted view's `Stack.Screen` stays on the route), so it gets a `withStackTitle` prop, default `true`.
4. **`ImportReportView` conflates a failed load with "not enough data"** (both show "Imported / no report / Done"). Language rule from CLAUDE.md: a failed load and a successful empty load must never leave the same state. Desktop distinguishes them; the phone keeps today's rendering.
5. `GroupMemberSheet` and `GroupLinkQrModal` are bottom-anchored `Modal`s (`animationType="slide"`). Inside a desktop dialog or on a wide window they slide from the window bottom. `GroupMemberSheet` is reachable from the members dialog, so it moves onto `SheetDialog`. The QR becomes inline on desktop, so `GroupLinkQrModal` is not reachable there.
6. The settings pane `emailReceipts` (`SETTINGS_ENTRIES`, `width: 'form'`, `requiresFeature: 'inboundMail'`) already exists and already links to the inbox via `openInbox`. It needs nothing. Its polling `useFocusEffect` already stops when the route loses focus.

## What each mobile affordance becomes

### Groups

| Mobile today | Desktop | Why |
|---|---|---|
| `/groups` list of `GroupListRow` cards, pull-to-refresh, "New group"/"Join with link" buttons | Table page (see Layout), toolbar buttons; refresh on focus kept, no pull | Rows with a balance column and a keyboard cursor; a list of identical records is a table here |
| "New group" -> `/groups/new` push | Dialog hosting `GroupCreateForm` (`onCreated(id)` -> close + `router.push('/groups/<id>')`) | Form leaf. `router.replace` inside a Modal would leave it floating (settings-shell invariant) |
| "Join with link" -> `/groups/join` | Dialog hosting `GroupJoinView` (`onJoined(id)`, `onAlreadyMember`) | Same |
| Row tap -> `/groups/:id` | Row click / `Enter` navigates | A group is a place you work (ledger), pinned as navigation |
| Detail: hero, button row, transfers card, activity card, share card, stacked | Page: toolbar + hero strip + activity table in the main column, rail with transfers / balances / invite | Width is not scarce; show ledger and "who pays whom" at once |
| "Add expense" -> `/groups/:id/expense` | Dialog hosting `GroupExpenseScreenView`/`GroupExpenseForm` (footer Save/Delete via handle) | Form leaf |
| Activity expense row tap -> edit screen | Row click or `Enter` opens the same dialog in edit mode; hover pencil twin | Same view, `expenseId` |
| Activity settlement row tap -> void alert | **Not clickable**; explicit "Void" text button in the actions cell, then the existing `showAlert` | A click that opens a destructive confirm is a hazard with a precise pointer |
| Transfer "Settle" -> `/groups/:id/settle` | Dialog hosting `GroupSettleView` (`from`,`to`, `onDone`) | Form leaf; keeps its in-body confirm (short, branching on pay method) |
| "Members" -> `/groups/:id/members` | Dialog hosting `GroupMembersView` (add placeholder, rename, payment info, remove/leave, owner controls). Rail also shows a read-only member/balance list | The members screen is a leaf with its own sub-sheet; owner controls live inside it, unchanged |
| Owner controls (rotate link, guest access, archive, delete) | Unchanged component inside the members dialog; `useGroupOwnerActions(detail, onGroupGone?)` | One implementation. Delete resolves in place: close dialog, `router.replace('/groups')` |
| Share card: copy, Share sheet, QR modal | Rail card: link field + **Copy** (primary) + **inline QR** (220px, white quiet zone). Share button dropped on desktop | `Share.share` is unreliable on desktop browsers and falls back to copy anyway; QR has room inline, no dialog needed |
| `GroupLinkView` (`/groups/link?code=`) | Unchanged: it is a transient redirect screen already centred. Verify only | Not a layout |
| Deep links `/groups/new`, `/join`, `/:id/expense`, `/settle`, `/members` (push, guest page, URL) | Route renders the list/detail desktop screen with the matching dialog open (`initialDialog`); closing `router.replace`s to the parent | Keeps every external link working without a stretched full-page form |
| `showAlert` confirms | Unchanged | Already themed in-app dialog on web |
| Scan receipt (camera/gallery alert) in the expense form | Unchanged, hosted | Open question: camera on desktop |

### E-mail receipt inbox

| Mobile today | Desktop | Why |
|---|---|---|
| Segment toggle pending / handled | Two-segment control in the toolbar, pending shows `pendingCount` | Two states, not a pill row (chat sharing control precedent) |
| `FlatList` of cards, pull-to-refresh | Table, refresh on focus + a refresh icon button | |
| Row tap (pending, `canEdit`) -> `/inbox/email-receipt?id=` | Row click / `Enter` / "Review" button opens `EmailReceiptDialog` over the inbox | Leaf; the existing confirm card hosted, no second form |
| Dismiss (trash + `showAlert`), Retry (refresh icon) | Same two actions as icon buttons in the actions column, always visible | Two actions: no context menu (it would be a right-click-only twin of visible buttons) |
| Verification-code notice -> `/settings/email-receipts` | Slim notice row above the table, same destination | |
| `availability === 'unavailable'` text | Centred message in the content frame | |
| Banner on Expenses -> `/inbox/email-receipts` | Desktop banner variant (below) | |
| `/inbox/email-receipt?id=` deep link (push) | Renders the inbox with that dialog open; close -> `router.replace('/inbox/email-receipts')` | |
| Confirm "Edit" | Closes the confirm dialog, opens `CreateDialog kind="expense" initial={prefill}` from the inbox page | Dashboard `ReceiptDialog.onEdit` precedent; never dialog-on-dialog |
| (none) address / how-to | Rail card: private address + Copy, link to Settings pane | Gives the empty state somewhere to go |

### Import report

| Mobile today | Desktop | Why |
|---|---|---|
| Hero, categories, subscriptions, budgets, duplicates, merchants stacked | Two columns: figures + "where it went" + merchants (main), "set up" picks + duplicates (side) | Everything visible at once |
| Checkbox rows (subs, budgets), all default-checked | Same rows, hover wash, focus ring | |
| Footer "Set up selected (N)" / Skip / Done | Sticky bottom action bar across the content width | Footer stays reachable on one page scroll |
| Failed or insufficient data -> same "Imported / no report" | Three states: failed (retry), insufficient (existing text), loading | Rule above |
| `exitImportFlow` | Unchanged | Same destination logic incl. onboarding origin |

## Platform split (component-level only)

Route files stay single and thin. Each decider is a native file plus a `.web.tsx` sibling; the native file never imports desktop code.

| Decider (new) | Native file | `.web.tsx` | Used by route |
|---|---|---|---|
| `components/groups/GroupsScreen` | renders `phone ?? <GroupsListView />` | `useIsDesktopWeb()` ? `GroupsDesktop` (+ `initialDialog`) : `phone ?? <GroupsListView />` | `groups/index` (no `phone`), `groups/new` (`initialDialog="new" phone={<GroupCreateForm/>}`), `groups/join` (`initialDialog="join" phone={<GroupJoinView initialLink=.../>}`) |
| `components/groups/GroupDetailScreen` | renders `phone ?? <GroupDetailView groupId/>` | `GroupDetailDesktop` with `initialDialog` | `[id]/index`, `[id]/expense`, `[id]/settle`, `[id]/members` |
| `components/inboundMail/EmailReceiptsInboxScreen` | `<EmailReceiptsInbox/>` | `EmailReceiptsInboxDesktop` | `inbox/email-receipts`, `inbox/email-receipt` (`openId`) |
| `components/import/ImportReportScreen` | `<ImportReportView/>` | `ImportReportDesktop` | `settings/import/report` |

The existing phone bodies (`GroupsListView`, `GroupDetailView`, `EmailReceiptsInbox`, `ImportReportView`) keep their names and single definition; they are not renamed to `*Mobile`. Route-file edits are one-line (import the decider, pass the params).

## Layout

### Dialog frame (shared, new)

`src/components/DesktopDialogFrame.tsx`. Six new dialogs would each be another copy of the hand-rolled Modal + raw `<div>` scrim block (already copied ~10 times). The new dialogs share one frame; existing dialogs are NOT retrofitted (out of scope, would move shipped pixels).

Props: `{ title: string; titleId: string; onRequestClose: () => void; width?: number /* default 560 */; height?: 'auto' | number | string /* default '85%' */; headerExtra?: ReactNode; footer?: ReactNode; children }`. Behaviour copied from `TransferDialog`: RN `Modal` (role, aria-modal, Esc, focus trap), raw un-tabbable `<div>` scrim with `theme.colors.overlay`, panel `theme.colors.surface`, `borderRadius.xl`, `theme.shadows.xl`, header with `nativeID` title + close `Pressable` (`expensesDesktop.dialogClose`), definite height because hosted roots are `flex: 1` `KeyboardAwareScreen`s. `footer` renders below the hosted body in a `divider`-topped row. Only one instance of each dialog is mounted at a time (fixed `titleId`).

### Groups list `/groups`, >= 1440

```
+ top bar (shell) ----------------------------------------------------------+
| toolbar:  Groups  (3)                          [ Join with link ] [ + New group  n ]
| summary strip (per currency, never blended):  You are owed  EUR 42.10 | PLN 0 ... You owe  PLN 18.00
|--------------------------------------------------------------------------|
| [emoji] Name                     Members   Currency   Your balance        |  sticky header
| 🏠 Flat                          4         EUR        You are owed 42,10  |
| ✈ Zakopane            Archived   6         PLN        All settled up      |
+--------------------------------------------------------------------------+
```
Columns (flex): Name (flex 1, emoji avatar + name + Archived badge), Members (`groups.membersTitle`, 120), Currency (`groups.currencyLabel`, 100), Your balance (`groups.colBalance`, 200, right-aligned, tabular-nums, `success`/`danger`/`textTertiary` as `GroupListRow`). Active groups first, then archived; each by name. Summary strip: active groups only, grouped by `currencyCode`, owed and owe separately; pure `groupsTotalsByCurrency`. 1024-1439: identical (no rail); the Currency column hides below 1280.

### Group detail `/groups/:id`, >= 1440

```
| toolbar: 🏠 Flat · EUR · 4 members [Archived]       [ Members ] [ + Add expense  n ]   |
| archived banner (warningLight) when !writable                                          |
| inline error banner + Retry when a refresh failed but detail is still held             |
+-- main column (flex 1, min 0) -----------------------------+-- rail 320 -------------+
| hero strip: [You are owed 42,10] [Your share this month …] | Who pays whom           |
| Activity                                                   |  Ann -> Bo   12,00 [Settle]
| Date        Description     Paid by   Amount  Your share ⋯ |  (empty: Nobody owes…)  |
| ─ 9 Oct 2026 ──────────────────────────── 63,40 ─────────  | Balances                |
| 9 Oct   Groceries           Ann       40,00   10,00     ✎  |  Ann  +30,00  Bo −12,00 |
| 9 Oct   Payment: Bo → Ann   Bo        12,00      –   Void  | Invite with a link      |
| ─ 7 Oct …                                                  |  [url      ] [Copy]     |
|   Load more                                                |  [   QR 220px   ]      |
+------------------------------------------------------------+------------------------+
```
- Hero strip reuses `GroupBalanceHero` content as a horizontal two-tile strip (new `desktop?: boolean` prop on `GroupBalanceHero`, default `false`: left-aligned row instead of centred column; the phone call passes nothing).
- Activity: plain `View` table (not a scroller), header row `position: sticky`, grouped by day with an expenses-only subtotal (non-deleted); settlements have no subtotal contribution. Deleted/voided rows struck through (existing styles). "Your share" = `expense.shares` entry for `detail.myMemberId` (blank for settlements and members not in the split), hidden below 1280. Day for an expense is `expense.date`; for a settlement the local day of `createdAt`. Pure helper `groupActivityByDay(items, myMemberId)` in `src/features/groups/groupActivityTable.ts` returns `{ dayKey, items, subtotal }[]` plus the flat rendered-id order for the keyboard cursor.
- Actions cell: pencil (expense, `canWrite && canModifyExpense`) / "Void" (settlement, `canVoidSettlement`), revealed on row hover **and** `:focus-within`; the controls are always focusable (hover-only would be unreachable by keyboard).
- Rail reuses `GroupTransfersCard` as-is, a new small `GroupBalancesCard` (per member net, `balances` + `liveMembers`, tabular-nums, signed colour), and `GroupShareCard` with `desktop?: boolean` (default `false`) which renders QR inline and omits Share. `GroupShareCard` stays hidden when `!writable`.
- Rail is 320px (dashboard uses ~300): rows carry a name, an amount and a button. 1024-1439: same rail; main column falls to ~630 at 1024, which is why "Your share" and nothing else is dropped. No second rail at any width.
- One page scroll: toolbar, banner, table and rail move together under the window scrollbar; the rail is NOT sticky (it can exceed the viewport).

### Dialogs

| Dialog (new file, `components/groups/desktop/`) | Hosts | Frame | Primary action |
|---|---|---|---|
| `GroupCreateDialog` | `GroupCreateForm` | width 560, h 85% | footer "Create group" via handle |
| `GroupJoinDialog` | `GroupJoinView` | width 480, `maxHeight` 560 | in-body "Join group" |
| `GroupExpenseDialog` | `GroupExpenseScreenView` (`withStackTitle={false}`) | width 640, h 85% | footer "Save expense" (+ "Delete expense", danger, edit only) via handle |
| `GroupSettleDialog` | `GroupSettleView` | width 480, h 560 | in-body confirm |
| `GroupMembersDialog` | `GroupMembersView` | width 560, h 85% | none (live edits) |

State lives in `GroupsDesktop.tsx` / `GroupDetailDesktop.tsx`; `GroupsDesktopDialogs.tsx` / `GroupDetailDialogs.tsx` only render it (ABA-538 pattern: a new overlay extends the dialogs file, not the screen inline).

**Form handle (the only edit to the hosted forms' contracts).** `GroupExpenseForm` and `GroupCreateForm` become `forwardRef` with `GroupFormHandle { submit(): Promise<void>; remove?(): void }` and optional props `hideActions?: boolean` (default `false`; suppresses the in-scroll buttons), `onStateChange?: (s: { canSubmit: boolean; submitting: boolean; isEditing: boolean }) => void` (stable callback, reported from an effect like `onDirtyChange`), and `onDone?: () => void` (default: today's `router` call). The dialog footer calls `ref.current.submit()`. The phone passes none of these and is unchanged. `submit()` resolves after the store write; the form calls `onDone` only on success, as today.

Other optional-callback additions, all defaulting to the current router behaviour: `GroupJoinView({ onJoined?, onAlreadyMember? })`, `GroupSettleView({ onDone? })` (also replaces its `router.back()` in the "gone" state), `GroupMembersView({ onLeftGroup? })`, `useGroupOwnerActions(detail, onGroupGone?)`. `GroupMemberSheet` wraps its content in `SheetDialog` (`keyboardAvoiding`, `desktopScroll`); phone pixels must be eyeballed because `SheetDialog` documents that normalising an existing sheet can move them (pass `sheetStyle`/`padBottom` to preserve if it does).

### E-mail inbox `/inbox/email-receipts`, >= 1440

```
| toolbar: E-mail receipts   [ Pending 3 | Handled ]                       [refresh] |
| (code notice row: "Gmail confirmation code waiting" ->)                           |
+-- main (flex) ---------------------------------------------+-- rail 300 -------+
| Merchant      Subject          From        Date     Total   | Your address      |
| Allegro       Order 123…       allegro.pl  9 Oct   42,00 PLN| abc…@in.ai-… [Copy]
|                                                  [Review][🗑]| Set up forwarding ->
| (handled: reason line under Subject; Retry where canRetry)  |                    |
+-------------------------------------------------------------+--------------------+
```
Columns: Merchant (`emailReceipts.colMerchant`, falls back to `fromDomain`), Subject (`colSubject`, `noSubject` fallback; the handled reason `emailReceipts.<handledReasonKey>` below it), From (`colFrom`, domain), Date (`expensesDesktop.colDate`), Total (`colTotal`, tabular, right), actions. Pending rows: **Review** (primary text button, `emailReceipts.review`) + dismiss icon; handled rows: Retry icon where `canRetry`, dismiss icon. Viewer (`!canEdit`): no actions, rows not openable (same as phone). Rail hides when `address` is null and not loading; shows `emailReceipts.yourAddress`, address + `copy`/`copied`, and a link "`emailReceipts.title`" to `/settings/email-receipts`. No multi-select in this wave: an inbox holds a handful of items and the store has only `dismiss(id)`; bulk dismiss is a follow-up if real use shows queues.

1024-1439: rail collapses under the table; the From column hides below 1280.

`EmailReceiptDialog` (`components/inboundMail/desktop/`) hosts `EmailReceiptConfirm` (extended with optional `onDone`, `onDirtyChange`, `onOpenExpense`, `onEdit`, defaults = today's `router.back()` / ReceiptExpenseView defaults) inside `DesktopDialogFrame` width 680, h 85%, title `emailReceipts.confirmTitle`. No `AiUsageBadge` (the scan was already charged server-side; this view spends nothing). Esc / scrim route through `requestClose`, which asks (the existing `expensesDesktop.discardChangesTitle/Message/Confirm`) only when `onDirtyChange(true)`, the `ReceiptDialog` precedent. `onSaved` still calls `markSaved`. After `onDone` the list reflects the saved item through `locallySaved` as today.

### Import report `/settings/import/report`, >= 1440

```
| toolbar: Import report                     (no actions; Done lives in the bar below) |
|           max width 1200, centred (see Departures)                                    |
| [Period 1 Sep – 30 Sep] [Monthly avg 1 240,00] [Spent 3 700,00 · 52 exp.] [fx note]  |
+-- main (flex) -----------------------------+-- side 380 --------------------------+
| Where it went (bars, full width)           | Subscriptions found  [x] Netflix ...   |
| Top merchants (rank, name, amount, visits) | Suggested budgets    [x] Groceries ... |
|                                            | Possible duplicates (flag only)        |
+--------------------------------------------+---------------------------------------+
| sticky bar:  Set up selected (4)  [Skip]        (after apply: ✓ applied · [Done])    |
```
- Figures strip reuses `analytics/desktop/SummaryTile` for the four values (period, monthly average, total spent + count, and the `fxApproximate` note as a footnote under the strip when set).
- "Where it went" reuses the phone category row markup through a shared `ImportReportCategoryRows` extracted from `ImportReportView` (same rows, `desktop` only widens the bar track); top merchants render as rows with rank/name/`amount · N×`.
- Side column: the two `PickRow` lists (extracted, exported from the same file) with hover wash; duplicates as a flagged list (never removal).
- Sticky action bar: `position: 'sticky'; bottom: 0` inside the single page scroll, `surface` with a top `divider`. States mirror the phone footer: `!applied && pickedCount > 0` -> primary Set up + Skip; otherwise Done.
- 1024-1439: side column drops under main (single column); the action bar is unchanged.

**Shared logic is extracted, not copied.** `src/hooks/useImportReport.ts` takes the load effect, the pick sets, `apply`, and the `started`/`completed` telemetry out of `ImportReportView` and returns `{ status: 'loading' | 'failed' | 'insufficient' | 'ready', report, retry, pickedSubs, pickedBudgets, toggleSub, toggleBudget, pickedCount, apply, applying, applied }`. The phone view consumes the same hook and maps `failed` and `insufficient` to its existing screen, so its pixels and behaviour do not change; the hook change is additive for it (verify by eye that the phone still renders identically).

## Entry points

| Where | Change |
|---|---|
| Dashboard rail quick links | Add `'groups'` to `RailQuickLinkId`; icon union gains `'people-outline'`; `LINKS_BY_KEY` gets `['groups', [{ id: 'groups', route: '/groups', labelKey: 'groups.title', icon: 'people-outline', requiresEdit: false, requiresOtherMembers: false }]]`. `requiresEdit: false` because groups are not account-scoped (`ViewerBlockGuard` and the account role never apply); `requiresOtherMembers: false` because they are independent of account type. It lands last (store order). **Tests**: rename "six default links" to seven and append `'groups'`; add cases for a viewer and a personal account still seeing it; `dashboardDialogs.test.ts` list-screen pin gains `/groups` (route stays `navigate`). Update the "six" in the module/`RailQuickLinks.tsx` comments. |
| `dashboardDialogs.ts` | No new kind. Group dialogs need a `groupId` or open from inside Groups; they are not dashboard dialogs. |
| Settings registry | Add `{ kind: 'link', key: 'groups', labelKey: 'groups.title', route: '/groups' }` after `subscriptions`, so a user who hid the quick action still has a permanent door (the existing four links make the same argument). Update any `settingsRegistry.test.ts` length/order pin. Confirm `SettingsIndexView.web` is the only consumer so the phone hub is untouched. |
| `DiscoveryRow` (analytics) | No change: groups are not analytics and a sixth card would crowd a row that is already `flexWrap`ping. |
| E-receipts | Banner (below), push deep link, Settings pane `openInbox`. No new surface needed. |
| Import report | Reached only from the import wizard (`router.replace`), unchanged. |

## Inbound banner on the desktop transactions screen (review + redesign)

Review of `InboundReceiptsBanner`: correct gating (hidden while unavailable / viewer / count 0 / unknown), correct count refresh on focus and account switch. Wrong for a mouse: the only target is the whole row with `pressed` opacity, no hover or keyboard focus state, no visible verb, and it differs visibly from the `UncategorizedBanner`s stacked right under it.

New `desktop?: boolean` prop (default `false`, so the phone call keeps its layout by construction; `ExpensesDesktop` passes `desktop`). Desktop anatomy mirrors `UncategorizedBanner`: same shell (`primaryLight`, `borderRadius.lg`, same margins), lead icon circle (`mail-unread-outline`), text `emailReceipts.bannerText` with the count in `theme.fonts.bold` (extract the `lastIndexOf` count-split from `UncategorizedBanner` into `src/utils/emphasiseCount.ts` and use it in both; the existing banner's output must stay identical), and a trailing labelled pill button `emailReceipts.bannerAction` ("Review") with chevron. The row itself is not pressable; the button is the one focus stop, with hover `opacity`/ring using the same tokens as `UncategorizedBanner.actionPressed`. Order stays Inbound, then expense, then income banners (external arrivals first). Click navigates (`router.push('/inbox/email-receipts')`); it does not open a dialog because the inbox itself opens a dialog per row and dialogs must not nest.

## States

| Screen | Loading | Empty | Error | Populated |
|---|---|---|---|---|
| Groups list | Spinner in the table frame, header row drawn, no "empty" text, summary strip shows dashes (`—`) not zeros | Card with `listEmpty`, `listEmptyHint`, both CTAs | No data: `GroupErrorState` (Retry). Stale data held: rows kept + inline `groups.loadError` banner with `groups.retry` | Table + summary |
| Group detail | Spinner frame until `detail` for this id; hero, rail and table are not drawn | Activity empty: `activityEmpty` row inside the table; transfers empty: `noTransfers` | `!detail && loadFailed`: `GroupErrorState`; `detail && loadFailed`: banner above the hero, content kept. A 404 (left/deleted group) cannot be told from other failures by `useGroupDetail`; it shows the same error | Hero + table + rail. Archived: banner, write controls hidden |
| Inbox | `isLoading` with no rows: spinner (never the empty text); `isLoading` with rows: keep rows, small refresh spinner | `emptyPending` / `emptyHandled` + `offlineNote` | `error` with rows: banner `loadFailed`, rows kept; with none: `loadFailed` message. `unavailable`: centred `emailReceipts.unavailable` | Table |
| Confirm dialog | Spinner (existing phase) | n/a | `itemGone` / `itemNotPending` / `loadFailed` message + a "Back" that calls `onDone` (existing) | Hosted confirm card |
| Import report | Spinner in the content frame; no bar | `insufficient`: existing `noReport` text + Done | `failed`: **new** `importReport.loadFailed` ("Your import finished, but we couldn't build the report.") + `common.retry` + Done. The import itself succeeded in both | Full layout |

Groups are online-only and server-only; no state is ever drawn from a local copy. Never render a balance of `0`/"All settled up" before `detail` or the summary list has answered.

## Interactions

Keyboard, using the existing registry (`useDesktopShortcut`, LIFO, editable-target block is a hard stop). **No `Esc` binding anywhere**: RN `Modal` owns it. Table bindings are disabled while any dialog is open (`keyboardNavEnabled`, as in `ExpensesDesktop`). `↑`/`↓` use `resolveNextFocusedRow` over each table's own rendered id order (day-grouped, not the store order); no wrap.

| Screen | Keys |
|---|---|
| Groups list | `n` new group (`shortcuts.newGroup`), `↑`/`↓` (`shortcuts.navigateRows`), `Enter` open group (`shortcuts.openRow`) |
| Group detail | `n` add expense when `writable` (`shortcuts.newExpense`), `↑`/`↓` over activity rows, `Enter` opens the cursor row's edit dialog when `canModifyExpense`; settlement rows are skipped by `Enter` (void is explicit) |
| Inbox | `↑`/`↓`, `Enter` opens the cursor row's confirm when pending and `canEdit` |
| Import report | none registered: it is a short one-time form; Tab order is checkboxes -> action bar |

Hover and its focusable twin: row wash (`surfaceSecondary`, the `FacetRail`/`SetupChecklist` token) has no function beyond looking; row action controls (pencil, Void, dismiss) reveal on hover and on `:focus-within`, and are focusable even while visually hidden. The cursor row has a visible focus style distinct from hover. No right-click menus (one or two actions per row, always reachable).

Dialogs: centred, RN `Modal`, raw `<div>` scrim, focus restored by `Modal`. Closing never asks for confirmation on the group dialogs (the `TransferDialog`/`ExchangeDialog` precedent: short forms; see Open questions); the confirm dialog asks only when a completed extraction is unsaved.

## Departures from the design language

1. **Report page is capped at 1200px and centred.** Rule: content fills the area, charts cap. Precedent: `PaneChildWidth` (design language 5h) centres a standalone page with no nav beside it, and a five-card report across 1900px is a void. 1200 not 720 because it is two columns.
2. **Sticky bottom action bar** (report). New in this product; the sticky header precedent is `position: sticky` in a plain `View`, and this uses the same mechanism on the bottom edge. Reverts to a plain in-flow footer if it misbehaves under the one-scroll rule.
3. **Settlement rows are not click targets** (phone: tap = void). Destructive-on-click with a precise pointer.
4. **A groups/inbox page keeps a toolbar title ("Groups", "E-mail receipts") in-page.** The language drops the page title beside the brand because the nav item names the section; neither screen has a top-bar tab. The pushed-route Stack header remains as for other pushed routes; whether it shows a duplicate title is an open question.
5. **A new shared `DesktopDialogFrame`** instead of another hand-copied Modal block (rule of three long passed). Existing dialogs untouched.
6. **No discard confirmation on group dialogs**, as `TransferDialog`/`ExchangeDialog`: no real dirty signal exists in `useGroupExpenseForm`; inferring one is the "spurious confirm" `CreateDialog` documents.
7. **Inbox opens a page, not a dialog, from the banner.** A list you work through, whose rows open dialogs; settings-shell test "is it a leaf?".
8. **List-specific rules not inherited** (no facet rail, no multi-select) because these lists are short. Totals are per currency, never blended (inherited).

## i18n keys (new, all 9 locales; everything else reuses `groups`, `emailReceipts`, `importReport`, `expensesDesktop`, `common`)

- `shortcuts.newGroup`
- `groups.colBalance`, `groups.colMyShare`, `groups.balancesTitle`
- `emailReceipts.bannerAction`, `emailReceipts.review`, `emailReceipts.colMerchant`, `emailReceipts.colSubject`, `emailReceipts.colFrom`, `emailReceipts.colTotal`
- `importReport.loadFailed`

Reused: `expensesDesktop.colDate`/`colDescription`/`colAmount`/`dialogClose`/`discardChanges*`, `groups.paidByLabel`/`membersTitle`/`currencyLabel`/`nameLabel`/`qrTitle`/`copyLink`/all existing `groups.*`, `emailReceipts.yourAddress`/`copy`/`copied`/`title`/`confirmTitle`/`segment*`/`empty*`/`loadFailed`, `common.retry`, `shortcuts.navigateRows`/`openRow`/`newExpense`.

## Implementation plan (for `aba-web-engineer`)

1. `DesktopDialogFrame.tsx`; `emphasiseCount.ts` + use in `UncategorizedBanner`.
2. Rail link + registry link + test updates (smallest, independent; ships the entry point).
3. Groups: optional-callback props and `GroupFormHandle` on the hosted views; `SheetDialog` swap in `GroupMemberSheet`; `groupActivityTable.ts` and `groupListTable.ts` (day grouping, my share, per-currency totals, active-first sort) with unit tests; deciders, `GroupsDesktop`, `GroupDetailDesktop`, rail cards, dialogs.
4. Inbox: `EmailReceiptConfirm` optional props; deciders; `EmailReceiptsInboxDesktop`; `EmailReceiptDialog`; banner `desktop` prop.
5. Report: extract `useImportReport` (+ shared rows) from `ImportReportView`; `ImportReportDesktop`.
6. i18n in all 9 locales; wiki (`shared-groups` "No desktop layout" gap, `inbound-e-receipts`, `bank-statement-import`, `desktop-dashboard`, `settings-desktop-shell`), design-language doc 5k, user docs where desktop navigation differs.

Pure modules get tests; component behaviour does not (nothing renders in CI). Verify the native bundle has no `.web.tsx` import and that the phone renders identically on a device or a narrow window.

## Open questions (only the deployed screen can answer)

- Does the Stack header show under the top bar for `/groups` and `/inbox/*` on desktop, and does the in-page title duplicate it? If so, hide the header on desktop the way `settingsHeaderShown` does.
- Does `Space` toggle a `role="checkbox"` `TouchableOpacity` on react-native-web? The report's pick rows depend on it.
- Does the group expense "Take a photo" path degrade to a file picker on desktop browsers? If not, hide it on desktop.
- Is `GroupMemberSheet` on `SheetDialog` pixel-identical on the phone?
- Is the 1024-1439 band readable (main column ~630 at 1024 with two columns hidden)?
- Do three stacked banners (inbound + two uncategorized) cost too much vertical space? Candidate fix: one "to review" strip with three chips.
- Does a 3-row groups table look sparse at 1920? Candidate fix: cap at `CONTENT_MAX_WIDTH`.
- QR contrast in dark theme across the 13 accents (the white quiet zone is the one fixed literal pair and is deliberate).
- Should Enter in the group expense dialog's text fields submit, or `mod+Enter`? Today it does not; not added.
- Whether "Save and next" belongs on the confirm dialog for a queue of pending receipts.
