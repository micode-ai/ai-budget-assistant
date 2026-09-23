# Desktop keyboard shortcuts

*Hub: [mobile-app](../mobile-app.md) · reference screen:
[desktop-transactions-screen](desktop-transactions-screen.md)*

## What this is

A small, fixed, desktop-web-only set of key bindings, currently on the transactions screen only,
plus a `?` cheat sheet that lists whatever is live.

| Key | Action |
|---|---|
| `/`, `Ctrl`/`Cmd`+`K` | focus search |
| `n` | open "Add expense" (`canEdit`-gated; no-op while a dialog or menu is open) |
| `↑` / `↓` | move the row cursor (never wraps) |
| `Enter` | open the cursor row |
| `Space` | toggle the cursor row's checkbox (expenses only, `canEdit`-gated) |
| `?` | cheat sheet |

## Entry points

- `apps/mobile/src/features/shortcuts/` — `shortcutCombo.ts`, `shortcutRegistry.ts`,
  `shortcutGrouping.ts` (pure, unit-tested)
- `apps/mobile/src/features/expenses/rowKeyboardNav.ts` — `resolveNextFocusedRow`
- `apps/mobile/src/hooks/useDesktopShortcuts.ts` — the only file touching `document`
- `apps/mobile/src/components/shortcuts/ShortcutsHelpOverlay.tsx`
- `apps/mobile/src/components/WebShell.web.tsx` — mounts the single listener
- Contract: `docs/contracts/desktop-keyboard-shortcuts.md`

## Key concepts

**Screen-agnostic mechanism, screen-owned bindings.** `useDesktopShortcut(combo, handler, opts)`
registers while its caller is mounted and gates itself on desktop web, so callers never double-guard.
`useDesktopShortcutsListener()` is the one global `keydown` listener. Wiring bindings into another
screen is that screen's own decision.

**Most recent registration wins.** The registry is a LIFO stack: a dialog mounted over a screen wins
a combo the screen also registered, with no priority system, because mount order already reflects
what is on top.

**`↑`/`↓` walk the table's own rendered order** — day-grouped, then sorted, the same list shift-click
range selection uses. A plain click also moves the cursor, so arrows continue from where the user
was looking.

## Invariants

**An editable-target block is a hard stop, not a fall-through.** `resolveShortcutHandler` returns
`null` the moment the newest registration for a combo disallows input targets — typing `n` in a form
field must type an "n", not reach an older input-safe registration of the same combo.

**No `Esc` binding.** Every desktop dialog already closes on Escape through RN's own `Modal`. The
overlay lists `Esc` as a static row; registering a handler would fight the existing focus trap.

**The listener mounts above `DesktopShell`'s early unauthenticated return**, so the hook count
cannot change across a live sign-out.

**The cheat sheet reads the live registry, never a hardcoded list**, so it cannot advertise a binding
that is not active on the current screen. On a screen with none of its own it still shows `?` and
`Esc`.

**Table bindings are off while any dialog or menu is open** (`keyboardNavEnabled` in
`ExpensesDesktop`). The table stays mounted under a modal; without this a background row could move
or toggle under the user's real attention.

## Known gaps

- `Ctrl`/`Cmd`+`K` may lose to the browser's own shortcut; `/` is the always-reachable binding.
- No command palette, no user-customizable bindings, no bindings on other screens yet.

## History

ABA-533.
