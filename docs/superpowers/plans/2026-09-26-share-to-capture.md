# Share-to-capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Share → AI Budget" from any Android app turns each shared image/PDF into an OCR-prefilled expense on the existing receipt confirm card, one file after another.

**Architecture:** A hand-written legacy (Old-Arch, no codegen) Kotlin module receives `ACTION_SEND`/`ACTION_SEND_MULTIPLE`, copies each foreign `content://` stream into the app cache and hands `{uri, mimeType, name, size}` to JS. A pure queue + an in-memory Zustand store hold the files; a `_layout.tsx` hook navigates to `expense/receipt?source=share` once the cold-start gate opens; `ReceiptExpenseView` scans the queue head through the existing scanner and advances on save/skip.

**Tech Stack:** Kotlin (React Native legacy NativeModule), React Native 0.81 / Expo 54, expo-router, Zustand, Jest (`jest-expo`), i18next (9 locales).

**Spec:** `docs/superpowers/specs/2026-09-26-share-to-capture-design.md`

## Global Constraints

- Android only. iOS and web get a no-op JS module; nothing native leaks into the web bundle.
- No new npm or Gradle dependency. Legacy `ReactContextBaseJavaModule`, registered by hand in `MainApplication.getPackages()` — no TurboModule spec, no codegen (Windows MAX_PATH).
- `MainActivity.onCreate` keeps `super.onCreate(null)` (ABA-188).
- Warm-start events use `reactContext.emitDeviceEvent(...)`, never `getJSModule(...).emit()` (swallowed under New Architecture).
- MIME accepted: `image/*` and `application/pdf`. Max **10 files** per queue (across shares). PDF max **10 MB** (`MAX_PDF_SIZE` in `useReceiptScanner`). Images max **25 MB** raw (guard against giant files; downscaled before upload anyway).
- Navigation only when `useColdStartGate` is open AND `useFirstRunStore.seen === true`.
- The queue is in-memory only; `useShareIntakeStore.getState().reset()` runs on sign-out.
- Server unchanged. Each file = one existing `POST /ai/scan-receipt`.
- Offline/expected failures log `console.warn`, never `console.error` (LogBox overlay).
- All new i18n keys in all 9 locales: `en de es fr pl ru ua be nl`.
- Spec deviation (verified in code): "Enter manually" after a failed scan opens `/expense/new` **without** the file attached — `handleEditExpense` needs a `scannedReceipt`, and a failed scan has none.

## Review Focus

1. A share arriving while the receipt screen is already open on a queue → it must append, not reset the current card. (Task 2 test `enqueue appends to a non-empty queue`.)
2. User cancels the duplicate prompt (ABA-603) for a queued file → the file is skipped and the next one scans, not a stuck empty capture view. (Task 7 manual step + `advanceOnDecline` wiring.)
3. The same file shared twice in one queue → both are queued (dedup is the ABA-603 fingerprint check's job, not the queue's). (Task 1 test `keeps two files with the same name`.)
4. A viewer account is current when a share arrives → no navigation, a message, queue cleared. (Task 3 test `viewer → block`.)
5. The app is killed mid-queue and relaunched without a share → no navigation to the receipt screen, and stale cache files are purged. (Task 4 `purgeStale` + Task 6 test `empty initial share does not navigate`.)

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/src/features/share-intake/shareIntakeQueue.ts` | Pure queue: types, `enqueue`, `advance`, `clear`, `position`, MIME filter, cap |
| `apps/mobile/src/features/share-intake/shareIntakeGate.ts` | Pure decision: navigate / wait / block-viewer |
| `apps/mobile/src/features/share-intake/sharedFileKind.ts` | Pure: `'pdf' \| 'image'` from MIME/name |
| `apps/mobile/src/features/share-intake/__tests__/*.test.ts` | Unit tests for the three pure modules + store |
| `apps/mobile/src/stores/shareIntakeStore.ts` | In-memory Zustand wrapper over the queue |
| `apps/mobile/src/services/shareIntake/index.ts` / `.android.ts` / `.ios.ts` / `.web.ts` | JS bridge (real on Android, no-op elsewhere) |
| `apps/mobile/src/hooks/useShareIntake.ts` | Capture initial + warm shares, purge stale, gated navigation |
| `apps/mobile/android/app/src/main/java/com/budget/assistant/share/ShareIntakeModule.kt` | Copy streams, hold pending share, emit event, delete/purge |
| `apps/mobile/android/app/src/main/java/com/budget/assistant/share/ShareIntakePackage.kt` | ReactPackage |
| Modified: `AndroidManifest.xml`, `MainActivity.kt`, `MainApplication.kt` | Intent filters, intent hand-off, registration |
| Modified: `src/features/receipt/useReceiptScanner.ts` | `processSharedFile`, `errorStatus` |
| Modified: `src/components/receipt/ReceiptExpenseView.tsx`, `src/hooks/useReceiptSave.ts`, `app/expense/receipt.tsx` | Share mode |
| Modified: `src/stores/authSessionActions.ts` | Reset queue on sign-out |
| Modified: 9 locale files | `shareIntake.*` keys |
| Docs: `user_docs/*/NN-*.md` (receipt section), `docs/wiki/features/share-to-capture.md`, `docs/wiki/log.md` | |

---

### Task 1: Pure share queue

**Files:**
- Create: `apps/mobile/src/features/share-intake/shareIntakeQueue.ts`
- Test: `apps/mobile/src/features/share-intake/__tests__/shareIntakeQueue.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SharedFile { uri: string; mimeType: string; name: string; size: number }
  export interface ShareQueue { files: SharedFile[]; index: number; total: number }
  export const SHARE_QUEUE_MAX = 10;
  export const EMPTY_QUEUE: ShareQueue;
  export function isAcceptedMime(mime: string): boolean;
  export function enqueue(q: ShareQueue, incoming: SharedFile[]): { queue: ShareQueue; dropped: SharedFile[] };
  export function current(q: ShareQueue): SharedFile | null;
  export function advance(q: ShareQueue): { queue: ShareQueue; finished: SharedFile | null };
  export function remaining(q: ShareQueue): SharedFile[];
  export function position(q: ShareQueue): { n: number; of: number } | null;
  ```
  `index` = position of the current file among ALL files ever in this queue run; `total` = count accepted into this run (so "2 of 5" survives advancing). A fully advanced queue returns to `EMPTY_QUEUE`.

- [ ] **Step 1: Write the failing test**

```ts
import {
  EMPTY_QUEUE, SHARE_QUEUE_MAX, enqueue, advance, current, position, remaining, isAcceptedMime,
  type SharedFile,
} from '../shareIntakeQueue';

const f = (name: string, mimeType = 'image/jpeg'): SharedFile => ({
  uri: `file:///cache/shared-intake/${name}`, mimeType, name, size: 1000,
});

