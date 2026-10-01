# Reference data screens and the viewer role in the UI

*Hub: [mobile-app](../mobile-app.md) · shell: [settings-desktop-shell](settings-desktop-shell.md) ·
related: [tags](tags.md), [merchants](merchants.md), [auth](../auth.md)*

## What this is

The four screens that manage an account's reference data — categories, merchants, tags, projects —
and the rule every write affordance in the app follows for a `viewer` member.

## Entry points

- Routes (thin, each wraps its body in `SettingsRoute`): `apps/mobile/app/settings/categories.tsx`,
  `apps/mobile/app/settings/merchants.tsx`, `apps/mobile/app/tags/manage.tsx`,
  `apps/mobile/app/projects/index.tsx`
- Bodies: `apps/mobile/src/components/settings/{categories,merchants,tags,projects}/*Settings.tsx`
- `apps/mobile/app/projects/[id].tsx` — a project's expenses (from `expenseStore`) with edit/delete
  in the stack header; not extracted
- `apps/mobile/src/components/SheetDialog.tsx` — the edit sheet chrome
- `accountStore.canEdit()` — `apps/mobile/src/stores/accountStore.ts`

## Key concepts

**One layout for all four.** A section header with the title and an optional `+`, then a single
card of rows separated by dividers. Tapping a row's content opens an edit sheet (Cancel + Save);
a trash icon sits on the right. Merchants have no `+` — they are derived from expenses, never
created by hand. The bodies live under `src/` so a desktop settings pane can host them; the route
keeps only its `<Stack.Screen>` title.

**`canEdit()`** is false for a `viewer`, and also for any member of an archived trip account
(`tripStatus === 'archived'`). It is true only for `owner` and `editor`.

## Invariants

**Gate every write affordance on `canEdit`.** Wrap `+`, pencil and trash in `{canEdit && …}`, and on
a tappable row pass `onPress={canEdit ? handler : undefined}` with
`activeOpacity={canEdit ? 0.7 : 1}`, so a viewer's row gives no press feedback at all. A header
action does the same (`headerRight: canEdit ? … : undefined`, as `projects/[id].tsx` does).

**The mobile gate is UI only.** The API blocks the write regardless (`ViewerBlockGuard`); the UI
gate exists so a viewer never meets a button that fails.

## History

ABA-155 (`ViewerBlockGuard` on the API) · ABA-158, ABA-159 (the shared reference-data layout) ·
ABA-508–ABA-512 (the settings desktop shell; bodies moved under `src/` for its panes).
