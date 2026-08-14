import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./src/widgets/widgetTaskHandler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (e) {
    // Widget native module not available (Expo Go / dev client without native build)
  }

  // Shopping Mode's location task, for exactly the same reason as the widget
  // handler above: a handler must already exist when a headless invocation
  // arrives, and this file — the real entry, per package.json `"main"` — is
  // the only module guaranteed to have been evaluated by then.
  //
  // Importing `./src/services/shoppingMode` runs its module-scope
  // `TaskManager.defineTask(SHOPPING_MODE_TASK, ...)`. That call is the only
  // thing standing between a live session and its own destruction: when a
  // location update wakes the app and expo-task-manager finds no executor for
  // the task name, its event listener does not merely skip the update — it
  // calls `unregisterTaskAsync(taskName)` (the `else` branch of the
  // module-scope listener in expo-task-manager's `build/TaskManager.js`),
  // permanently ending a shopping trip with no signal to the user.
  //
  // A route module cannot do this job. Expo Router loads routes through
  // `require.context`, and Metro's context template puts every entry behind an
  // enumerable getter (`get() { return require(...) }`), so a route module is
  // evaluated only when something reads its key off the map. On a headless
  // wake `expo-router/entry` reaches `registerRootComponent(App)` and stops
  // there, and `RNHeadlessAppLoader.loadApp` only starts the React host — no
  // surface, so `ExpoRoot` never renders, the context is never keyed, and
  // `app/_layout.tsx` is never evaluated. Registering from here instead is
  // what makes the whole feature survive the ordinary sequence of Android
  // reclaiming the process and restarting the location service.
  //
  // Keep this a plain top-level `require` inside the Android guard. No lazy
  // import, no moving it into a screen or a hook.
  try {
    require('./src/services/shoppingMode');
  } catch (e) {
    // expo-location / expo-task-manager native modules not available
    // (Expo Go / dev client without native build).
    //
    // Deliberately noisier than the widget catch above: if this ever throws on
    // a real device, the outcome is byte-identical to the bug this registration
    // exists to prevent — task unregistered, notification gone, trip silently
    // dead. This warning is the only breadcrumb logcat would carry, and it is
    // what the `adb shell am kill` step of the device pass would be looking at.
    console.warn('[ShoppingMode] location task not registered:', e);
  }
}

import 'expo-router/entry';
