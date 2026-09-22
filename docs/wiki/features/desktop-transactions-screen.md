# Desktop transactions screen

*Hub: [mobile-app](../mobile-app.md) · shell: [settings-desktop-shell](settings-desktop-shell.md)*

## What this is

The transactions list rebuilt for a mouse, a keyboard and a wide window at ≥1024px — the first
screen in the desktop design language, deliberately scoped to one screen so the language could be
approved in the product before the rest followed.

## Entry points

- `apps/mobile/src/components/expenses/ExpensesView.{tsx,web.tsx}` — the only file that decides
- `ExpensesMobile.tsx` — today's phone JSX, in exactly one definition
- `apps/mobile/src/components/expenses/desktop/ExpensesDesktop.tsx` + `ExpensesDesktopDialogs.tsx`
- `apps/mobile/src/features/expenses/desktopTable.ts` — day grouping, subtotals, facet counts,
  `summarise`, `rangeBetween`
- `apps/mobile/src/features/expenses/desktopSelection.ts`
- `apps/mobile/src/features/expenses/useExpensesScreenData.ts`

## Key concepts

**The split is component-level, not route-level.** `app/(tabs)/expenses.tsx` stays one thin route;
`ExpensesView.web.tsx` renders mobile below 1024 and `ExpensesDesktop` at or above it. Every
platform split in this repo is component-level, route-level resolution in expo-router is unverified
here, and one route file keeps `_layout.tsx` untouched.

**Three width regimes.** Below 1024 the mobile view renders byte-for-byte. From 1024 to 1439 the
facet rail collapses into a labelled dropdown. At 1440+ it is a persistent side panel —
`FACET_RAIL_MIN_WIDTH` is a separate threshold from the shell's 1024, because a side rail next to a
five-column table does not fit in that band.

**Expenses and income merge into one table**, with the mobile tab becoming a "kind" facet.

**Nothing renders a component in CI**, so every decision that can be numerically wrong lives in two
pure, fully unit-tested modules, while layout, hover, focus traps and contrast across all accents
and both themes are verified by hand.

## Invariants

**`facetValue` is the single place that encodes what a row has.** It is shared by `facetCounts`,
`countsForFacet` and the screen's own matcher, so a facet's count and the rows it produces cannot
drift. Income has its own `categoryId` and `accountId`; the one field it genuinely lacks is
`merchant` — an earlier version of this claim said income "carries neither a merchant nor an expense
category", and that false premise propagated into two predicates, a test name and a plan before it
was caught.

**A day's subtotal is expenses only.** Netting a salary against groceries reports neither.

**Selection is expenses-only**, and the header checkbox drives the additive `selectIds(ids)` —
**never `selectAll`**, which reads the hook's own store-derived list, a superset of whatever the
facet rail currently leaves visible, and would hand hidden rows to a bulk delete.

**The id list for shift-click is the table's own rendered order** (day-grouped, then sorted), never
the unfiltered store order.

**Narrowing a facet under an active selection TRIMS it** to what is still visible. Leaving it
untouched would let a bulk action act on a row the user can no longer see; clearing it outright
would needlessly discard a selection the next click might restore.

**There is deliberately no account facet.** Every row already belongs to the one open account, so it
would offer exactly one always-checked option. The "Added by" column is a different thing — its i18n
key is literally `colAccount` but it renders `createdByUserName`.

**The dialog HOSTS the existing detail cards** and triggers save through a ref, exactly as the phone
screen does. It must never grow a second edit implementation — that is what stops the desktop layer
drifting from mobile about what an edit does. It hosts all four expense components in the same order
as the phone screen, because anything it omitted would be unreachable from desktop.

**The two handles are asymmetric on purpose** — the expense one returns a Promise, the income one
returns void — and neither should be widened, because the Save button awaits neither.

## Known gaps

- `ExpensesDesktop.tsx` has been split once already (the four overlay dialogs moved to
  `ExpensesDesktopDialogs.tsx`) and is back near 800 lines. A new overlay belongs in the dialogs
  file, not inline.
- Keyboard shortcuts on this screen are a fixed set; `Ctrl`/`Cmd`+`K` may lose to the browser's own
  binding, so `/` is the primary, always-reachable one.

## History

ABA-499 (the screen, and the four component moves out of `app/` that it required) · ABA-533
(keyboard shortcuts) · ABA-538 (the dialog split).
