# Smart Shopping List — Multiple Named Lists (M5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a household keep several named shopping lists (e.g. "Weekly", "Party") with a switcher, and rename / archive / delete them.

**Architecture:** Mobile-only. The `ShoppingList` table, the list CRUD REST endpoints (`POST/PATCH/DELETE /shopping-list[/:id]`), and the offline-first store (`createList`/`deleteList`/`setActiveList`, `lists`, `activeListId` in MMKV) already exist from M1/M2. This adds two store actions (`renameList`/`archiveList`) + a targeted repository update + a list-switcher UI on the shopping-list screen. No API or schema change.

**Tech Stack:** Expo/RN + Zustand + SQLite + i18next.

## Global Constraints

- No backend/schema change. The server `updateList` already accepts `{name?, isArchived?}` (and is NOT `ViewerBlockGuard`-gated); only `deleteList` is guarded server-side.
- Offline-first: list mutations write SQLite first (`sync_status='pending'`), fire the REST call, mark synced only on ACK (never before — the M2 hydrate-race lesson), `console.warn` on failure (row stays pending), NEVER `console.error`.
- Use a **targeted** repository update for rename/archive (a new `updateShoppingList(id, patch)`), NOT a full-row `upsertShoppingList({...stale})` — the stale-snapshot data-loss class fixed in M2.
- Mobile gating (mirror server enforcement): **create + rename = all members** (per design "add/rename allowed for all"); **archive + delete = `canEdit`-gated** (destructive). Item ops remain ungated.
- When archiving the currently-active list, switch `activeListId` to another non-archived list (`getLists` lazily re-materializes a default if none remain).
- New i18n keys in all 9 locales. No new screen (a bottom-sheet on the existing list screen) — but if any new route were added it would need a header.

---

### Task 1: Repository update + store actions (rename/archive)

**Files:**
- Modify: `apps/mobile/src/db/shoppingListRepository.ts` (add `updateShoppingList(id, patch)`)
- Modify: `apps/mobile/src/stores/shoppingListStore.ts` (add `renameList`/`archiveList`)
- Test: `apps/mobile/src/db/__tests__/shoppingListMappers.test.ts` (extend — or a small new test) is optional; the store actions are exercised by the existing test harness patterns.

**Interfaces:**
- Produces: `updateShoppingList(id: string, patch: { name?: string; isArchived?: boolean }): Promise<void>` (targeted SET + `sync_status='pending'` + `updated_at`); store actions `renameList(id, name)` / `archiveList(id)`.

