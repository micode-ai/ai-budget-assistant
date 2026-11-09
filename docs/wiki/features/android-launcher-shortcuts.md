# Android launcher shortcuts

Long-press the app icon → Add expense / Scan receipt / Voice.

## How it works
Three static shortcuts (`res/xml/shortcuts.xml`) fire a `budget:///expense/{new|receipt|voice}` VIEW intent at `MainActivity`; `useGenericDeepLink` routes it after init and auth, so a signed-out user lands on login first and reaches the target afterwards. Definitions live in `apps/mobile/plugins/launcherShortcuts.json`; `plugins/withLauncherShortcuts.js` (in `app.json` plugins) regenerates the XML, strings (`values*/launcher_shortcuts.xml`, 9 locales) and manifest meta-data after `expo prebuild`.

## Invariants
- No second deep-link handler — extend `useGenericDeepLink` if routing needs to change.
- **Expo Router must not navigate these links itself.** It routes every incoming URL on its own (cold start via its initial URL, warm start via its Linking subscription), so with `useGenericDeepLink` also pushing, one tap opened the screen two or three times, and on a cold start the target sat at the bottom of the stack with no home to go Back to ([ABA-728](https://github.com/micode-ai/ai-budget-assistant/issues/765), found on 1.38.0). `app/+native-intent.tsx` hands `HANDED_OFF_PATHS` (`src/features/launcherShortcuts/handOffDeepLinks.ts`) to the hook: cold start → `/`, warm start → ignored. The home-screen widgets open the same three paths, so they share the fix. A new shortcut or widget path goes into `HANDED_OFF_PATHS`.
- `useGenericDeepLink` reads `Linking.getInitialURL()` once per process: the effect re-runs on every init/auth change and the launch URL never changes.
- Max 4 shortcuts; labels in all 9 locales (`ua` is Android `uk`).
- Edit the JSON, then regenerate the committed XML; `src/features/launcherShortcuts/__tests__` guards drift.

## Known gaps
Not dynamic: order/visibility do not follow `quickActionStore` (needs a native ShortcutManager module). Not yet device-verified (the ABA-728 fix is unit-tested only). Icon is the app icon for all three.
