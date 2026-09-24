# Date pickers and date-only values

*Hub: [mobile-app](../mobile-app.md)*

## What this is

Every date field in the app goes through one component, because the native picker library renders
nothing on web. And every date-only value is converted without going through UTC, because that
shifts the calendar day.

## Entry points

- `apps/mobile/src/components/DatePicker.tsx` — wraps `@react-native-community/datetimepicker`;
  `iosDisplay?: 'spinner' | 'inline'`
- `apps/mobile/src/components/DatePicker.web.tsx` — a real `<input type="date">`
- `apps/mobile/src/utils/dateInput.ts` — `toDateInputValue`, `fromDateInputValue` (unit-tested)
- Call sites: find them with `grep -rl "components/DatePicker" apps/mobile` — the expense and income
  create forms and detail cards, the debt due date, goals, trips, reports, wallet transfers

## Key concepts

**`@react-native-community/datetimepicker` has no web implementation.** It ships android, ios and
windows files but no `.web.js`, so Metro resolves the fallback, whose whole body is a `console.warn`
and `return null`. Every date field on web was silently dead: tapping flipped the show flag and
rendered nothing.

**The web variant** renders a native date input and best-effort calls `showPicker()` on mount, so
one tap opens the browser calendar (`showPicker` is Chromium / recent Safari only and can throw).
**Blur is dismissal**: it calls `onChange(undefined)`, which the call sites' existing "close on
change" branch already handles — so there is no extra prop.

**`onChange(date | undefined)` mirrors the library's contract**, so each call site keeps owning its
own close logic.

**The transaction date is a create-form field.** The expense and income create forms default it to
now and do **not** clamp it with `maximumDate` — the edit form accepts any date, and a create form
refusing what the edit form allows would be the inconsistency.

## Invariants

**No file other than `DatePicker.tsx` may import `@react-native-community/datetimepicker`.** That
import existing anywhere else is the bug.

**Close on `Platform.OS === 'ios'` / `!== 'ios'`, never `=== 'android'`.** Several call sites once
closed only on Android, which left the web input stuck open.

**Date-only values never go through `toISOString()` or `new Date(string)`.** Both route through
UTC: in UTC+2 a date picked at local midnight becomes the previous day. `toDateInputValue` /
`fromDateInputValue` do the conversion in local time.

**`fromDateInputValue` returns `null`** for empty, partial or impossible input — `2026-02-31` would
otherwise roll into March — so a half-typed value never puts an `Invalid Date` into a store.

## Known gaps

- Two screens still build a default date through UTC:
  `app/subscriptions/new.tsx` (`formatDateForInput` → `toISOString().split('T')[0]`, the default
  next renewal) and `app/investment/transaction.tsx` (initial `date` state, then `new Date(date)`
  on save). East of UTC, just after local midnight, the default is yesterday; `new Date('YYYY-MM-DD')`
  is UTC midnight, which is the previous local day west of UTC. Both use plain text inputs, not
  `DatePicker`. Found 2026-09-24, not yet fixed.

## History

ABA-380 (the transaction date on create forms) · ABA-381 (the web picker, `dateInput.ts`, and the
same UTC bug fixed in `goals/new.tsx`).
