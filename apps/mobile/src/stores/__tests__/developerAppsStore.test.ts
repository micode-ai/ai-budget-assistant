/**
 * Developer apps (Public API phase 1): the client secret is shown exactly once and
 * must live only in transient memory - never persisted, never left behind on reset.
 */
jest.mock('@/services/api', () => ({
  api: {
    listDeveloperApps: jest.fn(),
    createDeveloperApp: jest.fn(),
    updateDeveloperApp: jest.fn(),
    rotateDeveloperAppSecret: jest.fn(),
    deleteDeveloperApp: jest.fn(),
  },
}));
jest.mock('@/services/secureStorage', () => ({
  secureStorage: { setItem: jest.fn(), getItem: jest.fn(), removeItem: jest.fn() },
}));

import { api } from '@/services/api';
import { secureStorage } from '@/services/secureStorage';
import { useDeveloperAppsStore } from '../developerAppsStore';
import { developerAppErrorKey } from '@/features/developers/developerApps';

const mockApi = api as unknown as Record<string, jest.Mock>;
const err = (status?: number, message = 'x') =>
  Object.assign(new Error(message), status === undefined ? {} : { status });

function app(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    clientId: `aba_ci_${id}`,
    name: `App ${id}`,
    description: null,
    logoUrl: null,
    homepageUrl: 'https://example.com',
    privacyPolicyUrl: null,
    redirectUris: ['https://example.com/cb'],
    isConfidential: true,
    status: 'active',
    blockedReason: null,
    isVerified: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...extra,
  };
}