describe('shareIntakeQueue', () => {
  it('accepts images and PDFs only', () => {
    expect(isAcceptedMime('image/png')).toBe(true);
    expect(isAcceptedMime('application/pdf')).toBe(true);
    expect(isAcceptedMime('text/plain')).toBe(false);
    expect(isAcceptedMime('')).toBe(false);
  });

  it('enqueues into an empty queue and reports position 1 of N', () => {
    const { queue, dropped } = enqueue(EMPTY_QUEUE, [f('a'), f('b')]);
    expect(dropped).toEqual([]);
    expect(current(queue)?.name).toBe('a');
    expect(position(queue)).toEqual({ n: 1, of: 2 });
  });

  it('drops unsupported MIME types', () => {
    const { queue, dropped } = enqueue(EMPTY_QUEUE, [f('a'), f('t', 'text/plain')]);
    expect(queue.files.map((x) => x.name)).toEqual(['a']);
    expect(dropped.map((x) => x.name)).toEqual(['t']);
  });

  it('caps the whole queue at SHARE_QUEUE_MAX across several shares', () => {
    const first = enqueue(EMPTY_QUEUE, Array.from({ length: 7 }, (_, i) => f(`a${i}`))).queue;
    const { queue, dropped } = enqueue(first, Array.from({ length: 5 }, (_, i) => f(`b${i}`)));
    expect(queue.total).toBe(SHARE_QUEUE_MAX);
    expect(dropped.map((x) => x.name)).toEqual(['b3', 'b4']);
  });

  it('enqueue appends to a non-empty queue without moving the current file', () => {
    const q1 = advance(enqueue(EMPTY_QUEUE, [f('a'), f('b')]).queue).queue; // now on b
    const q2 = enqueue(q1, [f('c')]).queue;
    expect(current(q2)?.name).toBe('b');
    expect(position(q2)).toEqual({ n: 2, of: 3 });
  });

  it('keeps two files with the same name', () => {
    const { queue } = enqueue(EMPTY_QUEUE, [f('same'), f('same')]);
    expect(queue.total).toBe(2);
  });

  it('advance returns the finished file and empties at the end', () => {
    let q = enqueue(EMPTY_QUEUE, [f('a'), f('b')]).queue;
    let r = advance(q);
    expect(r.finished?.name).toBe('a');
    q = r.queue;
    r = advance(q);
    expect(r.finished?.name).toBe('b');
    expect(r.queue).toEqual(EMPTY_QUEUE);
    expect(current(r.queue)).toBeNull();
    expect(position(r.queue)).toBeNull();
  });

  it('remaining lists the current file and everything after it', () => {
    const q = advance(enqueue(EMPTY_QUEUE, [f('a'), f('b'), f('c')]).queue).queue;
    expect(remaining(q).map((x) => x.name)).toEqual(['b', 'c']);
  });

  it('advance on an empty queue is a no-op', () => {
    expect(advance(EMPTY_QUEUE)).toEqual({ queue: EMPTY_QUEUE, finished: null });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `apps/mobile`): `npx jest src/features/share-intake/__tests__/shareIntakeQueue.test.ts`
Expected: FAIL — `Cannot find module '../shareIntakeQueue'`.

- [ ] **Step 3: Implement**

```ts
/**
 * Pure queue behind share-to-capture (spec 2026-09-26-share-to-capture-design).
 * `files` holds every file of the current run; `index` points at the file on the
 * confirm card. Files before `index` are done (saved or skipped) — they are kept
 * so `position` can say "2 of 5" without a second counter. A run that advances
 * past its last file collapses back to EMPTY_QUEUE, which starts the next run
 * from "1 of N".
 */
export interface SharedFile {
  uri: string;
  mimeType: string;
  name: string;
  size: number;
}

export interface ShareQueue {
  files: SharedFile[];
  index: number;
  total: number;
}

export const SHARE_QUEUE_MAX = 10;
export const EMPTY_QUEUE: ShareQueue = Object.freeze({ files: [], index: 0, total: 0 }) as ShareQueue;

export function isAcceptedMime(mime: string): boolean {
  return mime.startsWith('image/') || mime === 'application/pdf';
}

export function enqueue(
  q: ShareQueue,
  incoming: SharedFile[],
): { queue: ShareQueue; dropped: SharedFile[] } {
  const dropped: SharedFile[] = [];
  const accepted: SharedFile[] = [];
  for (const file of incoming) {
    if (!isAcceptedMime(file.mimeType) || q.total + accepted.length >= SHARE_QUEUE_MAX) {
      dropped.push(file);
    } else {
      accepted.push(file);
    }
  }
  if (accepted.length === 0) return { queue: q, dropped };
  const files = [...q.files, ...accepted];
  return { queue: { files, index: q.index, total: files.length }, dropped };
}

export function current(q: ShareQueue): SharedFile | null {
  return q.files[q.index] ?? null;
}

export function advance(q: ShareQueue): { queue: ShareQueue; finished: SharedFile | null } {
  const finished = current(q);
  if (!finished) return { queue: q, finished: null };
  const index = q.index + 1;
  if (index >= q.files.length) return { queue: EMPTY_QUEUE, finished };
  return { queue: { ...q, index }, finished };
}

export function remaining(q: ShareQueue): SharedFile[] {
  return q.files.slice(q.index);
}

export function position(q: ShareQueue): { n: number; of: number } | null {
  return current(q) ? { n: q.index + 1, of: q.total } : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/features/share-intake/__tests__/shareIntakeQueue.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/share-intake
git commit -m "Add pure share-intake queue"
```

---

### Task 2: Share-intake store

**Files:**
- Create: `apps/mobile/src/stores/shareIntakeStore.ts`
- Modify: `apps/mobile/src/stores/authSessionActions.ts` (the sign-out reset block around line 633)
- Test: `apps/mobile/src/features/share-intake/__tests__/shareIntakeStore.test.ts`

**Interfaces:**
- Consumes: Task 1 (`ShareQueue`, `SharedFile`, `enqueue`, `advance`, `remaining`, `EMPTY_QUEUE`).
- Produces:
  ```ts
  export const useShareIntakeStore: UseBoundStore<StoreApi<{
    queue: ShareQueue;
    /** Files dropped by the last add() (cap/MIME) — shown once, then cleared by the view. */
    lastDropped: number;
    /** Set when a queue arrives; the navigation hook consumes it. */
    pendingNavigation: boolean;
    add: (files: SharedFile[], nativeDropped: number) => void;
    next: () => SharedFile | null;        // advances; returns the finished file
    discardAll: () => SharedFile[];       // returns everything not yet processed
    consumeNavigation: () => void;
    clearDropped: () => void;
    /** True while `expense/receipt?source=share` is mounted (Task 7). */
    screenOpen: boolean;
    setScreenOpen: (open: boolean) => void;
    reset: () => void;
  }>>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { useShareIntakeStore } from '@/stores/shareIntakeStore';
import type { SharedFile } from '../shareIntakeQueue';

const f = (name: string, mimeType = 'image/jpeg'): SharedFile => ({ uri: `file:///c/${name}`, mimeType, name, size: 1 });

beforeEach(() => useShareIntakeStore.getState().reset());

describe('shareIntakeStore', () => {
  it('add queues files, flags navigation and counts native + queue drops', () => {
    useShareIntakeStore.getState().add([f('a'), f('t', 'text/plain')], 2);
    const s = useShareIntakeStore.getState();
    expect(s.queue.total).toBe(1);
    expect(s.pendingNavigation).toBe(true);
    expect(s.lastDropped).toBe(3);
  });

  it('add with nothing accepted does not flag navigation', () => {
    useShareIntakeStore.getState().add([f('t', 'text/plain')], 0);
    expect(useShareIntakeStore.getState().pendingNavigation).toBe(false);
  });

  it('next advances and returns the finished file', () => {
    useShareIntakeStore.getState().add([f('a'), f('b')], 0);
    expect(useShareIntakeStore.getState().next()?.name).toBe('a');
    expect(useShareIntakeStore.getState().queue.index).toBe(1);
  });

  it('discardAll returns unprocessed files and empties the queue', () => {
    useShareIntakeStore.getState().add([f('a'), f('b'), f('c')], 0);
    useShareIntakeStore.getState().next();
    expect(useShareIntakeStore.getState().discardAll().map((x) => x.name)).toEqual(['b', 'c']);
    expect(useShareIntakeStore.getState().queue.total).toBe(0);
  });

  it('reset clears everything', () => {
    useShareIntakeStore.getState().add([f('a')], 1);
    useShareIntakeStore.getState().reset();
    const s = useShareIntakeStore.getState();
    expect(s.queue.total).toBe(0);
    expect(s.pendingNavigation).toBe(false);
    expect(s.lastDropped).toBe(0);
    expect(s.screenOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/features/share-intake/__tests__/shareIntakeStore.test.ts`
Expected: FAIL — cannot find `@/stores/shareIntakeStore`.

- [ ] **Step 3: Implement**

```ts
import { create } from 'zustand';
import {
  EMPTY_QUEUE, enqueue, advance, remaining, type ShareQueue, type SharedFile,
} from '@/features/share-intake/shareIntakeQueue';

interface ShareIntakeState {
  queue: ShareQueue;
  lastDropped: number;
  pendingNavigation: boolean;
  add: (files: SharedFile[], nativeDropped: number) => void;
  next: () => SharedFile | null;
  discardAll: () => SharedFile[];
  consumeNavigation: () => void;
  clearDropped: () => void;
  screenOpen: boolean;
  setScreenOpen: (open: boolean) => void;
  reset: () => void;
}

/**
 * In-memory only, deliberately (spec: a queue lost to process death is re-shared,
 * persisting it is not worth the complexity). Reset on sign-out.
 */
export const useShareIntakeStore = create<ShareIntakeState>((set, get) => ({
  queue: EMPTY_QUEUE,
  lastDropped: 0,
  pendingNavigation: false,
  add: (files, nativeDropped) => {
    const { queue, dropped } = enqueue(get().queue, files);
    const accepted = queue !== get().queue;
    set((s) => ({
      queue,
      lastDropped: s.lastDropped + nativeDropped + dropped.length,
      pendingNavigation: s.pendingNavigation || accepted,
    }));
  },
  next: () => {
    const { queue, finished } = advance(get().queue);
    set({ queue });
    return finished;
  },
  discardAll: () => {
    const left = remaining(get().queue);
    set({ queue: EMPTY_QUEUE });
    return left;
  },
  consumeNavigation: () => set({ pendingNavigation: false }),
  clearDropped: () => set({ lastDropped: 0 }),
  screenOpen: false,
  setScreenOpen: (screenOpen) => set({ screenOpen }),
  reset: () => set({ queue: EMPTY_QUEUE, lastDropped: 0, pendingNavigation: false, screenOpen: false }),
}));
```

In `authSessionActions.ts`, add next to the other sign-out resets (after `useMerchantRulesStore.getState().reset();`):

```ts
    useShareIntakeStore.getState().reset();
```
and the import `import { useShareIntakeStore } from './shareIntakeStore';` with the others at the top.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/features/share-intake`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/stores/shareIntakeStore.ts apps/mobile/src/stores/authSessionActions.ts apps/mobile/src/features/share-intake/__tests__/shareIntakeStore.test.ts
git commit -m "Add share-intake store and reset it on sign-out"
```

---

### Task 3: Navigation gate + file-kind helpers

**Files:**
- Create: `apps/mobile/src/features/share-intake/shareIntakeGate.ts`
- Create: `apps/mobile/src/features/share-intake/sharedFileKind.ts`
- Test: `apps/mobile/src/features/share-intake/__tests__/shareIntakeGate.test.ts`, `.../sharedFileKind.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ShareGateDecision = 'wait' | 'navigate' | 'block_viewer' | 'idle';
  export function decideShareNavigation(i: {
    pendingNavigation: boolean; screenOpen: boolean; coldStartGateReady: boolean; firstRunSeen: boolean; canEdit: boolean;
  }): ShareGateDecision;
  export function sharedFileKind(mimeType: string, name: string): 'pdf' | 'image';
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// shareIntakeGate.test.ts
import { decideShareNavigation } from '../shareIntakeGate';

const base = { pendingNavigation: true, screenOpen: false, coldStartGateReady: true, firstRunSeen: true, canEdit: true };

describe('decideShareNavigation', () => {
  it('idle when nothing is pending', () => {
    expect(decideShareNavigation({ ...base, pendingNavigation: false })).toBe('idle');
  });
  it('idle while the share screen is already open (it consumes the flag itself)', () => {
    expect(decideShareNavigation({ ...base, screenOpen: true })).toBe('idle');
  });
  it('waits for the cold-start gate (signed out / initialising / fonts)', () => {
    expect(decideShareNavigation({ ...base, coldStartGateReady: false })).toBe('wait');
  });
  it('waits while first-run onboarding is still pending', () => {
    expect(decideShareNavigation({ ...base, firstRunSeen: false })).toBe('wait');
  });
  it('viewer → block', () => {
    expect(decideShareNavigation({ ...base, canEdit: false })).toBe('block_viewer');
  });
  it('navigates when everything is ready', () => {
    expect(decideShareNavigation(base)).toBe('navigate');
  });
});
```

```ts
// sharedFileKind.test.ts
import { sharedFileKind } from '../sharedFileKind';

describe('sharedFileKind', () => {
  it('pdf by MIME', () => expect(sharedFileKind('application/pdf', 'x')).toBe('pdf'));
  it('pdf by extension when MIME is generic', () => expect(sharedFileKind('application/octet-stream', 'Faktura.PDF')).toBe('pdf'));
  it('image otherwise', () => expect(sharedFileKind('image/png', 'shot.png')).toBe('image'));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/features/share-intake/__tests__/shareIntakeGate.test.ts src/features/share-intake/__tests__/sharedFileKind.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```ts
// shareIntakeGate.ts
export type ShareGateDecision = 'wait' | 'navigate' | 'block_viewer' | 'idle';

/**
 * When a shared queue may open the receipt screen. `coldStartGateReady` is the
 * same `useColdStartGate` value the notification/trip-invite flushes use —
 * navigating before it wedges expo-router on a black screen. `firstRunSeen`
 * keeps a brand-new user's onboarding from being covered. The viewer check comes
 * last so a viewer is told only once the app is actually ready to show it.
 */
export function decideShareNavigation(i: {
  pendingNavigation: boolean;
  screenOpen: boolean;
  coldStartGateReady: boolean;
  firstRunSeen: boolean;
  canEdit: boolean;
}): ShareGateDecision {
  if (!i.pendingNavigation || i.screenOpen) return 'idle';
  if (!i.coldStartGateReady || !i.firstRunSeen) return 'wait';
  if (!i.canEdit) return 'block_viewer';
  return 'navigate';
}
```

```ts
// sharedFileKind.ts
/** Some apps share a PDF as application/octet-stream; trust the extension then. */
export function sharedFileKind(mimeType: string, name: string): 'pdf' | 'image' {
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  return 'image';
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/features/share-intake`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/share-intake
git commit -m "Add share-intake navigation gate and file-kind helper"
```

---

### Task 4: Native Android intake module

**Files:**
- Create: `apps/mobile/android/app/src/main/java/com/budget/assistant/share/ShareIntakeModule.kt`
- Create: `apps/mobile/android/app/src/main/java/com/budget/assistant/share/ShareIntakePackage.kt`
- Modify: `apps/mobile/android/app/src/main/AndroidManifest.xml` (MainActivity `<activity>`)
- Modify: `apps/mobile/android/app/src/main/java/com/budget/assistant/MainActivity.kt`
- Modify: `apps/mobile/android/app/src/main/java/com/budget/assistant/MainApplication.kt:15-32`

**Interfaces:**
- Produces (JS-visible, `NativeModules.ShareIntakeModule`):
  - `getInitialShare(): Promise<{ files: Array<{uri,mimeType,name,size}>, droppedCount: number } | null>` — returns and clears the share held since launch.
  - `deleteFile(uri: string): Promise<boolean>`
  - `purgeStale(maxAgeMs: number): Promise<number>`
  - Device event `ShareIntakeReceived` with the same payload shape as `getInitialShare`.
  - Constants: `MAX_FILES = 10`, `MAX_PDF_BYTES = 10 * 1024 * 1024`, `MAX_IMAGE_BYTES = 25 * 1024 * 1024`.

- [ ] **Step 1: Add intent filters to MainActivity in `AndroidManifest.xml`** (after the existing `VIEW` filter, inside the same `<activity android:name=".MainActivity" …>`):

```xml
      <intent-filter>
        <action android:name="android.intent.action.SEND"/>
        <category android:name="android.intent.category.DEFAULT"/>
        <data android:mimeType="image/*"/>
        <data android:mimeType="application/pdf"/>
      </intent-filter>
      <intent-filter>
        <action android:name="android.intent.action.SEND_MULTIPLE"/>
        <category android:name="android.intent.category.DEFAULT"/>
        <data android:mimeType="image/*"/>
        <data android:mimeType="application/pdf"/>
      </intent-filter>
```

- [ ] **Step 2: Write `ShareIntakeModule.kt`**

```kotlin
package com.budget.assistant.share

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.util.concurrent.Executors

/**
 * Receives ACTION_SEND / ACTION_SEND_MULTIPLE (images + PDF) for share-to-capture.
 *
 * Legacy Old-Arch NativeModule on purpose — no TurboModule spec, no codegen
 * (Windows MAX_PATH constraint, same as InstallReferrerModule).
 *
 * The read grant on a foreign content:// URI is temporary, so every stream is
 * copied into cacheDir/shared-intake/ immediately and JS only ever sees file://
 * URIs. A share that arrives before JS is listening (cold start) is held in
 * [pending] until getInitialShare() consumes it; a warm share is emitted with
 * emitDeviceEvent (getJSModule().emit() is swallowed under New Architecture).
 * Nothing here throws into the Activity: a share that cannot be read is counted
 * as dropped.
 */
class ShareIntakeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ShareIntakeModule"

    init {
        instance = this
    }

    override fun invalidate() {
        if (instance === this) instance = null
        super.invalidate()
    }

    @ReactMethod
    fun getInitialShare(promise: Promise) {
        val held = synchronized(lock) { pending.also { pending = null } }
        promise.resolve(held)
    }

    @ReactMethod
    fun deleteFile(uri: String, promise: Promise) {
        try {
            val path = Uri.parse(uri).path
            val file = if (path != null) File(path) else null
            val dir = intakeDir(reactContext).canonicalPath
            // Only ever delete inside our own intake folder.
            val ok = file != null && file.canonicalPath.startsWith(dir) && file.delete()
            promise.resolve(ok)
        } catch (_: Throwable) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun purgeStale(maxAgeMs: Double, promise: Promise) {
        try {
            val cutoff = System.currentTimeMillis() - maxAgeMs.toLong()
            var removed = 0
            intakeDir(reactContext).listFiles()?.forEach {
                if (it.lastModified() < cutoff && it.delete()) removed++
            }
            promise.resolve(removed)
        } catch (_: Throwable) {
            promise.resolve(0)
        }
    }

    override fun getConstants(): MutableMap<String, Any> = mutableMapOf(
        "MAX_FILES" to MAX_FILES,
        "MAX_PDF_BYTES" to MAX_PDF_BYTES,
        "MAX_IMAGE_BYTES" to MAX_IMAGE_BYTES,
    )

    companion object {
        const val EVENT_NAME = "ShareIntakeReceived"
        const val MAX_FILES = 10
        const val MAX_PDF_BYTES = 10L * 1024 * 1024
        const val MAX_IMAGE_BYTES = 25L * 1024 * 1024

        private val lock = Any()
        private var pending: WritableMap? = null
        @Volatile private var instance: ShareIntakeModule? = null
        private val io = Executors.newSingleThreadExecutor()

        private fun intakeDir(activityOrContext: android.content.Context): File =
            File(activityOrContext.cacheDir, "shared-intake").apply { mkdirs() }

        /** Called by MainActivity from onCreate and onNewIntent. Never throws. */
        fun handleIntent(activity: Activity, intent: Intent?) {
            if (intent == null) return
            val action = intent.action
            if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
            val uris = extractUris(intent)
            // Consume the intent so a config change / recreate does not re-deliver it.
            intent.action = null
            if (uris.isEmpty()) return
            val appContext = activity.applicationContext
            io.execute {
                val payload = copyAll(appContext, uris, intent.type)
                deliver(payload)
            }
        }

        @Suppress("DEPRECATION")
        private fun extractUris(intent: Intent): List<Uri> = try {
            if (intent.action == Intent.ACTION_SEND) {
                val u: Uri? = if (Build.VERSION.SDK_INT >= 33)
                    intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else intent.getParcelableExtra(Intent.EXTRA_STREAM)
                listOfNotNull(u)
            } else {
                val list: ArrayList<Uri>? = if (Build.VERSION.SDK_INT >= 33)
                    intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
                list?.toList() ?: emptyList()
            }
        } catch (_: Throwable) {
            emptyList()
        }

        private fun copyAll(ctx: android.content.Context, uris: List<Uri>, intentType: String?): WritableMap {
            val files = Arguments.createArray()
            var dropped = 0
            uris.forEachIndexed { i, uri ->
                if (i >= MAX_FILES) { dropped++; return@forEachIndexed }
                try {
                    val resolver = ctx.contentResolver
                    val mime = resolver.getType(uri) ?: intentType ?: ""
                    val name = queryName(ctx, uri) ?: "shared-$i"
                    val isPdf = mime == "application/pdf" || name.endsWith(".pdf", ignoreCase = true)
                    if (!isPdf && !mime.startsWith("image/")) { dropped++; return@forEachIndexed }
                    val limit = if (isPdf) MAX_PDF_BYTES else MAX_IMAGE_BYTES
                    val ext = if (isPdf) "pdf" else (mime.substringAfter("image/", "jpg").ifBlank { "jpg" })
                    val out = File(intakeDir(ctx), "${System.currentTimeMillis()}-$i.$ext")
                    var size = 0L
                    var tooBig = false
                    resolver.openInputStream(uri)?.use { input ->
                        out.outputStream().use { output ->
                            val buf = ByteArray(64 * 1024)
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                size += n
                                if (size > limit) { tooBig = true; break }
                                output.write(buf, 0, n)
                            }
                        }
                    } ?: run { dropped++; return@forEachIndexed }
                    if (tooBig || size == 0L) { out.delete(); dropped++; return@forEachIndexed }
                    files.pushMap(Arguments.createMap().apply {
                        putString("uri", Uri.fromFile(out).toString())
                        putString("mimeType", if (isPdf) "application/pdf" else mime)
                        putString("name", name)
                        putDouble("size", size.toDouble())
                    })
                } catch (_: Throwable) {
                    dropped++
                }
            }
            return Arguments.createMap().apply {
                putArray("files", files)
                putInt("droppedCount", dropped)
            }
        }

        private fun queryName(ctx: android.content.Context, uri: Uri): String? = try {
            ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                if (it.moveToFirst()) it.getString(0) else null
            }
        } catch (_: Throwable) {
            null
        }

        private fun deliver(payload: WritableMap) {
            val module = instance
            val ctx = module?.reactContext
            if (ctx != null && ctx.hasActiveReactInstance()) {
                try {
                    ctx.emitDeviceEvent(EVENT_NAME, payload)
                    return
                } catch (_: Throwable) {
                    // Fall through and hold it for getInitialShare().
                }
            }
            synchronized(lock) { pending = payload }
        }
    }
}
```

> Known race, accepted: on a warm start where JS already consumed `getInitialShare()` but the React instance is momentarily inactive, the payload is held in `pending` until the next launch's `getInitialShare()` or the next warm event. `useShareIntake` also calls `getInitialShare()` on every `AppState` → `active`, which closes it.

- [ ] **Step 3: Write `ShareIntakePackage.kt`**

```kotlin
package com.budget.assistant.share

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * ReactPackage that exposes ShareIntakeModule to the JS bridge.
 * Registered manually in MainApplication.kt:getPackages() — no autolink,
 * no TurboModule spec, no codegen (CLAUDE.md build constraint).
 */
class ShareIntakePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(ShareIntakeModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
```

- [ ] **Step 4: Register and hand intents over**

`MainApplication.kt` — add the import beside the others and the `add(...)`:

```kotlin
import com.budget.assistant.share.ShareIntakePackage
```
```kotlin
              add(InstallReferrerPackage())
              add(ShareIntakePackage())
```

`MainActivity.kt` — add imports `import android.content.Intent` and `import com.budget.assistant.share.ShareIntakeModule`; after `super.onCreate(null)` (do not change that line):

```kotlin
    super.onCreate(null)
    ShareIntakeModule.handleIntent(this, intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    ShareIntakeModule.handleIntent(this, intent)
  }
```

- [ ] **Step 5: Build to verify it compiles**

Run (from `apps/mobile/android`): `./gradlew :app:compileDebugKotlin`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/android/app/src/main/AndroidManifest.xml apps/mobile/android/app/src/main/java/com/budget/assistant/share apps/mobile/android/app/src/main/java/com/budget/assistant/MainActivity.kt apps/mobile/android/app/src/main/java/com/budget/assistant/MainApplication.kt
git commit -m "Add Android share-intake native module"
```

---

### Task 5: JS bridge (Android real, no-op elsewhere)

**Files:**
- Create: `apps/mobile/src/services/shareIntake/index.ts`, `index.android.ts`, `index.ios.ts`, `index.web.ts`

**Interfaces:**
- Consumes: Task 4 native surface; Task 1 `SharedFile`.
- Produces:
  ```ts
  export interface SharePayload { files: SharedFile[]; droppedCount: number }
  export function getInitialShare(): Promise<SharePayload | null>;
  export function subscribeToShares(cb: (p: SharePayload) => void): () => void;
  export function deleteSharedFile(uri: string): Promise<void>;
  export function purgeStaleSharedFiles(maxAgeMs: number): Promise<void>;
  ```

- [ ] **Step 1: Write the no-op (`index.ios.ts`), mirroring `notificationCapture/index.ios.ts`**

```ts
/** No-op: share-to-capture is Android-only (spec). Same surface as index.android.ts. */
import type { SharedFile } from '@/features/share-intake/shareIntakeQueue';

export interface SharePayload {
  files: SharedFile[];
  droppedCount: number;
}

export async function getInitialShare(): Promise<SharePayload | null> {
  return null;
}
export function subscribeToShares(_cb: (p: SharePayload) => void): () => void {
  return () => {};
}
export async function deleteSharedFile(_uri: string): Promise<void> {}
export async function purgeStaleSharedFiles(_maxAgeMs: number): Promise<void> {}
```

`index.web.ts`: `export * from './index.ios';`

`index.ts` (tsc resolution base, same convention as `notificationCapture/index.ts`):

```ts
/**
 * Base resolution for `@/services/shareIntake`. Metro picks `index.android.ts`
 * (real) or `index.ios.ts` / `index.web.ts` (no-ops); tsc needs this file and
 * gets the no-op surface, identical in type to every variant.
 */
export * from './index.ios';
```

- [ ] **Step 2: Write `index.android.ts`**

```ts
import { NativeModules, DeviceEventEmitter } from 'react-native';
import type { SharedFile } from '@/features/share-intake/shareIntakeQueue';

export interface SharePayload {
  files: SharedFile[];
  droppedCount: number;
}

const { ShareIntakeModule } = NativeModules;

if (!ShareIntakeModule && __DEV__) {
  console.warn(
    '[ShareIntake] NativeModule "ShareIntakeModule" not found. Ensure ShareIntakePackage is ' +
      'registered in MainApplication.kt and the app was rebuilt (not just Metro-restarted).',
  );
}

function normalise(raw: unknown): SharePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { files?: unknown; droppedCount?: unknown };
  const files = Array.isArray(r.files)
    ? r.files.filter(
        (f): f is SharedFile =>
          !!f && typeof f.uri === 'string' && typeof f.mimeType === 'string' && typeof f.name === 'string',
      )
    : [];
  const droppedCount = typeof r.droppedCount === 'number' ? r.droppedCount : 0;
  if (files.length === 0 && droppedCount === 0) return null;
  return { files, droppedCount };
}

export async function getInitialShare(): Promise<SharePayload | null> {
  if (!ShareIntakeModule) return null;
  try {
    return normalise(await ShareIntakeModule.getInitialShare());
  } catch (e) {
    console.warn('[ShareIntake] getInitialShare failed:', e);
    return null;
  }
}

export function subscribeToShares(cb: (p: SharePayload) => void): () => void {
  const sub = DeviceEventEmitter.addListener('ShareIntakeReceived', (raw) => {
    const p = normalise(raw);
    if (p) cb(p);
  });
  return () => sub.remove();
}

export async function deleteSharedFile(uri: string): Promise<void> {
  if (!ShareIntakeModule) return;
  try {
    await ShareIntakeModule.deleteFile(uri);
  } catch (e) {
    console.warn('[ShareIntake] deleteFile failed:', e);
  }
}

export async function purgeStaleSharedFiles(maxAgeMs: number): Promise<void> {
  if (!ShareIntakeModule) return;
  try {
    await ShareIntakeModule.purgeStale(maxAgeMs);
  } catch (e) {
    console.warn('[ShareIntake] purgeStale failed:', e);
  }
}
```

- [ ] **Step 3: Typecheck**

Run (from `apps/mobile`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/shareIntake
git commit -m "Add share-intake JS bridge with non-Android no-ops"
```

---

### Task 6: `useShareIntake` hook in the root layout

**Files:**
- Create: `apps/mobile/src/hooks/useShareIntake.ts`
- Modify: `apps/mobile/app/_layout.tsx:57-61` (hook list)
- Test: `apps/mobile/src/hooks/__tests__/useShareIntake.test.ts`

**Interfaces:**
- Consumes: Task 2 store, Task 3 `decideShareNavigation`, Task 5 bridge, `useColdStartGate` value, `useFirstRunStore((s) => s.seen)`, `useAccountStore((s) => s.canEdit())`.
- Produces: `export function useShareIntake(coldStartGateReady: boolean): void` and, for testing, `export async function ingestInitialShare(): Promise<void>` (reads `getInitialShare()` → `store.add`).

- [ ] **Step 1: Write the failing test**

```ts
jest.mock('@/services/shareIntake', () => ({
  getInitialShare: jest.fn(),
  subscribeToShares: jest.fn(() => () => {}),
  purgeStaleSharedFiles: jest.fn(),
  deleteSharedFile: jest.fn(),
}));

import { getInitialShare } from '@/services/shareIntake';
import { ingestInitialShare } from '@/hooks/useShareIntake';
import { useShareIntakeStore } from '@/stores/shareIntakeStore';

beforeEach(() => useShareIntakeStore.getState().reset());

describe('ingestInitialShare', () => {
  it('empty initial share does not navigate', async () => {
    (getInitialShare as jest.Mock).mockResolvedValue(null);
    await ingestInitialShare();
    expect(useShareIntakeStore.getState().pendingNavigation).toBe(false);
  });

  it('queues files from the initial share', async () => {
    (getInitialShare as jest.Mock).mockResolvedValue({
      files: [{ uri: 'file:///c/a.jpg', mimeType: 'image/jpeg', name: 'a.jpg', size: 10 }],
      droppedCount: 1,
    });
    await ingestInitialShare();
    const s = useShareIntakeStore.getState();
    expect(s.queue.total).toBe(1);
    expect(s.lastDropped).toBe(1);
    expect(s.pendingNavigation).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/hooks/__tests__/useShareIntake.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import i18n from '@/i18n';
import { showAlert } from '@/utils/alert';
import {
  getInitialShare, subscribeToShares, purgeStaleSharedFiles, deleteSharedFile,
} from '@/services/shareIntake';
import { useShareIntakeStore } from '@/stores/shareIntakeStore';
import { useFirstRunStore } from '@/stores/firstRunStore';
import { useAccountStore } from '@/stores/accountStore';
import { decideShareNavigation } from '@/features/share-intake/shareIntakeGate';

const STALE_MS = 24 * 60 * 60 * 1000;

export async function ingestInitialShare(): Promise<void> {
  const payload = await getInitialShare();
  if (payload) useShareIntakeStore.getState().add(payload.files, payload.droppedCount);
}

/**
 * Share-to-capture entry (spec 2026-09-26). One of RootNavigator's cross-cutting
 * hooks (ABA-354). Captures the cold-start share and warm shares, and opens the
 * receipt screen only through `decideShareNavigation` — gated on the same
 * `coldStartGateReady` as the notification and trip-invite flushes.
 */
export function useShareIntake(coldStartGateReady: boolean): void {
  const pendingNavigation = useShareIntakeStore((s) => s.pendingNavigation);
  const screenOpen = useShareIntakeStore((s) => s.screenOpen);
  const firstRunSeen = useFirstRunStore((s) => s.seen);
  const canEdit = useAccountStore((s) => s.canEdit());

  useEffect(() => {
    void purgeStaleSharedFiles(STALE_MS);
    void ingestInitialShare();
    const unsubscribe = subscribeToShares((p) => useShareIntakeStore.getState().add(p.files, p.droppedCount));
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') void ingestInitialShare();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    const decision = decideShareNavigation({ pendingNavigation, screenOpen, coldStartGateReady, firstRunSeen, canEdit });
    if (decision === 'navigate') {
      useShareIntakeStore.getState().consumeNavigation();
      router.push({ pathname: '/expense/receipt', params: { source: 'share' } });
    } else if (decision === 'block_viewer') {
      const left = useShareIntakeStore.getState().discardAll();
      useShareIntakeStore.getState().consumeNavigation();
      left.forEach((f) => void deleteSharedFile(f.uri));
      showAlert(i18n.t('shareIntake.viewerBlockedTitle'), i18n.t('shareIntake.viewerBlockedBody'));
    }
  }, [pendingNavigation, screenOpen, coldStartGateReady, firstRunSeen, canEdit]);
}
```

> Why `screenOpen`: the receipt screen and this hook both react to `pendingNavigation`, and effect order between them is not guaranteed. The view sets `screenOpen` on mount/unmount (Task 7), and `decideShareNavigation` returns `'idle'` while it is true, so a warm share onto an open queue can never push a second route — without a `usePathname()` subscription in RootNavigator (forbidden: it re-renders 95 screens per navigation).

`app/_layout.tsx` — add the import and the call beside the other deep-link hooks:

```tsx
import { useShareIntake } from '@/hooks/useShareIntake';
```
```tsx
  useTripInviteDeepLink(coldStartGateReady, t);
  useShareIntake(coldStartGateReady);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/hooks/__tests__/useShareIntake.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/useShareIntake.ts apps/mobile/src/hooks/__tests__/useShareIntake.test.ts apps/mobile/app/_layout.tsx
git commit -m "Open the receipt screen for shared files once the app is ready"
```

---

### Task 7: Share mode on the receipt screen

**Files:**
- Modify: `apps/mobile/src/features/receipt/useReceiptScanner.ts` (add `errorStatus`, `processSharedFile`)
- Modify: `apps/mobile/src/hooks/useReceiptSave.ts` (optional `queue` param changes the success alert)
- Modify: `apps/mobile/src/components/receipt/ReceiptExpenseView.tsx` (share mode)
- Modify: `apps/mobile/app/expense/receipt.tsx` (read `source`, header progress, close confirm)
- Modify: 9 locale files `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`

**Interfaces:**
- Consumes: Tasks 1–3, 5.
- Produces:
  - `useReceiptScanner(...)` also returns `errorStatus: number | null` and `processSharedFile(uri: string, mimeType: string, name: string, size: number): Promise<ScannedReceipt | null>`.
  - `ReceiptExpenseViewProps.shareMode?: boolean`.
  - `useReceiptSave` param `queue?: { hasNext: boolean; onNext: () => void }`.

- [ ] **Step 1: Scanner — `errorStatus` + `processSharedFile`**

In `ReceiptScannerState` add `errorStatus: number | null;` and initialise it to `null` in every `setState({...})` literal (initial state, `reset`, and the duplicate-decline reset). In each `catch` that sets `error`, also set `errorStatus: (error as { status?: number }).status ?? null`.

Extract the PDF body of `pickPdfDocument` (from the size check through the final `return scannedReceipt`) into:

```ts
  const processPdf = async (uri: string, size: number | undefined, userPrompt?: string) => {
    if (size && size > MAX_PDF_SIZE) {
      setState((s) => ({ ...s, error: i18n.t('errors.pdfTooLarge'), errorStatus: null }));
      return null;
    }
    try {
      setState((s) => ({
        ...s, isProcessing: true, error: null, errorStatus: null, imageUri: null, isPdf: true, scannedReceipt: null,
      }));
      const base64 = await uriToBase64(uri);
      if (!(await passesDuplicateCheck(base64))) return null;
      const scannedReceipt = await api.scanReceipt(base64, userPrompt || undefined, 'application/pdf');
      setState((s) => ({ ...s, isProcessing: false, scannedReceipt }));
      return scannedReceipt;
    } catch (error) {
      console.error('[ReceiptScanner] Failed to process PDF:', error);
      setState((s) => ({
        ...s,
        isProcessing: false,
        isPdf: false,
        error: error instanceof Error ? error.message : i18n.t('errors.processReceiptFailed'),
        errorStatus: (error as { status?: number }).status ?? null,
      }));
      return null;
    }
  };
```

`pickPdfDocument` then calls `return processPdf(asset.uri, asset.size, userPrompt);` inside its existing `try/finally` (keeping `pickingRef`). Add:

```ts
  /** Share-to-capture entry: a file:// copy made by ShareIntakeModule. */
  const processSharedFile = useCallback(
    async (uri: string, mimeType: string, name: string, size: number): Promise<ScannedReceipt | null> =>
      sharedFileKind(mimeType, name) === 'pdf' ? processPdf(uri, size) : processImage(uri),
    [],
  );
```
with `import { sharedFileKind } from '@/features/share-intake/sharedFileKind';`, and return `processSharedFile` and `errorStatus` from the hook.

Run: `npx jest src/features/receipt` — Expected: PASS (existing tests unchanged).

- [ ] **Step 2: `useReceiptSave` — queue-aware success alert**

Add to `UseReceiptSaveParams`:

```ts
  /**
   * Share-to-capture queue. When present, the success alert offers "Next" (if
   * more files wait) or "Done" instead of "Scan another" — a shared file has no
   * camera to go back to.
   */
  queue?: { hasNext: boolean; onNext: () => void };
```

Replace the two `showAlert(...)` success branches with one builder:

```ts
      const session = onSaved?.();
      const title = session?.isCheckpoint ? t('receipt.sessionCapTitle') : t('common.success');
      const body = (session?.isCheckpoint
        ? t('receipt.sessionCapBody', { count: session.count })
        : t('receipt.success')) + checkedLine;
      const actions = queue
        ? queue.hasNext
          ? [{ text: t('shareIntake.next'), onPress: queue.onNext }]
          : [{ text: t('common.done'), onPress: finish }]
        : [
            { text: t('receipt.scanAnother'), style: 'cancel' as const, onPress: onReset },
            { text: t('common.done'), onPress: finish },
          ];
      showAlert(title, body, [...undoButton, ...actions]);
```

(`undoButton`'s own `onPress` calls `finish()`; in queue mode with more files it must advance instead — change its `onPress` to `queue?.hasNext ? queue.onNext : finish` after the undo call.)

Run: `npx jest src/hooks` — Expected: PASS.

- [ ] **Step 3: `ReceiptExpenseView` — share mode**

Add prop `shareMode?: boolean` (doc: "The route passes it for `?source=share`; the view scans the share queue's head instead of offering capture buttons."). Inside the component:

```tsx
  const queue = useShareIntakeStore((s) => s.queue);
  const pendingNavigation = useShareIntakeStore((s) => s.pendingNavigation);
  const lastDropped = useShareIntakeStore((s) => s.lastDropped);
  const head = shareMode ? current(queue) : null;
  const scannedUriRef = useRef<string | null>(null);

  // While open, the root hook stays idle (decideShareNavigation) and this view
  // consumes warm shares itself — they append, never stack a second route.
  useEffect(() => {
    if (!shareMode) return;
    useShareIntakeStore.getState().setScreenOpen(true);
    return () => useShareIntakeStore.getState().setScreenOpen(false);
  }, [shareMode]);

  useEffect(() => {
    if (shareMode && pendingNavigation) useShareIntakeStore.getState().consumeNavigation();
  }, [shareMode, pendingNavigation]);

  useEffect(() => {
    if (!shareMode || lastDropped === 0) return;
    showAlert(t('shareIntake.droppedTitle'), t('shareIntake.droppedBody', { count: lastDropped }));
    useShareIntakeStore.getState().clearDropped();
  }, [shareMode, lastDropped, t]);

  const advanceQueue = () => {
    const finished = useShareIntakeStore.getState().next();
    if (finished) void deleteSharedFile(finished.uri);
    handleReset();
    if (!current(useShareIntakeStore.getState().queue)) onDone();
  };

  // Set when the user declines the ABA-603 duplicate prompt, so a `null` scan
  // result can be told apart from a failed scan (which sets `error` instead).
  const declinedRef = useRef(false);

  // Scan the head whenever it changes (first file, or after advancing).
  useEffect(() => {
    if (!head || scannedUriRef.current === head.uri) return;
    scannedUriRef.current = head.uri;
    declinedRef.current = false;
    void processSharedFile(head.uri, head.mimeType, head.name, head.size).then((r) => {
      if (r === null && declinedRef.current) advanceQueue();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head?.uri]);
```

In `confirmDuplicateScan`, set `declinedRef.current = true;` immediately before each of the three `resolve(false)` calls (Cancel, Open, and `onDismiss`). The "Open" path also navigates to the saved expense; in share mode it must first discard the rest of the queue so the user is not returned to a half-finished run:

```tsx
            onPress: () => {
              declinedRef.current = true;
              resolve(false);
              if (shareMode) {
                useShareIntakeStore.getState().discardAll().forEach((f) => void deleteSharedFile(f.uri));
              }
              openExpense(match.expenseId);
            },
```

(`declinedRef` must be declared above `confirmDuplicateScan`, i.e. near the top of the component.)

Replace the error effect's body in share mode:

```tsx
  useEffect(() => {
    if (!error) return;
    trackAction('expense_receipt', 'failed');
    if (!shareMode) {
      showAlert(t('common.error'), error, [{ text: 'OK', onPress: reset }]);
      return;
    }
    if (errorStatus === 403) {
      const left = useShareIntakeStore.getState().discardAll();
      left.forEach((f) => void deleteSharedFile(f.uri));
      useUpgradeStore.getState().show(t('subscription.limitReachedBody'), 'pro');
      showAlert(t('shareIntake.limitStoppedTitle'), t('shareIntake.limitStoppedBody', { count: left.length }), [
        { text: 'OK', onPress: onDone },
      ]);
      return;
    }
    showAlert(t('common.error'), error, [
      { text: t('shareIntake.skip'), onPress: advanceQueue },
      {
        text: t('shareIntake.enterManually'),
        onPress: () => {
          advanceQueue();
          router.push('/expense/new');
        },
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
```

Pass `queue` into `useReceiptSave` only in share mode:

```tsx
    queue: shareMode
      ? { hasNext: remaining(useShareIntakeStore.getState().queue).length > 1, onNext: advanceQueue }
      : undefined,
```

and when `shareMode`, render the processing state (`ReceiptCaptureView` with `isProcessing`) but pass no-op capture handlers is NOT enough — hide the buttons: add prop `hideCaptureButtons?: boolean` to `ReceiptCaptureView` and wrap its camera/gallery/PDF buttons in `{!hideCaptureButtons && …}`; pass `hideCaptureButtons={shareMode}`.

Imports to add: `useShareIntakeStore`, `current`, `remaining` from the queue module, `deleteSharedFile` from `@/services/shareIntake`, `useUpgradeStore`.

- [ ] **Step 4: Route — header progress and close confirm**

`app/expense/receipt.tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { useShareIntakeStore } from '@/stores/shareIntakeStore';
import { position, remaining } from '@/features/share-intake/shareIntakeQueue';
import { deleteSharedFile } from '@/services/shareIntake';
import { showAlert } from '@/utils/alert';
```
```tsx
  const { source } = useLocalSearchParams<{ source?: string }>();
  const shareMode = source === 'share';
  const pos = useShareIntakeStore((s) => position(s.queue));

  const close = () => {
    const left = remaining(useShareIntakeStore.getState().queue);
    if (!shareMode || left.length <= 1) {
      if (shareMode) useShareIntakeStore.getState().discardAll().forEach((f) => void deleteSharedFile(f.uri));
      router.back();
      return;
    }
    showAlert(t('shareIntake.discardTitle'), t('shareIntake.discardBody', { count: left.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('shareIntake.discard'),
        style: 'destructive',
        onPress: () => {
          useShareIntakeStore.getState().discardAll().forEach((f) => void deleteSharedFile(f.uri));
          router.back();
        },
      },
    ]);
  };
```

Close button `onPress={close}`; title `{shareMode && pos ? t('shareIntake.progress', { n: pos.n, of: pos.of }) : t('receipt.title')}`; `<ReceiptExpenseView onDone={() => router.back()} shareMode={shareMode} />`.

- [ ] **Step 5: i18n — add `shareIntake` to all 9 locales**

Use the `i18n-add-strings` skill. `en.ts` (new top-level object beside `receipt`):

```ts
  shareIntake: {
    progress: 'Receipt {{n}} of {{of}}',
    next: 'Next',
    skip: 'Skip',
    enterManually: 'Enter manually',
    discard: 'Discard',
    discardTitle: 'Stop here?',
    discardBody: '{{count}} shared files are not added yet. Discard them?',
    droppedTitle: 'Some files were skipped',
    droppedBody: '{{count}} files could not be added — only images and PDFs up to 10 files at a time (PDF up to 10 MB).',
    limitStoppedTitle: 'AI limit reached',
    limitStoppedBody: '{{count}} files were left unprocessed. Share them again later.',
    viewerBlockedTitle: 'Can\'t add expenses here',
    viewerBlockedBody: 'You can only view this account. Switch to another account and share again.',
  },
```

`pl.ts`:

```ts
  shareIntake: {
    progress: 'Paragon {{n}} z {{of}}',
    next: 'Dalej',
    skip: 'Pomiń',
    enterManually: 'Wpisz ręcznie',
    discard: 'Odrzuć',
    discardTitle: 'Zakończyć?',
    discardBody: 'Nie dodano jeszcze {{count}} udostępnionych plików. Odrzucić je?',
    droppedTitle: 'Część plików pominięto',
    droppedBody: 'Nie udało się dodać {{count}} plików — tylko zdjęcia i PDF, maks. 10 naraz (PDF do 10 MB).',
    limitStoppedTitle: 'Limit AI wyczerpany',
    limitStoppedBody: 'Nieprzetworzonych plików: {{count}}. Udostępnij je ponownie później.',
    viewerBlockedTitle: 'Nie można tu dodawać wydatków',
    viewerBlockedBody: 'W tym koncie możesz tylko przeglądać. Przełącz konto i udostępnij ponownie.',
  },
```

`ru.ts`:

```ts
  shareIntake: {
    progress: 'Чек {{n}} из {{of}}',
    next: 'Дальше',
    skip: 'Пропустить',
    enterManually: 'Ввести вручную',
    discard: 'Отменить',
    discardTitle: 'Остановиться?',
    discardBody: 'Ещё {{count}} файлов не добавлено. Отменить их?',
    droppedTitle: 'Часть файлов пропущена',
    droppedBody: 'Не удалось добавить файлов: {{count}} — только фото и PDF, не больше 10 за раз (PDF до 10 МБ).',
    limitStoppedTitle: 'Лимит AI исчерпан',
    limitStoppedBody: 'Не обработано файлов: {{count}}. Поделитесь ими позже ещё раз.',
    viewerBlockedTitle: 'Здесь нельзя добавлять расходы',
    viewerBlockedBody: 'В этом аккаунте у вас только просмотр. Переключите аккаунт и поделитесь снова.',
  },
```

`ua.ts`:

```ts
  shareIntake: {
    progress: 'Чек {{n}} з {{of}}',
    next: 'Далі',
    skip: 'Пропустити',
    enterManually: 'Ввести вручну',
    discard: 'Скасувати',
    discardTitle: 'Зупинитися?',
    discardBody: 'Ще {{count}} файлів не додано. Скасувати їх?',
    droppedTitle: 'Частину файлів пропущено',
    droppedBody: 'Не вдалося додати файлів: {{count}} — лише фото та PDF, не більше 10 за раз (PDF до 10 МБ).',
    limitStoppedTitle: 'Ліміт AI вичерпано',
    limitStoppedBody: 'Не оброблено файлів: {{count}}. Поділіться ними пізніше ще раз.',
    viewerBlockedTitle: 'Тут не можна додавати витрати',
    viewerBlockedBody: 'У цьому акаунті у вас лише перегляд. Перемкніть акаунт і поділіться знову.',
  },
```

`be.ts`:

```ts
  shareIntake: {
    progress: 'Чэк {{n}} з {{of}}',
    next: 'Далей',
    skip: 'Прапусціць',
    enterManually: 'Увесці ўручную',
    discard: 'Адмяніць',
    discardTitle: 'Спыніцца?',
    discardBody: 'Яшчэ {{count}} файлаў не дададзена. Адмяніць іх?',
    droppedTitle: 'Частку файлаў прапушчана',
    droppedBody: 'Не ўдалося дадаць файлаў: {{count}} — толькі фота і PDF, не больш за 10 за раз (PDF да 10 МБ).',
    limitStoppedTitle: 'Ліміт AI вычарпаны',
    limitStoppedBody: 'Не апрацавана файлаў: {{count}}. Падзяліцеся імі пазней яшчэ раз.',
    viewerBlockedTitle: 'Тут нельга дадаваць выдаткі',
    viewerBlockedBody: 'У гэтым акаўнце ў вас толькі прагляд. Пераключыце акаўнт і падзяліцеся зноў.',
  },
```

`de.ts`:

```ts
  shareIntake: {
    progress: 'Beleg {{n}} von {{of}}',
    next: 'Weiter',
    skip: 'Überspringen',
    enterManually: 'Manuell eingeben',
    discard: 'Verwerfen',
    discardTitle: 'Hier aufhören?',
    discardBody: '{{count}} geteilte Dateien sind noch nicht hinzugefügt. Verwerfen?',
    droppedTitle: 'Einige Dateien wurden übersprungen',
    droppedBody: '{{count}} Dateien konnten nicht hinzugefügt werden – nur Bilder und PDFs, höchstens 10 auf einmal (PDF bis 10 MB).',
    limitStoppedTitle: 'KI-Limit erreicht',
    limitStoppedBody: '{{count}} Dateien wurden nicht verarbeitet. Teile sie später erneut.',
    viewerBlockedTitle: 'Hier kannst du keine Ausgaben hinzufügen',
    viewerBlockedBody: 'Dieses Konto kannst du nur ansehen. Wechsle das Konto und teile erneut.',
  },
```

`es.ts`:

```ts
  shareIntake: {
    progress: 'Recibo {{n}} de {{of}}',
    next: 'Siguiente',
    skip: 'Omitir',
    enterManually: 'Introducir a mano',
    discard: 'Descartar',
    discardTitle: '¿Parar aquí?',
    discardBody: 'Aún no se han añadido {{count}} archivos compartidos. ¿Descartarlos?',
    droppedTitle: 'Se omitieron algunos archivos',
    droppedBody: 'No se pudieron añadir {{count}} archivos: solo imágenes y PDF, hasta 10 a la vez (PDF hasta 10 MB).',
    limitStoppedTitle: 'Límite de IA alcanzado',
    limitStoppedBody: 'Quedaron {{count}} archivos sin procesar. Compártelos de nuevo más tarde.',
    viewerBlockedTitle: 'No puedes añadir gastos aquí',
    viewerBlockedBody: 'En esta cuenta solo puedes ver. Cambia de cuenta y vuelve a compartir.',
  },
```

`fr.ts`:

```ts
  shareIntake: {
    progress: 'Ticket {{n}} sur {{of}}',
    next: 'Suivant',
    skip: 'Passer',
    enterManually: 'Saisir à la main',
    discard: 'Abandonner',
    discardTitle: 'Arrêter ici ?',
    discardBody: '{{count}} fichiers partagés ne sont pas encore ajoutés. Les abandonner ?',
    droppedTitle: 'Certains fichiers ont été ignorés',
    droppedBody: '{{count}} fichiers n’ont pas pu être ajoutés : images et PDF uniquement, 10 maximum à la fois (PDF jusqu’à 10 Mo).',
    limitStoppedTitle: 'Limite d’IA atteinte',
    limitStoppedBody: '{{count}} fichiers n’ont pas été traités. Partagez-les à nouveau plus tard.',
    viewerBlockedTitle: 'Impossible d’ajouter des dépenses ici',
    viewerBlockedBody: 'Vous ne pouvez que consulter ce compte. Changez de compte et partagez à nouveau.',
  },
```

`nl.ts`:

```ts
  shareIntake: {
    progress: 'Bon {{n}} van {{of}}',
    next: 'Volgende',
    skip: 'Overslaan',
    enterManually: 'Handmatig invoeren',
    discard: 'Weggooien',
    discardTitle: 'Hier stoppen?',
    discardBody: '{{count}} gedeelde bestanden zijn nog niet toegevoegd. Weggooien?',
    droppedTitle: 'Sommige bestanden zijn overgeslagen',
    droppedBody: '{{count}} bestanden konden niet worden toegevoegd – alleen afbeeldingen en pdf’s, maximaal 10 tegelijk (pdf tot 10 MB).',
    limitStoppedTitle: 'AI-limiet bereikt',
    limitStoppedBody: '{{count}} bestanden zijn niet verwerkt. Deel ze later opnieuw.',
    viewerBlockedTitle: 'Je kunt hier geen uitgaven toevoegen',
    viewerBlockedBody: 'Dit account kun je alleen bekijken. Wissel van account en deel opnieuw.',
  },
```

- [ ] **Step 6: Verify**

Run (from `apps/mobile`): `npx tsc --noEmit && npx jest && npm run lint`
Expected: no type errors, all tests PASS, lint clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/receipt/useReceiptScanner.ts apps/mobile/src/hooks/useReceiptSave.ts apps/mobile/src/components/receipt apps/mobile/app/expense/receipt.tsx apps/mobile/src/i18n/locales
git commit -m "Scan shared files one by one on the receipt screen"
```

---

### Task 8: On-device verification

**Files:** none (manual). Build a debug APK: from `apps/mobile`, `npx expo run:android` on a connected device.

- [ ] **Step 1: Run the checklist, recording each result**

1. Gallery → select 1 screenshot → Share → AI Budget → confirm card pre-filled → Save → returns.
2. Gallery → select 5 → Share → header "Receipt 1 of 5" … "5 of 5"; "Next" on 1–4, "Done" on 5.
3. Gmail → a PDF attachment → Share → scanned as PDF.
4. App running (warm) vs force-stopped (cold) — both open the queue; cold only after splash/fonts.
5. Share 12 files → 10 queued, "2 files could not be added" shown once.
6. While on file 2 of 5, share 1 more from another app → header becomes "2 of 6", card unchanged.
7. Share a receipt already saved → duplicate prompt → Cancel → next file scans.
8. Airplane mode → error → Skip continues; Enter manually opens the new-expense form.
9. ✕ on file 2 of 5 → "Stop here? 4 …" → Discard → back; `adb shell run-as com.budget.assistant ls cache/shared-intake` is empty.
10. Share while signed out → sign in → queue opens after sign-in.
11. Switch to an account where you are a viewer → share → "Can't add expenses here", no screen.
12. Share 3, force-stop on file 2, relaunch from the launcher → no receipt screen; files older than 24 h are purged on a later launch.

- [ ] **Step 2: Fix anything that failed, re-run the failing items, commit fixes**

```bash
git commit -am "Fix share-to-capture issues found on device"
```

---

### Task 9: Docs and wrap-up

**Files:**
- Modify: the receipt-scanning section in `user_docs/<lang>/` for all 9 languages (find it with `grep -l "receipt" user_docs/en/*.md`), then `npm run generate:help` from the repo root.
- Create: `docs/wiki/features/share-to-capture.md`; modify `docs/wiki/log.md` and the mobile hub page that lists receipt features.

- [ ] **Step 1: User docs** — add a "Share from another app" subsection in each of the 9 languages: open any app → Share → AI Budget; images and PDFs; up to 10 at a time; each becomes its own card; Android only. Run `npm run generate:help`; do NOT edit `apps/mobile/src/help/content.ts` by hand. If the public help site is regenerated, use `LANDING_BASE= ROBOTS="index,follow,max-image-preview:large"`.

- [ ] **Step 2: Wiki page** — sections *What this is / Entry points / Key concepts / Invariants / Known gaps / History*. Invariants to state: copies are made natively because the content:// grant is temporary; navigation only through `decideShareNavigation` + cold-start gate; queue is in-memory by design; `emitDeviceEvent` only; Android-only and why (no iOS share target for PWAs, no service worker on web). Known gaps: manual entry after a failed scan has no attachment; queue lost on process death. Add one line to `docs/wiki/log.md`.

- [ ] **Step 3: Run the wiki linter**

Run (repo root): `python scripts/wiki-lint.py`
Expected: no new errors.

- [ ] **Step 4: Commit, then run `finish-aba-task`**

```bash
git add user_docs apps/mobile/src/help/content.ts docs/wiki
git commit -m "Document share-to-capture"
```
Then invoke the `finish-aba-task` skill (creates the ABA-{N} issue, title without a colon). Do NOT push without explicit approval.
