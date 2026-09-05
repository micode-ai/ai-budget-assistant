# Desktop Create Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the desktop web transactions screen, "Add Expense" and "Add Income" open a dialog over the list instead of navigating to a separate screen.

**Architecture:** The two create screens are ~600-line route files under `app/`. Each is split into a presentational form component under `src/` plus a thin route screen, exactly as `ExpenseDetailsCard` and `IncomeDetailsCard` already are. The desktop dialog then **hosts** the same component the route hosts. The form is never copied — a second implementation of the create form is the failure this plan exists to avoid.

**Tech Stack:** Expo Router, React Native Web, TypeScript, Jest (no render tests exist in this repo).

**Spec:** `docs/superpowers/specs/2026-09-04-desktop-web-reference-screen-design.md` — decisions 4 (a detail opens in a dialog) and 5 (the dialog is a shell around the existing component, never a second implementation). This plan extends the same rule from viewing to creating.

## Global Constraints

- **The mobile rendering must not change.** After the extraction, `app/expense/new.tsx` and `app/income/new.tsx` must render exactly what they render today. If a mobile create screen looks or behaves differently, this plan was implemented wrongly.
- **The form is extracted, never copied.** One definition, hosted by both the route and the dialog.
- **Nothing under `src/` may import from `app/`** — there is no path alias for it, and every file under `app/` is a route.
- **Every colour, spacing and text style comes from `useTheme()` tokens.** 13 accents map onto brand tokens at runtime; a colour defined for only one theme is a bug in the other. Dark's ground is `#000000`, surfaces `#1A1A1A`.
- **No new dependency.**
- **All nine locales** (`en, ru, pl, de, es, fr, ua, be, nl`) for any new key. Reuse an existing key where one genuinely fits.
- Date fields go through `src/components/DatePicker.tsx`, never `@react-native-community/datetimepicker` directly.
- The suite currently stands at **884 tests across 103 suites**. Record what it actually reports; never predict a number.

---

### Task 1: Extract the expense create form

**Files:**
- Create: `apps/mobile/src/components/expenses/create/ExpenseCreateForm.tsx`
- Modify: `apps/mobile/app/expense/new.tsx`

**Interfaces:**
- Produces: `ExpenseCreateForm` — `{ initial?: ExpenseCreatePrefill; onDone: () => void }`, where `ExpenseCreatePrefill` carries the fields the duplicate flow passes today (amount, description, categoryId, currencyCode). `onDone` is called after a successful save and on cancel.
- Consumes: nothing new.

- [ ] **Step 1: Move the body, not a copy of it**

`app/expense/new.tsx` currently reads `useLocalSearchParams` at line ~67 and calls `router.back()` at line ~235. Everything between the component's first hook and its closing `)` moves into the new component unchanged, with exactly two substitutions:

- the `useLocalSearchParams` read becomes the `initial` prop
- `router.back()` becomes `onDone()`

Leave `KeyboardAvoidingView`/`ScrollView` inside the component: the dialog will host a form that manages its own scrolling, and the route keeps behaving as it does today.

- [ ] **Step 2: Make the route a thin host**

`app/expense/new.tsx` becomes: read the params, render `<ExpenseCreateForm initial={...} onDone={() => router.back()} />`. Nothing else. It keeps its own `Stack.Screen` header if it has one.

- [ ] **Step 3: Verify the mobile screen is unchanged**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
```

Then read the diff of `app/expense/new.tsx` and confirm every line that left it appears in the new component. A line that changed shape while moving is the one thing this task must not do.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/expenses/create apps/mobile/app/expense/new.tsx
git commit -m "ABA-500 Extract the expense create form so a dialog can host it"
```

---

### Task 2: Extract the income create form

**Files:**
- Create: `apps/mobile/src/components/income/create/IncomeCreateForm.tsx`
- Modify: `apps/mobile/app/income/new.tsx`

**Interfaces:**
- Produces: `IncomeCreateForm` — `{ initial?: IncomeCreatePrefill; onDone: () => void; onOpenVoice?: () => void; onOpenReceipt?: () => void }`.
- Consumes: nothing new.

- [ ] **Step 1: Move the body**

Same two substitutions as Task 1, plus a third that Task 1 did not need. `app/income/new.tsx` has two shortcut buttons that do `router.back(); router.push('/income/voice')` and the same for `/income/receipt`. Those become the optional `onOpenVoice`/`onOpenReceipt` props.

**When a host does not pass them, do not render those buttons.** They must not fall back to navigating: from a dialog, `router.back()` would dismiss whatever is underneath rather than the dialog, and the user would land somewhere they did not ask to be.

- [ ] **Step 2: Make the route a thin host**

`app/income/new.tsx` renders `<IncomeCreateForm initial={...} onDone={() => router.back()} onOpenVoice={...} onOpenReceipt={...} />` and nothing else.

- [ ] **Step 3: Verify and commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/income/create apps/mobile/app/income/new.tsx
git commit -m "ABA-500 Extract the income create form so a dialog can host it"
```

---

### Task 3: The create dialog

**Files:**
- Create: `apps/mobile/src/components/expenses/desktop/CreateDialog.tsx`
- Modify: `apps/mobile/src/components/expenses/desktop/ExpensesDesktop.tsx`

**Interfaces consumed:** `ExpenseCreateForm` and `IncomeCreateForm` from Tasks 1 and 2; `ExpenseDialog.tsx` as the shape to follow.

- [ ] **Step 1: Build it as a sibling of `ExpenseDialog`**

Read `ExpenseDialog.tsx` first and follow it rather than inventing a second modal: RN's own `Modal` (which supplies `role="dialog"`, `aria-modal`, the `Esc` handler, the focus trap and focus restoration — verified against react-native-web's source), a raw `<div>` scrim rather than a `Pressable` (a `Pressable` emits a `tabIndex` and the invisible scrim would become the trap's first focus target), `theme.colors.overlay`, `aria-labelledby` pointing at the title, and a `maxWidth` around 680 with its own internal scroll.

It takes `{ kind: 'expense' | 'income'; onClose: () => void }` and hosts the matching form with `onDone={onClose}`. It passes neither `onOpenVoice` nor `onOpenReceipt`.

- [ ] **Step 2: Wire the two buttons**

`ExpensesDesktop`'s "Add Expense" and "Add Income" stop calling `router.push` and open this dialog instead. `handleAddExpense` stays on the hook untouched — it is what the mobile view still uses.

- [ ] **Step 3: Confirm the list updates**

A saved expense must appear in the table without a manual refresh. The stores are the same ones the list reads, so it should; confirm it rather than assuming, and say in your report how you confirmed it.

- [ ] **Step 4: Verify**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
```

Say plainly what these cannot tell you: nothing here renders the dialog, so the focus trap, `Esc`, and the form's behaviour inside a modal are unverified until someone opens a browser.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/expenses/desktop
git commit -m "ABA-500 Open the create forms in a dialog on desktop"
```

---

## Deployment notes

- `web-deploy.yml` rebuilds and ships the SPA on every push to `development`; there is no separate step and no feature flag.
- Nothing here requires a mobile release. Metro resolves `ExpensesView.tsx` -> `ExpensesMobile.tsx` for native, and the two route screens keep working exactly as before.
- If the extraction is wrong, the symptom appears on **mobile**, not desktop — the route screens are the heavily used path. Weight the verification accordingly.
