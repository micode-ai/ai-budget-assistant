import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./src/widgets/widgetTaskHandler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (e) {
    // Widget native module not available (Expo Go / dev client without native build)
  }

}

// Capture the marketing CTA params (?src=&loc=&lang=&plan=) into localStorage.
//
// Runs here, in the real entry, rather than in a screen or a hook: the query string
// belongs to the FIRST load and the router owns the URL from its first render onward,
// so anything that waits for a mounted component is racing the moment it needs. Module
// evaluation of this file completes before React renders (the same property the Shopping
// Mode registration above depends on), so this is early enough without depending on
// import-hoisting order.
//
// Native resolves `./src/services/attribution` to a no-op — an install has no landing
// query string to read. Wrapped because attribution is optional by design and must never
// be the reason the app fails to start.
try {
  const attribution = require('./src/services/attribution');
  attribution.captureAcquisition();
  // Same first-load constraint, same reason it cannot live in a screen: a
  // referral link (`?ref=`) is read here or not at all.
  attribution.captureReferralCode();
} catch (e) {
  console.warn('[Attribution] capture skipped:', e);
}

import 'expo-router/entry';
