import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { displayVersion } from './displayVersion';

let cached: Record<string, string> | null = null;

/**
 * `X-App-Version` / `X-App-Platform` for every API request (ABA-813), so the
 * admin users table can show which build each user runs. The version is the
 * same string the About screen shows — `1.42.0 (123)` on native (Play's
 * versionCode), `1.42.0+abc1234` on web (the deployed commit) — and both are
 * computed once: they cannot change while the app runs.
 */
export function clientHeaders(): Record<string, string> {
  if (cached) return cached;
  try {
    const version = displayVersion(
      Constants.expoConfig?.version || Application.nativeApplicationVersion || '0.0.0',
      process.env.EXPO_PUBLIC_BUILD_SHA,
      Application.nativeBuildVersion,
    );
    cached = { 'X-App-Version': version, 'X-App-Platform': Platform.OS };
  } catch {
    // Never let version reporting break a request.
    cached = {};
  }
  return cached;
}
