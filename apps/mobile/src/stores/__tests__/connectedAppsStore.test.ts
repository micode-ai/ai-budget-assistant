/** Connected apps (Public API phase 1): the list of grants and disconnecting one. */
jest.mock('@/services/api', () => ({
  api: {
    listConnectedApps: jest.fn(),
    disconnectConnectedApp: jest.fn(),
    listDeveloperApps: jest.fn(),
  },
}));

import { api } from '@/services/api';
import { useConnectedAppsStore } from '../connectedAppsStore';
import { useDeveloperAppsStore } from '../developerAppsStore';

const mockApi = api as unknown as Record<string, jest.Mock>;
const err = (status?: number) => Object.assign(new Error('x'), status === undefined ? {} : { status });

function grant(grantId: string, accountId = 'acc-1') {
  return {
    grantId,
    app: {
      name: `App ${grantId}`,
      logoUrl: null,
      homepageUrl: 'https://example.com',
      isVerified: false,
      status: 'active',
    },
    account: { id: accountId, name: 'Personal' },
    scopes: ['expenses:read'],
    connectedBy: { id: 'u1', name: 'Me' },
    connectedAt: '2026-11-01T00:00:00.000Z',
    lastUsedAt: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  useConnectedAppsStore.getState().reset();
  useDeveloperAppsStore.getState().reset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('loads the grants', async () => {
  mockApi.listConnectedApps.mockResolvedValue([grant('g1'), grant('g2', 'acc-2')]);
  await useConnectedAppsStore.getState().load();
  const s = useConnectedAppsStore.getState();
  expect(s.items.map((g) => g.grantId)).toEqual(['g1', 'g2']);
  expect(s.loaded).toBe(true);
  expect(s.isLoading).toBe(false);
  expect(useDeveloperAppsStore.getState().availability).toBe('available');
});

// Catches: the pane staying open when the flag went off mid-session. There is one gate
// for both rows, owned by the developer apps store.
it('marks the public API unavailable on a 404', async () => {
  useConnectedAppsStore.setState({ items: [grant('g1')] as never });
  mockApi.listConnectedApps.mockRejectedValue(err(404));
  await useConnectedAppsStore.getState().load();
  expect(useDeveloperAppsStore.getState().availability).toBe('unavailable');
  expect(useConnectedAppsStore.getState().items).toEqual([]);
});

it('keeps the list and records the error on a network failure', async () => {
  useConnectedAppsStore.setState({ items: [grant('g1')] as never, loaded: true });
  mockApi.listConnectedApps.mockRejectedValue(err());
  await useConnectedAppsStore.getState().load();
  const s = useConnectedAppsStore.getState();
  expect(s.items.map((g) => g.grantId)).toEqual(['g1']);
  expect(s.error).toBeTruthy();
  expect(useDeveloperAppsStore.getState().availability).toBe('unknown');
});

it('removes a disconnected grant', async () => {
  useConnectedAppsStore.setState({ items: [grant('g1'), grant('g2')] as never });
  mockApi.disconnectConnectedApp.mockResolvedValue(undefined);
  await useConnectedAppsStore.getState().disconnect('g1');
  expect(mockApi.disconnectConnectedApp).toHaveBeenCalledWith('g1');
  expect(useConnectedAppsStore.getState().items.map((g) => g.grantId)).toEqual(['g2']);
});

// Catches: a failed disconnect making the app vanish from the list while it is still connected.
it('keeps the grant and rethrows when the disconnect fails', async () => {
  useConnectedAppsStore.setState({ items: [grant('g1'), grant('g2')] as never });
  mockApi.disconnectConnectedApp.mockRejectedValue(err(500));
  await expect(useConnectedAppsStore.getState().disconnect('g1')).rejects.toThrow();
  expect(useConnectedAppsStore.getState().items.map((g) => g.grantId)).toEqual(['g1', 'g2']);
});

// A 404 means it is already gone (revoked elsewhere, or the caller lost edit rights).
it('treats a 404 on disconnect as already disconnected', async () => {
  useConnectedAppsStore.setState({ items: [grant('g1')] as never });
  mockApi.disconnectConnectedApp.mockRejectedValue(err(404));
  useDeveloperAppsStore.setState({ availability: 'available' });
  await useConnectedAppsStore.getState().disconnect('g1');
  expect(useConnectedAppsStore.getState().items).toEqual([]);
  // A per-grant 404 is "this grant is gone", never "the feature is off".
  expect(useDeveloperAppsStore.getState().availability).toBe('available');
});

it('reset() clears everything', () => {
  useConnectedAppsStore.setState({ items: [grant('g1')] as never, loaded: true, error: 'e' });
  useConnectedAppsStore.getState().reset();
  const s = useConnectedAppsStore.getState();
  expect(s.items).toEqual([]);
  expect(s.loaded).toBe(false);
  expect(s.error).toBeNull();
});
