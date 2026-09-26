# Share-to-capture — design

Date: 2026-09-26 · Status: approved in brainstorming, awaiting spec review

## Goal

Turn "Share → AI Budget" from any Android app (bank app screenshot, Allegro order,
BLIK confirmation, an e-receipt PDF from mail or a store app) into an expense with
one confirmation tap. Manual entry is the most common reason people stop tracking;
this removes it for everything that already exists as an image or a PDF on the phone.

Success: a user shares one or several screenshots/PDFs and, for each, lands on the
existing receipt confirm card pre-filled by OCR, needing only "Save".

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| What happens after sharing | **Open the confirm card** (no silent save) |
| Content types | **Images + PDF** (no plain text / SMS) |
| Platforms | **Native Android only** (no iOS — not possible; no Web Share Target — would need a service worker the web build deliberately lacks) |
| Several files in one share | **Queue** — one expense per file, confirm cards one after another, "2 of 5" |
| Native intake | **Own Kotlin module**, no third-party library |

Rejected: `expo-share-intent` (config-plugin/prebuild oriented, we are bare with a
committed `android/`; brings its own codegen'd native part — same risk class as the
`react-native-keyboard-controller` MAX_PATH failure). A separate transparent
`ShareActivity` only makes sense for background save, which was rejected.

## Architecture

### 1. Native intake — `com.budget.assistant.share`

- `AndroidManifest.xml`: two `intent-filter`s on `MainActivity` —
  `android.intent.action.SEND` and `android.intent.action.SEND_MULTIPLE`, category
  `DEFAULT`, `mimeType` `image/*` and `application/pdf`.
- `ShareIntentModule.kt` + `ShareIntentPackage.kt` (registered in `MainApplication`,
  same shape as `installreferrer/`).
- `MainActivity` hands every incoming intent (`onCreate` and `onNewIntent`) to the
  module. `MainActivity.onCreate` keeps `super.onCreate(null)` (ABA-188) — untouched.
- The module **copies each `content://` stream into `cacheDir/shared-intake/` immediately**,
  because the read grant on a foreign URI is temporary. It records `{ uri (file://),
  mimeType, name, size }`.
- Limits applied natively: at most **10 files** per queue, PDFs at most **10 MB**
  (the scanner's `MAX_PDF_SIZE`), MIME must be `image/*` or `application/pdf`.
  Dropped files are counted and reported (`droppedCount`) so JS can tell the user.
- JS surface:
  - `getInitialShare(): Promise<SharedFile[] & droppedCount>` — cold start, consumed once.
  - device event `ShareIntakeReceived` via `reactContext.emitDeviceEvent` — warm start.
    (`getJSModule(...).emit()` is silently swallowed under New Architecture.)
  - `deleteFile(uri)` and `purgeStale(maxAgeMs)`.
- A JS no-op for web/iOS (`shareIntake.ts` extensionless no-op + `.android.ts` real),
  so nothing native leaks into the web bundle.

### 2. JS queue

- `src/features/share-intake/shareIntakeQueue.ts` — **pure** functions: `enqueue`
  (appends, enforces the 10 cap across the whole queue, filters MIME), `advance`,
  `cancelRemaining`, `current`, `position` ("2 of 5").
- `src/stores/shareIntakeStore.ts` — in-memory Zustand wrapper over the pure queue.
  Not persisted: if the app is killed mid-queue, the queue is lost; saved expenses stay.
  The user can simply share again. Its `reset()` is called from sign-out like every
  account-scoped store.
- `src/hooks/useShareIntake.ts` — mounted in `app/_layout.tsx` (its own hook, per the
  "`_layout.tsx` is a composition of hooks" rule). Pulls `getInitialShare()` and listens
  for `ShareIntakeReceived`, enqueues, then navigates to `expense/receipt?source=share`
  **only when `useColdStartGate` is open** — navigating earlier wedges expo-router on a
  black screen. Also runs `purgeStale(24h)` once per launch.

### 3. Screen

- `app/expense/receipt.tsx` reads `source=share`. `ReceiptExpenseView` gets the queue's
  current file: it hides the camera/gallery/PDF buttons and calls a new
  `scanner.processSharedFile(uri, mimeType)` — a thin public entry over the scanner's
  existing image path (`processImage`) and PDF path, so the ABA-603 duplicate pre-check,
  downscaling (`receiptImage.ts`) and `POST /ai/scan-receipt` are all reused unchanged.
- After a successful save, instead of the "Scan another / Done" alert, the view advances
  the queue and scans the next file. When the queue is empty, normal `onDone`.
- Header shows `shareIntake.progress` ("Receipt 2 of 5") while a queue is active.
- The confirm card shows the current account name; the user can switch account with the
  existing `AccountSwitcher` before saving.

### 4. Server

No change. Each shared file costs one existing OCR request (`@TrackAiUsage('ocr', 2.0)`).

## Errors and edge cases

| Case | Behaviour |
|---|---|
| OCR failed / not recognised | Scanner error + **Skip** (next file) and **Enter manually** (existing `handleEditExpense`, file as attachment) |
| Duplicate (ABA-603) | Existing `confirmDuplicateScan`; "don't scan" = skip, queue continues |
| AI limit reached (403 `TIER_REQUIRED` / monthly limit) | Paywall via `upgradeStore`; **whole queue stops** (the rest would fail identically); message "N files left — share them again later" |
| Offline | Normal scanner error + Skip / Enter manually. No deferred OCR in v1 |
| ✕ mid-queue | Confirm "Discard remaining N?", then clear the queue |
| New share while a queue is open | Append to the end; 10-cap is on the whole queue |
| Current account role is `viewer` | Do not navigate; toast "You can't add expenses to this account"; clear the queue |
| Signed out | Queue waits for sign-in; if first-run onboarding (`get-started`) is routed, the queue waits until it is finished |
| Cache files | Deleted when processed or skipped; `purgeStale(24h)` on launch catches leftovers from a killed process |

## Testing

- Jest unit tests:
  - `shareIntakeQueue.test.ts` — enqueue, the 10 cap across multiple shares, MIME filter,
    advance, cancel, position.
  - `processSharedFile` routing PDF vs image.
  - navigation gate: signed out, viewer, onboarding pending, cold-start gate closed.
- Kotlin part: manual on-device checklist — one screenshot; five from gallery; a PDF
  from Gmail; share while app running (warm) and while killed (cold); 12 files (2
  dropped, message shown); share, then kill the app mid-queue, relaunch (stale purge).
- No render tests — the repo has no `react-test-renderer` / `@testing-library/react-native`.

## Docs and i18n

- ~8 new `shareIntake.*` keys in all 9 locales (progress, skip, enter manually, discard
  remaining, files dropped, viewer blocked, limit-stopped, account label).
- Extend the existing receipt-scanning section in `user_docs/<lang>/` (no new section
  registration), then `npm run generate:help`.
- Wiki page `docs/wiki/features/share-to-capture.md` + log line, via `finish-aba-task`.

## Out of scope (v1)

iOS; web (Web Share Target); plain text / SMS sharing; background save; stitching
several photos into one long receipt; sharing as income instead of expense; persisting
the queue across process death; deferred OCR when offline.
