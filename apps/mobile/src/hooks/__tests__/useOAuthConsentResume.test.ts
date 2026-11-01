/**
 * Public API phase 1, Task 13 review fix (Ruling 27): the post-sign-in return to the consent page
 * must not depend on whether the sign-in's own `router.replace('/(tabs)')` lands before or after
 * the cold-start gate opens. The navigator is faked: `router.replace` moves the fake root route
 * and fires the `state` listeners, as the real container does.
 */
const mockStorage = new Map<string, string>();
const mockRemoveItem = jest.fn(async (key: string) => {
  mockStorage.delete(key);
});
jest.mock('@/services/secureStorage', () => ({
  secureStorage: {
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    removeItem: (key: string) => mockRemoveItem(key),
  },
}));

type Listener = () => void;
const mockNav = {
  root: '(auth)' as string,
  listeners: new Set<Listener>(),
  history: [] as string[],
};
function mockGo(path: string) {
  mockNav.history.push(path);
  mockNav.root = path.startsWith('/(tabs)')
    ? '(tabs)'
    : path.startsWith('/authorize')
      ? 'authorize'
      : path.startsWith('/(auth)')
        ? '(auth)'
        : path.replace(/^\//, '');
  mockNav.listeners.forEach((l) => l());
}
const mockRef = {
  isReady: () => true,
  // Shaped like expo-router's real root state: one internal `__root` route wrapping the app stack.
  getRootState: () => ({
    index: 0,
    routes: [{ name: '__root', state: { index: 0, routes: [{ name: mockNav.root }] } }],
  }),
  addListener: (_event: string, l: Listener) => {
    mockNav.listeners.add(l);
    return () => mockNav.listeners.delete(l);
  },
};
const mockReplace = jest.fn((path: string) => mockGo(path));
const mockPush = jest.fn((path: string) => mockGo(path));
jest.mock('expo-router', () => ({
  router: {
    replace: (p: string) => mockReplace(p),
    push: (p: string) => mockPush(p),
  },
  useNavigationContainerRef: () => mockRef,
}));

import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useOAuthConsentResume } from '../useOAuthConsentResume';
import { stashPendingConsent } from '@/features/oauth-consent/pendingConsent';
import { buildAuthorizePath } from '@/features/oauth-consent/consentParams';
import { appStackRouteName, consentResumeDecision } from '@/features/oauth-consent/consentResume';

const PARAMS = {
  response_type: 'code',
  client_id: 'aba_ci_abc',
  redirect_uri: 'https://app.example.com/cb',
  scope: 'expenses:read',
  state: 'xyz',
  code_challenge: 'c'.repeat(43),
  code_challenge_method: 'S256',
};
const AUTHORIZE_PATH = buildAuthorizePath(PARAMS);

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

function mountHook(initialGate: boolean) {
  let gate = initialGate;
  function Probe() {
    useOAuthConsentResume(gate);
    return null;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Probe));
  });
  return {
    openGate() {
      gate = true;
      act(() => renderer.update(createElement(Probe)));
    },
    unmount: () => renderer.unmount(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.clear();
  mockNav.root = '(auth)';
  mockNav.listeners.clear();
  mockNav.history = [];
});

describe('useOAuthConsentResume', () => {
  it('sign-in replace arrives AFTER the gate opens: waits on (auth), then lands on /authorize, stash consumed once', async () => {
    await stashPendingConsent(PARAMS);
    const hook = mountHook(false);

    hook.openGate(); // isAuthenticated flipped, still showing the login screen
    await settle();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockStorage.size).toBe(1); // not consumed while on (auth)

    act(() => mockGo('/(tabs)')); // login.tsx's router.replace('/(tabs)') lands now
    await settle();

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(AUTHORIZE_PATH);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockNav.root).toBe('authorize');
    expect(mockRemoveItem).toHaveBeenCalledTimes(1);
    expect(mockStorage.size).toBe(0);

    // Later navigation does not resume again.
    act(() => mockGo('/(tabs)'));
    await settle();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('sign-in replace arrives BEFORE the gate opens: resumes immediately onto /authorize, stash consumed once', async () => {
    await stashPendingConsent(PARAMS);
    const hook = mountHook(false);

    act(() => mockGo('/(tabs)')); // login.tsx's router.replace('/(tabs)') lands first
    await settle();
    expect(mockReplace).not.toHaveBeenCalled(); // gate still closed

    hook.openGate();
    await settle();

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(AUTHORIZE_PATH);
    expect(mockNav.root).toBe('authorize');
    expect(mockRemoveItem).toHaveBeenCalledTimes(1);
    expect(mockStorage.size).toBe(0);
    hook.unmount();
  });

  it('the Google relay landing (oauth) also counts as still signing in', async () => {
    await stashPendingConsent(PARAMS);
    mockNav.root = 'oauth';
    const hook = mountHook(true);
    await settle();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockStorage.size).toBe(1);

    act(() => mockGo('/(tabs)'));
    await settle();
    expect(mockReplace).toHaveBeenLastCalledWith(AUTHORIZE_PATH);
    hook.unmount();
  });

  it('nothing stashed: never navigates', async () => {
    mockNav.root = '(tabs)';
    const hook = mountHook(true);
    await settle();
    expect(mockReplace).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('steps into the expo-router __root wrapper to find the app stack route', () => {
    expect(appStackRouteName({ index: 0, routes: [{ name: '__root', state: { index: 1, routes: [{ name: '(auth)' }, { name: '(tabs)' }] } }] })).toBe('(tabs)');
    expect(appStackRouteName({ index: 0, routes: [{ name: '__root' }] })).toBeUndefined();
    expect(appStackRouteName(undefined)).toBeUndefined();
  });

  it('decision table', () => {
    expect(consentResumeDecision(undefined)).toBe('wait');
    expect(consentResumeDecision('(auth)')).toBe('wait');
    expect(consentResumeDecision('oauth')).toBe('wait');
    expect(consentResumeDecision('index')).toBe('wait');
    expect(consentResumeDecision('authorize')).toBe('discard');
    expect(consentResumeDecision('(tabs)')).toBe('navigate');
    expect(consentResumeDecision('get-started')).toBe('navigate');
  });
});
