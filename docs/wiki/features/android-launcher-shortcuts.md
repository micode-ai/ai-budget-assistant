# Android launcher shortcuts

Long-press the app icon → Add expense / Scan receipt / Voice.

## How it works
Three static shortcuts (`res/xml/shortcuts.xml`) fire a `budget:///expense/{new|receipt|voice}` VIEW intent at `MainActivity`; `useGenericDeepLink` routes it after init and auth, so a signed-out user lands on login first and reaches the target afterwards. Definitions live in `apps/mobile/plugins/launcherShortcuts.json`; `plugins/withLauncherShortcuts.js` (in `app.json` plugins) regenerates the XML, strings (`values*/launcher_shortcuts.xml`, 9 locales) and manifest meta-data after `expo prebuild`.

## Invariants
- No second deep-link handler — extend `useGenericDeepLink` if routing needs to change.
- Max 4 shortcuts; labels in all 9 locales (`ua` is Android `uk`).
- Edit the JSON, then regenerate the committed XML; `src/features/launcherShortcuts/__tests__` guards drift.

## Known gaps
Not dynamic: order/visibility do not follow `quickActionStore` (needs a native ShortcutManager module). Not yet device-verified. Icon is the app icon for all three.