- [ ] **Step 1: Add the targeted repo update** (mirror `updateShoppingListItem`'s dynamic-patch shape)

```ts
// shoppingListRepository.ts
export async function updateShoppingList(
  id: string,
  patch: { name?: string; isArchived?: boolean },
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
  if (patch.isArchived !== undefined) { sets.push('is_archived = ?'); params.push(patch.isArchived ? 1 : 0); }
  sets.push("sync_status = 'pending'", 'updated_at = ?');
  params.push(Date.now(), id);
  await executeSql(`UPDATE shopping_lists SET ${sets.join(', ')} WHERE id = ?`, params);
}
```

- [ ] **Step 2: Add the store actions** (READ the existing `createList` for the ack pattern first)

Add to the store interface: `renameList: (id: string, name: string) => Promise<void>;` and `archiveList: (id: string) => Promise<void>;`. Implement, mirroring `createList`'s offline-first "mark synced only on ack" shape:

- `renameList(id, name)`: optimistic in-memory `set` (update the matching list's `name`), `await updateShoppingList(id, { name })` (SQLite pending), then fire `api.updateList(id, { name }).then(() => markShoppingListSynced(id)).catch((e) => console.warn('[shoppingListStore] renameList sync deferred', e))`.
- `archiveList(id)`: optimistic in-memory `set` (remove the list from `lists`), `await updateShoppingList(id, { isArchived: true })`, then fire `api.updateList(id, { isArchived: true }).then(() => markShoppingListSynced(id)).catch(warn)`. **If `id === activeListId`**, set `activeListId` to the first remaining non-archived list's id (or call `hydrate()` to re-materialize a default if none remain), persisting the new `activeListId` to MMKV the same way `setActiveList` does.

- [ ] **Step 3: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS.
```bash
git add apps/mobile/src/db/shoppingListRepository.ts apps/mobile/src/stores/shoppingListStore.ts
git commit -m "feat(mobile): shopping-list rename/archive store actions"
```

---

### Task 2: List switcher UI

**Files:**
- Modify: `apps/mobile/app/shopping-list/index.tsx`

**Interfaces:**
- Consumes: store `lists`, `activeListId`, `setActiveList`, `createList`, `renameList`, `archiveList`, `deleteList`; `useAccountStore().canEdit()`.

- [ ] **Step 1: Add the switcher pill + bottom-sheet**

At the top of the screen body (above the "Time to restock" strip), render a **switcher pill**: the active list's `name` + a `▾` chevron. Tapping it opens an in-page `<Modal>` bottom-sheet (same style as the add-item sheet) that:
- Lists all `lists` (name + a check on the active one) — tapping one → `setActiveList(id)` + close the sheet.
- A **"+ New list"** row → prompt for a name (a small inline `TextInput` in the sheet, or `Alert.prompt` on iOS + a text-input row) → `createList(name)` (available to all members).
- Per-list overflow actions (an icon/long-press per row):
  - **Rename** (all members) → prompt → `renameList(id, name)`.
  - **Archive** (`canEdit` only) → confirm (`t('shoppingList.archiveListConfirm')`) → `archiveList(id)`.
  - **Delete** (`canEdit` only) → confirm (`t('shoppingList.deleteListConfirm')`) → `deleteList(id)`.
- Gating: hide Archive/Delete affordances when `!canEdit`; keep New/Rename for all members.

Keep the existing header-right delete-list button OR move its function into the sheet (avoid two delete affordances — prefer the sheet; remove the header-right delete if it duplicates). The switcher pill replaces the need for the static screen title to convey the active list.

- [ ] **Step 2: Typecheck + lint + commit**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS. Lint clean.
```bash
git add apps/mobile/app/shopping-list/index.tsx
git commit -m "feat(mobile): shopping-list switcher (multiple named lists)"
```

---

### Task 3: i18n

**Files:**
- Modify: all 9 `apps/mobile/src/i18n/locales/*.ts`

- [ ] **Step 1: Add keys to `en.ts`** (under `shoppingList`, do NOT duplicate existing `newList`/`deleteList`/`deleteListConfirm`): `switchList: 'Switch list'`, `renameList: 'Rename list'`, `archiveList: 'Archive list'`, `archiveListConfirm: 'Archive this list? It will be hidden but not deleted.'`, `listName: 'List name'`, `manageLists: 'Manage lists'`.
- [ ] **Step 2: Propagate to the other 8 locales** (genuine translations) via the `i18n-add-strings` skill. Verify all 9 have the 6 keys.
- [ ] **Step 3: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS.
```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(mobile): multi-list i18n across 9 locales"
```

---

### Task 4: Final verification

- [ ] **Step 1:** `cd apps/mobile && npx tsc --noEmit` → 0 errors.
- [ ] **Step 2:** `cd apps/mobile && npx jest` → new/existing shopping-list suites pass; only the known baseline failures (notificationParser CHF/CZK + invitationStore) remain.
- [ ] **Step 3:** i18n parity: all 9 locales have the 6 new `shoppingList.*` keys.
- [ ] **Step 4:** Lint clean on the touched mobile files.

---

## Self-Review

**Spec coverage (M5):**
- Multiple named lists via a switcher → Task 2 (data already exists). ✓
- Rename / archive / delete (targeted, offline-first) → Task 1 + Task 2. ✓
- Active-list switch on archive → Task 1. ✓
- Gating (create/rename all; archive/delete editor+) → Task 2. ✓
- i18n 9 locales → Task 3. ✓

**Placeholder scan:** the repo update + store-action shapes are given as code; the UI is specced against the existing add-item bottom-sheet + `canEdit` conventions on the same screen.

**Type consistency:** `updateShoppingList(id, patch)` (Task 1) consumed by `renameList`/`archiveList`; store action signatures added to the interface; `api.updateList(id, {name|isArchived})` already exists (M2).

## Roadmap — remaining
Plan 6 (M6 Deals — reuses the M3 reminder cron + a new `shopping_deal` notification type).
