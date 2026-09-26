# Share to capture

## What this is
"Share → AI Budget" from any Android app (gallery, Gmail, a bank or store app) turns each shared
image or PDF into an expense: the app opens straight on the existing receipt confirm card,
pre-filled by OCR, and the user taps Save. Several files are a queue — one card after another,
"Receipt 2 of 5". Android only. Spec: `docs/superpowers/specs/2026-09-26-share-to-capture-design.md`.

## Entry points
- Native: `apps/mobile/android/app/src/main/java/com/budget/assistant/share/ShareIntakeModule.kt`
  (+ `ShareIntakePackage.kt`, registered by hand in `MainApplication.kt`); `MainActivity` hands
  `onCreate`/`onNewIntent` intents to `ShareIntakeModule.handleIntent`; two `intent-filter`s
  (`SEND`, `SEND_MULTIPLE` × `image/*`, `application/pdf`) in `AndroidManifest.xml`.
- JS bridge: `apps/mobile/src/services/shareIntake/` — real on Android, no-op on iOS/web.
- Queue: pure `src/features/share-intake/shareIntakeQueue.ts`; in-memory
  `src/stores/shareIntakeStore.ts`; navigation rule `shareIntakeGate.ts`; `sharedFileKind.ts`.
- Root hook: `src/hooks/useShareIntake.ts` (composed in `app/_layout.tsx`).
- Screen: `app/expense/receipt.tsx?source=share` → `ReceiptExpenseView` `shareMode`;
  `useReceiptScanner.processSharedFile`; `useReceiptSave`'s `queue` param.
- Copy: `shareIntake.*` in all 9 locales; user docs `user_docs/*/04-voice-and-receipt.md`.

## Key concepts
**Files are copied natively, at once.** The read grant on a foreign `content://` URI is
temporary, so `ShareIntakeModule` copies every stream into `cacheDir/shared-intake/` before
anything else and JS only ever sees `file://` URIs. Limits are enforced there too (10 files,
PDF ≤ 10 MB, image ≤ 25 MB); what does not fit is counted as `droppedCount` and reported once.

**Cold vs warm delivery.** A share that arrives before JS listens is held and read by
`getInitialShare()` (also re-read on every `AppState → active`); a warm share is emitted as
`ShareIntakeReceived` via `emitDeviceEvent`.

**One queue run.** `ShareQueue` keeps finished files before `index` so the title can say
"n of N"; advancing past the last file collapses it to `EMPTY_QUEUE`. A new share while the
screen is open appends to the running queue.

**The scan is the ordinary receipt scan.** `processSharedFile` routes to the scanner's existing
image or PDF path, so downscaling, the ABA-603 duplicate pre-check and `POST /ai/scan-receipt`
all apply unchanged. The server has no share-specific code.

## Invariants
- **Navigate only through `decideShareNavigation`** — it waits for the same `coldStartGateReady`
  as the notification and trip-invite flushes (earlier navigation wedges expo-router on a black
  screen) and for `firstRunStore.seen` (never cover first-run onboarding); it blocks a viewer.
- **`screenOpen` keeps the root hook idle while the receipt screen shows a queue** — both react
  to `pendingNavigation`, and effect order is not guaranteed; without it a warm share could push
  a second copy of the route. Do not replace it with `usePathname()` in RootNavigator.
- **Every exit from a queued file goes through the queue** — Save/Next, the last Done, Skip,
  Enter manually, a declined duplicate. Each advances and deletes the cache copy. Leaving the
  saved file as the head once made the next share re-scan an already saved receipt.
- **A 403 stops the whole run** (every remaining file would fail the same way) and opens the
  paywall; other errors offer Skip / Enter manually per file.
- **Warm events use `emitDeviceEvent`**, never `getJSModule(...).emit()` (swallowed under New
  Architecture). The module is legacy Old-Arch with no codegen (Windows MAX_PATH).
- **A SEND intent is handled only on a fresh launch** — `MainActivity` skips it when there is
  saved state or `FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY`: a share-started task keeps the SEND
  intent as its root, and after process death Android recreates the Activity from it, which
  re-queued receipts already saved.
- **Nothing is emitted before JS asks** — the module exists from bundle evaluation, long before
  the root hook subscribes; until the first `getInitialShare()` (`jsReady`) payloads are held,
  and several held shares are merged, never overwritten.
- **Only a foreign `content://` URI is copied** — a `file://` or our own provider could point
  at this app's private storage and get it uploaded for OCR. Typed parcelable getters are used
  only on SDK 34+ (Android 13 bug, same gate as `IntentCompat`).
- **Scans wait while the screen is not focused** (`paused`), so the next file's alerts never pop
  over the manual form; "Edit" takes the file off the queue; "Scan again" re-scans the head
  explicitly; "Open" from the duplicate prompt discards the run and `router.replace`s.
- **Back gesture / hardware back discard the rest** (`beforeRemove`) — only ✕ asks first.
- **A share where every file is dropped is reported by the root hook** (`shouldAnnounceDropped`),
  since no screen opens to report it.
- **The confirm screen shows the target account** with the `AccountSwitcher`.
- **The queue is in-memory by design** and reset on sign-out; process death loses it (saved
  expenses stay). `purgeStale(24h)` on launch removes leftover copies.

## Known gaps
- "Enter manually" after a failed scan opens an empty form without the file attached —
  `handleEditExpense` needs a scanned receipt, and a failed scan has none.
- No iOS (not possible without a native share extension) and no web (Web Share Target needs a
  service worker, which the web build deliberately lacks).
- Text / SMS sharing, background save and multi-photo long receipts are out of scope.
- The native part has no automated test; it is verified on a device (checklist in the plan,
  `docs/superpowers/plans/2026-09-26-share-to-capture.md`, Task 8).

## History
Share-to-capture (2026-09-26).
