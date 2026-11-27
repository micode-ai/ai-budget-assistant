import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import type { SupportContext } from '@budget/shared-types';
import i18n from '@/i18n';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAccountStore } from '@/stores/accountStore';
import { displayVersion } from '@/features/about/displayVersion';

/** `SupportContextDto` caps every field at 100 characters. */
const MAX = 100;

function clip(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  return s ? s.slice(0, MAX) : undefined;
}

function hexSha(sha: string | undefined): string | undefined {
  const candidate = sha?.trim().toLowerCase();
  return candidate && /^[0-9a-f]{7,40}$/.test(candidate) ? candidate.slice(0, 7) : undefined;
}

/**
 * The technical context attached to a support message — app version, device,
 * language — and NOTHING else.
 *
 * The API validates `context` with `forbidNonWhitelisted`: one key outside
 * `SupportContext` makes every message a 400, and a `null`/`undefined` value on
 * a `@IsOptional() @IsString()` key is still a key. So absent optional keys are
 * OMITTED, never sent empty, and every value is clipped to 100 characters.
 * Pinned by `__tests__/collectSupportContext.test.ts`.
 *
 * Never add amounts, transactions, account or category names, location or
 * other members' data here (global constraint) — `accountType` is the account
 * KIND (`personal`/`shared`/…), not its name.
 *
 * `fromRoute` is a route PATTERN (`expense/[id]`), never a resolved path.
 */
export function collectSupportContext(fromRoute?: string): SupportContext {
  const isWeb = Platform.OS === 'web';
  const platform: SupportContext['platform'] =
    Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
  const version = Application.nativeApplicationVersion || Constants.expoConfig?.version || '0.0.0';

  const candidates: Record<keyof SupportContext, string | undefined> = {
    // Native: `1.42.0 (123)` with Play's versionCode; web: the bare semver, its commit in `buildSha`.
    appVersion: clip(isWeb ? version : displayVersion(version, null, Application.nativeBuildVersion)) ?? '0.0.0',
    buildSha: isWeb ? hexSha(process.env.EXPO_PUBLIC_BUILD_SHA) : undefined,
    platform,
    osVersion: isWeb ? undefined : clip(Platform.Version),
    locale: clip(i18n.language) ?? 'en',
    tier: clip(useSubscriptionStore.getState().tier),
    accountType: clip(useAccountStore.getState().currentAccount()?.type),
    fromRoute: clip(fromRoute),
  };

  const context = {} as Record<string, string>;
  for (const [key, value] of Object.entries(candidates)) {
    if (value !== undefined) context[key] = value;
  }
  return context as unknown as SupportContext;
}