const input = {
  name: 'My app',
  homepageUrl: 'https://example.com',
  redirectUris: ['https://example.com/cb'],
  isConfidential: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  useDeveloperAppsStore.getState().reset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('feature gate', () => {
  // Catches: Developers / Connected apps rows staying visible with PUBLIC_API_ENABLED off.
  it('flips to unavailable on a 404 from the list route', async () => {
    mockApi.listDeveloperApps.mockRejectedValue(err(404));
    await useDeveloperAppsStore.getState().loadApps();
    expect(useDeveloperAppsStore.getState().availability).toBe('unavailable');
  });

  // Catches: one offline launch hiding the feature for the whole session.
  it('stays unknown on a network failure and records the error', async () => {
    mockApi.listDeveloperApps.mockRejectedValue(err());
    await useDeveloperAppsStore.getState().loadApps();
    const s = useDeveloperAppsStore.getState();
    expect(s.availability).toBe('unknown');
    expect(s.error).toBeTruthy();
    expect(s.isLoading).toBe(false);
  });

  it('becomes available with the apps once the list answers', async () => {
    mockApi.listDeveloperApps.mockResolvedValue({ apps: [app('a')] });
    await useDeveloperAppsStore.getState().loadApps();
    const s = useDeveloperAppsStore.getState();
    expect(s.availability).toBe('available');
    expect(s.apps.map((a) => a.id)).toEqual(['a']);
    expect(s.loaded).toBe(true);
  });

  it('probes once, and never again after the answer was "off"', async () => {
    mockApi.listDeveloperApps.mockRejectedValue(err(404));
    await useDeveloperAppsStore.getState().probe();
    await useDeveloperAppsStore.getState().probe();
    expect(mockApi.listDeveloperApps).toHaveBeenCalledTimes(1);
  });
});

describe('the one-time client secret', () => {
  // Catches: the secret surviving in state after the user said they saved it.
  it('keeps the secret from create only until acknowledgeSecret()', async () => {
    mockApi.createDeveloperApp.mockResolvedValue({ app: app('n'), clientSecret: 'aba_cs_SECRET' });
    await useDeveloperAppsStore.getState().createApp(input);
    let s = useDeveloperAppsStore.getState();
    expect(s.revealedSecret).toEqual({
      appId: 'n',
      appName: 'App n',
      clientId: 'aba_ci_n',
      clientSecret: 'aba_cs_SECRET',
    });
    expect(s.apps[0].id).toBe('n');
    // The listed app never carries the secret.
    expect(JSON.stringify(s.apps)).not.toContain('aba_cs_SECRET');

    useDeveloperAppsStore.getState().acknowledgeSecret();
    s = useDeveloperAppsStore.getState();
    expect(s.revealedSecret).toBeNull();
    expect(JSON.stringify(s)).not.toContain('aba_cs_SECRET');
  });

  // Catches: the next user to sign in on this device seeing the previous user's secret.
  it('clears the secret on reset()', async () => {
    mockApi.rotateDeveloperAppSecret.mockResolvedValue({ clientSecret: 'aba_cs_ROTATED' });
    useDeveloperAppsStore.setState({ apps: [app('a')] as never });
    await useDeveloperAppsStore.getState().rotateSecret('a');
    expect(useDeveloperAppsStore.getState().revealedSecret?.clientSecret).toBe('aba_cs_ROTATED');

    useDeveloperAppsStore.getState().reset();
    const s = useDeveloperAppsStore.getState();
    expect(s.revealedSecret).toBeNull();
    expect(s.apps).toEqual([]);
    expect(s.availability).toBe('unknown');
  });

  it('has no secret to reveal for a public client', async () => {
    mockApi.createDeveloperApp.mockResolvedValue({ app: app('p', { isConfidential: false }) });
    await useDeveloperAppsStore.getState().createApp({ ...input, isConfidential: false });
    expect(useDeveloperAppsStore.getState().revealedSecret).toBeNull();
    expect(useDeveloperAppsStore.getState().apps[0].id).toBe('p');
  });

  // Catches: the secret ever reaching persistent storage or a log line.
  it('never persists or logs the secret', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = console.warn as jest.Mock;
    mockApi.createDeveloperApp.mockResolvedValue({ app: app('n'), clientSecret: 'aba_cs_SECRET' });
    await useDeveloperAppsStore.getState().createApp(input);
    expect(secureStorage.setItem).not.toHaveBeenCalled();
    expect((useDeveloperAppsStore as unknown as { persist?: unknown }).persist).toBeUndefined();
    for (const call of [...log.mock.calls, ...warn.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain('aba_cs_SECRET');
    }
  });
});

describe('edits', () => {
  it('replaces the edited app in place', async () => {
    useDeveloperAppsStore.setState({ apps: [app('a'), app('b')] as never });
    mockApi.updateDeveloperApp.mockResolvedValue({ app: app('b', { name: 'Renamed' }) });
    await useDeveloperAppsStore.getState().updateApp('b', { name: 'Renamed' });
    expect(mockApi.updateDeveloperApp).toHaveBeenCalledWith('b', { name: 'Renamed' });
    expect(useDeveloperAppsStore.getState().apps.map((a) => a.name)).toEqual(['App a', 'Renamed']);
  });

  it('keeps the connection counters the list route added when an edit returns the bare app', async () => {
    useDeveloperAppsStore.setState({
      apps: [app('a', { connectedUsers: 3, lastUsedAt: '2026-10-01T00:00:00.000Z' })] as never,
    });
    mockApi.updateDeveloperApp.mockResolvedValue({ app: app('a', { name: 'New' }) });
    await useDeveloperAppsStore.getState().updateApp('a', { name: 'New' });
    expect(useDeveloperAppsStore.getState().apps[0]).toMatchObject({ name: 'New', connectedUsers: 3 });
  });

  it('removes a deleted app and drops a secret it was showing', async () => {
    useDeveloperAppsStore.setState({
      apps: [app('a'), app('b')] as never,
      revealedSecret: { appId: 'a', appName: 'App a', clientId: 'aba_ci_a', clientSecret: 'aba_cs_X' },
    });
    mockApi.deleteDeveloperApp.mockResolvedValue(undefined);
    await useDeveloperAppsStore.getState().deleteApp('a');
    const s = useDeveloperAppsStore.getState();
    expect(s.apps.map((a) => a.id)).toEqual(['b']);
    expect(s.revealedSecret).toBeNull();
  });

  // Catches: a failed write looking like it succeeded.
  it('rethrows a failed create and leaves the list unchanged', async () => {
    useDeveloperAppsStore.setState({ apps: [app('a')] as never });
    mockApi.createDeveloperApp.mockRejectedValue(err(400, 'app_limit_reached'));
    await expect(useDeveloperAppsStore.getState().createApp(input)).rejects.toThrow('app_limit_reached');
    expect(useDeveloperAppsStore.getState().apps.map((a) => a.id)).toEqual(['a']);
    expect(useDeveloperAppsStore.getState().revealedSecret).toBeNull();
  });
});

describe('a 404 on one app is not the feature turning off', () => {
  // Catches: editing or rotating an app deleted from another device flipping the whole feature
  // to 'unavailable' for the session, hiding both settings rows (probe() never retries).
  it.each([
    ['updateApp', () => useDeveloperAppsStore.getState().updateApp('a', { name: 'X' }), 'updateDeveloperApp'],
    ['rotateSecret', () => useDeveloperAppsStore.getState().rotateSecret('a'), 'rotateDeveloperAppSecret'],
  ] as const)('%s: drops the stale app, stays available, surfaces notFound', async (_label, call, method) => {
    useDeveloperAppsStore.setState({ availability: 'available', loaded: true, apps: [app('a'), app('b')] as never });
    mockApi[method].mockRejectedValue(err(404, 'App not found'));
    let thrown: unknown;
    await call().catch((e: unknown) => {
      thrown = e;
    });
    expect(developerAppErrorKey(thrown)).toBe('developerApps.errors.notFound');
    const s = useDeveloperAppsStore.getState();
    expect(s.availability).toBe('available');
    expect(s.apps.map((a) => a.id)).toEqual(['b']);
  });

  it('deleteApp: a 404 counts as deleted and keeps the feature available', async () => {
    useDeveloperAppsStore.setState({ availability: 'available', loaded: true, apps: [app('a'), app('b')] as never });
    mockApi.deleteDeveloperApp.mockRejectedValue(err(404));
    await useDeveloperAppsStore.getState().deleteApp('a');
    const s = useDeveloperAppsStore.getState();
    expect(s.availability).toBe('available');
    expect(s.apps.map((a) => a.id)).toEqual(['b']);
  });

  it('createApp: a 404 does not turn the feature off either', async () => {
    useDeveloperAppsStore.setState({ availability: 'available', loaded: true, apps: [app('a')] as never });
    mockApi.createDeveloperApp.mockRejectedValue(err(404));
    await expect(useDeveloperAppsStore.getState().createApp(input)).rejects.toThrow();
    expect(useDeveloperAppsStore.getState().availability).toBe('available');
    expect(useDeveloperAppsStore.getState().apps.map((a) => a.id)).toEqual(['a']);
  });

  it('a non-404 failure on one app leaves the list alone', async () => {
    useDeveloperAppsStore.setState({ availability: 'available', apps: [app('a')] as never });
    mockApi.updateDeveloperApp.mockRejectedValue(err(500));
    await expect(useDeveloperAppsStore.getState().updateApp('a', { name: 'X' })).rejects.toThrow();
    expect(useDeveloperAppsStore.getState().apps.map((a) => a.id)).toEqual(['a']);
  });

  it('loadApps: a 404 from the list route still turns the feature off', async () => {
    useDeveloperAppsStore.setState({ availability: 'available', apps: [app('a')] as never });
    mockApi.listDeveloperApps.mockRejectedValue(err(404));
    await useDeveloperAppsStore.getState().loadApps();
    expect(useDeveloperAppsStore.getState().availability).toBe('unavailable');
    expect(useDeveloperAppsStore.getState().apps).toEqual([]);
  });
});
