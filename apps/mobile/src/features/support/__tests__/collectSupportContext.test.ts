import type { SupportContext } from '@budget/shared-types';
import { collectSupportContext } from '../collectSupportContext';

const mockPlatform = { OS: 'android' as string, Version: 34 as unknown };
// A getter: the factory runs when the (hoisted) import above is evaluated, before this const is.
jest.mock('react-native', () => ({
  get Platform() {
    return mockPlatform;
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.42.0', nativeBuildVersion: '123' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.42.0' } } }));
jest.mock('@/i18n', () => ({ __esModule: true, default: { language: 'br' } }));
const mockTier = { tier: 'pro' as string };
jest.mock('@/stores/subscriptionStore', () => ({
  useSubscriptionStore: { getState: () => mockTier },
}));
const mockAccount: { current: { type: string } | null } = { current: { type: 'shared' } };
jest.mock('@/stores/accountStore', () => ({
  useAccountStore: { getState: () => ({ currentAccount: () => mockAccount.current }) },
}));


/**
 * The API's ValidationPipe runs with `forbidNonWhitelisted`: one key outside
 * `SupportContextDto` turns EVERY message into a 400. This list is that DTO.
 */
const ALLOWED: readonly (keyof SupportContext)[] = [
  'appVersion',
  'buildSha',
  'platform',
  'osVersion',
  'locale',
  'tier',
  'accountType',
  'fromRoute',
];

describe('collectSupportContext', () => {
  const ORIGINAL_SHA = process.env.EXPO_PUBLIC_BUILD_SHA;
  afterEach(() => {
    mockPlatform.OS = 'android';
    mockPlatform.Version = 34;
    mockTier.tier = 'pro';
    mockAccount.current = { type: 'shared' };
    process.env.EXPO_PUBLIC_BUILD_SHA = ORIGINAL_SHA;
  });

  it('has exactly the SupportContext keys on native and passes the route pattern through unchanged', () => {
    const ctx = collectSupportContext('/expense/[id]');
    expect(Object.keys(ctx).sort()).toEqual(
      ['accountType', 'appVersion', 'fromRoute', 'locale', 'osVersion', 'platform', 'tier'].sort(),
    );
    expect(ctx).toEqual({
      appVersion: '1.42.0 (123)',
      platform: 'android',
      osVersion: '34',
      locale: 'br',
      tier: 'pro',
      accountType: 'shared',
      fromRoute: '/expense/[id]',
    });
  });

  it('carries the build sha on web and never a key outside the DTO', () => {
    mockPlatform.OS = 'web';
    mockPlatform.Version = undefined;
    process.env.EXPO_PUBLIC_BUILD_SHA = 'a3f9c1e2b4d6f8a0c2e4';
    const ctx = collectSupportContext();
    for (const key of Object.keys(ctx)) expect(ALLOWED).toContain(key);
    expect(ctx.platform).toBe('web');
    expect(ctx.buildSha).toBe('a3f9c1e');
    expect(ctx.appVersion).toBe('1.42.0');
    expect('osVersion' in ctx).toBe(false);
    expect('fromRoute' in ctx).toBe(false);
  });

  it('omits absent optional keys rather than sending null or undefined', () => {
    mockAccount.current = null;
    const ctx = collectSupportContext(undefined);
    expect('accountType' in ctx).toBe(false);
    expect('fromRoute' in ctx).toBe(false);
    expect('buildSha' in ctx).toBe(false);
    for (const value of Object.values(ctx)) {
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
      expect((value as string).length).toBeLessThanOrEqual(100);
    }
  });

  it('caps every value at 100 characters', () => {
    const ctx = collectSupportContext('x'.repeat(250));
    expect(ctx.fromRoute).toHaveLength(100);
  });
});
