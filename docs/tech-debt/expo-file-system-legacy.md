---
id: expo-file-system-legacy
title: Two files import from deprecated expo-file-system/legacy path
status: open
priority: P1
module: apps/mobile
created_at: 2026-05-11
---

# Two files import from deprecated expo-file-system/legacy path

## What's wrong

`apps/mobile/src/stores/reportStore.ts` (line 5) and `apps/mobile/app/settings/data.tsx` (line 14) both import `StorageAccessFramework` and file-write helpers from `expo-file-system/legacy`:

```ts
import { StorageAccessFramework, writeAsStringAsync } from 'expo-file-system/legacy';
import { StorageAccessFramework, readAsStringAsync } from 'expo-file-system/legacy';
```

The `/legacy` sub-path is a compatibility shim provided during the Expo SDK migration to the new File System Next API. It is not guaranteed to exist in future SDK versions.

## Why it matters

When Expo drops the legacy shim (expected in a future SDK), both the report-export flow (`reportStore`) and the backup import/export flow (`settings/data.tsx`) will crash at runtime on Android. The breakage is silent at build time — TypeScript resolves the import today, but the module will simply be absent after the shim is removed.

## Proposed fix

- Check the current `expo-file-system` (v2+) API for `StorageAccessFramework` equivalents or use `expo-document-picker` + `expo-sharing` as the canonical pattern for SAF-based file selection and sharing.
- Replace `writeAsStringAsync` with `FileSystem.writeAsStringAsync` from the non-legacy path, or use the new `File` class from `expo-file-system/next`.
- Replace `readAsStringAsync` similarly.
- Remove all `/legacy` imports once both files are migrated.
- Smoke-test report export and backup import on Android after the change.

## Files involved

- `apps/mobile/src/stores/reportStore.ts`
- `apps/mobile/app/settings/data.tsx`
