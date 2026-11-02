/**
 * Public API phase 1, Task 13: the consent screen's state machine. Same "Probe exists only to give
 * the hook a render to live in" pattern as `useRecurringExpenseFields.test.ts`.
 */
const mockPreview = jest.fn();
const mockApprove = jest.fn();
jest.mock('@/services/api', () => ({
  oauthApi: {
    preview: (...args: unknown[]) => mockPreview(...args),
    approve: (...args: unknown[]) => mockApprove(...args),
  },
}));

let mockAuthenticated = true;
jest.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: mockAuthenticated }),
}));

const mockOpenRedirect = jest.fn((_url: string) => Promise.resolve());
jest.mock('../openRedirect', () => ({ openRedirect: (url: string) => mockOpenRedirect(url) }));

const mockStash = jest.fn((_p: unknown) => Promise.resolve());
jest.mock('../pendingConsent', () => ({ stashPendingConsent: (p: unknown) => mockStash(p) }));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ router: { replace: (p: unknown) => mockReplace(p) } }));

import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useConsent, type ConsentState } from '../useConsent';
import type { OAuthAuthorizePreview } from '@/services/oauth.api';

const PARAMS = {
  response_type: 'code',
  client_id: 'aba_ci_abc',
  redirect_uri: 'https://app.example.com/cb',
  scope: 'expenses:read categories:read',
  state: 'xyz',
  code_challenge: 'c'.repeat(43),
  code_challenge_method: 'S256',
  unrelated: 'dropped',
};

const PREVIEW: OAuthAuthorizePreview = {
  app: {
    name: 'AI Accounting',
    logoUrl: null,
    homepageUrl: 'https://example.com',
    privacyPolicyUrl: null,
    isVerified: true,
    developerName: 'Example Ltd',
  },
  scopes: ['expenses:read', 'categories:read'],
  accounts: [
    { id: 'a-viewer', name: 'Family', type: 'shared', role: 'viewer', selectable: false, reason: 'viewer', readOnly: false, connected: false },
    { id: 'a-e2ee', name: 'Secret', type: 'personal', role: 'owner', selectable: false, reason: 'encrypted', readOnly: false, connected: false },
    { id: 'a-main', name: 'Main', type: 'personal', role: 'owner', selectable: true, reason: null, readOnly: false, connected: false },
    { id: 'a-biz', name: 'Business', type: 'business', role: 'editor', selectable: true, reason: null, readOnly: true, connected: false },
  ],
};

function oauthFailure(status: number, error?: string) {
  const e: Error & { status?: number; body?: unknown } = new Error(`HTTP ${status}`);
  e.status = status;
  e.body = error ? { error, error_description: 'x' } : { statusCode: status, message: 'Not Found', error: 'Not Found' };
  return e;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderConsent(params: Record<string, string> = PARAMS) {
  let hook!: ConsentState;
  function Probe() {
    hook = useConsent(params);
    return null;
  }
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(Probe));
  });
  await flush();
  return {
    get current(): ConsentState {
      return hook;
    },
    unmount: () => renderer.unmount(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockAuthenticated = true;
});

describe('useConsent', () => {
  it('forwards only the OAuth params to preview', async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    await renderConsent();
    const { unrelated: _dropped, ...expected } = PARAMS;
    expect(mockPreview).toHaveBeenCalledWith(expected);
  });

  it('a preview error leaves status error with the reason and makes allow and deny no-ops', async () => {
    mockPreview.mockRejectedValue(oauthFailure(400, 'invalid_redirect_uri'));
    const hook = await renderConsent();

    expect(hook.current.status).toBe('error');
    expect(hook.current.error).toBe('invalid_redirect_uri');

    await act(async () => {
      await hook.current.allow();
      await hook.current.deny();
    });
    expect(mockApprove).not.toHaveBeenCalled();
    expect(mockOpenRedirect).not.toHaveBeenCalled();
  });

  it('a 404 without an OAuth code reads as "unavailable" (the flag is off)', async () => {
    mockPreview.mockRejectedValue(oauthFailure(404));
    const hook = await renderConsent();
    expect(hook.current.status).toBe('error');
    expect(hook.current.error).toBe('unavailable');
  });

  it('nothing is pre-ticked when two accounts are selectable and none connected', async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    const hook = await renderConsent();
    expect(hook.current.status).toBe('ready');
    expect(hook.current.selectedAccountIds).toEqual([]);
    expect(hook.current.isReconsent).toBe(false);
    expect(hook.current.app?.name).toBe('AI Accounting');
    expect(hook.current.scopes).toEqual(['expenses:read', 'categories:read']);
  });

  it('toggle adds and removes a selectable account; non-selectable and unknown ids are ignored', async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    const hook = await renderConsent();

    act(() => hook.current.toggle('a-viewer'));
    act(() => hook.current.toggle('a-e2ee'));
    act(() => hook.current.toggle('unknown'));
    expect(hook.current.selectedAccountIds).toEqual([]);
    act(() => hook.current.toggle('a-biz'));
    expect(hook.current.selectedAccountIds).toEqual(['a-biz']);
    act(() => hook.current.toggle('a-main'));
    expect(hook.current.selectedAccountIds).toEqual(['a-biz', 'a-main']);
    act(() => hook.current.toggle('a-biz'));
    expect(hook.current.selectedAccountIds).toEqual(['a-main']);
  });

  it('allow with an empty selection is a no-op', async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    const hook = await renderConsent();
    await act(async () => {
      await hook.current.allow();
    });
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('allow posts account_ids in the order of accounts (not tick order) and no account_id', async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    mockApprove.mockResolvedValue({ redirectTo: 'https://app.example.com/cb?code=aba_ac_1&state=xyz' });
    const hook = await renderConsent();
    act(() => hook.current.toggle('a-biz'));
    act(() => hook.current.toggle('a-main'));

    await act(async () => {
      await hook.current.allow();
    });

    expect(mockApprove).toHaveBeenCalledWith({
      client_id: PARAMS.client_id,
      redirect_uri: PARAMS.redirect_uri,
      scope: PARAMS.scope,
      state: PARAMS.state,
      code_challenge: PARAMS.code_challenge,
      code_challenge_method: PARAMS.code_challenge_method,
      account_ids: ['a-main', 'a-biz'],
      decision: 'allow',
    });
    expect(mockApprove.mock.calls[0][0]).not.toHaveProperty('account_id');
    expect(mockOpenRedirect).toHaveBeenCalledWith('https://app.example.com/cb?code=aba_ac_1&state=xyz');
    expect(hook.current.status).toBe('done');
  });

  it('re-consent pre-ticks the connected accounts, flags isReconsent, and drops a connected viewer row', async () => {
    mockPreview.mockResolvedValue({
      ...PREVIEW,
      accounts: PREVIEW.accounts.map((a) =>
        a.id === 'a-main' || a.id === 'a-viewer' ? { ...a, connected: true } : a,
      ),
    });
    const hook = await renderConsent();
    expect(hook.current.isReconsent).toBe(true);
    expect(hook.current.selectedAccountIds).toEqual(['a-main']);
  });

  it('exactly one selectable account is pre-ticked on a first connection', async () => {
    mockPreview.mockResolvedValue({ ...PREVIEW, accounts: PREVIEW.accounts.slice(0, 3) });
    const hook = await renderConsent();
    expect(hook.current.selectedAccountIds).toEqual(['a-main']);
  });

  it('no selectable account: nothing ticked and allow is a no-op', async () => {
    mockPreview.mockResolvedValue({ ...PREVIEW, accounts: PREVIEW.accounts.slice(0, 2) });
    const hook = await renderConsent();
    expect(hook.current.selectedAccountIds).toEqual([]);
    await act(async () => {
      await hook.current.allow();
    });
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('deny posts decision deny and navigates to the returned URL', async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    mockApprove.mockResolvedValue({ redirectTo: 'https://app.example.com/cb?error=access_denied&state=xyz' });
    const hook = await renderConsent();

    await act(async () => {
      await hook.current.deny();
    });

    expect(mockApprove).toHaveBeenCalledTimes(1);
    expect(mockApprove.mock.calls[0][0]).toMatchObject({ decision: 'deny', client_id: PARAMS.client_id });
    expect(mockApprove.mock.calls[0][0]).not.toHaveProperty('account_ids');
    expect(mockOpenRedirect).toHaveBeenCalledWith('https://app.example.com/cb?error=access_denied&state=xyz');
  });

  it('a retryable approve failure keeps the screen ready with a submit error and no redirect', async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    mockApprove.mockRejectedValue(oauthFailure(503, 'temporarily_unavailable'));
    const hook = await renderConsent();
    act(() => hook.current.toggle('a-main'));

    await act(async () => {
      await hook.current.allow();
    });

    expect(hook.current.status).toBe('ready');
    expect(hook.current.submitError).toBe('temporarily_unavailable');
    expect(mockOpenRedirect).not.toHaveBeenCalled();
  });

  it('an approve refusal for the account (account_encrypted) keeps the screen ready with the reason', async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    mockApprove.mockRejectedValue(oauthFailure(403, 'account_encrypted'));
    const hook = await renderConsent();
    act(() => hook.current.toggle('a-main'));
    await act(async () => {
      await hook.current.allow();
    });
    expect(hook.current.status).toBe('ready');
    expect(hook.current.submitError).toBe('account_encrypted');
  });

  it('an approve request error (client blocked meanwhile) becomes the error state, no redirect', async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    mockApprove.mockRejectedValue(oauthFailure(400, 'invalid_client'));
    const hook = await renderConsent();
    act(() => hook.current.toggle('a-main'));
    await act(async () => {
      await hook.current.allow();
    });
    expect(hook.current.status).toBe('error');
    expect(hook.current.error).toBe('invalid_client');
    expect(mockOpenRedirect).not.toHaveBeenCalled();
  });

  it('signed out: stashes the OAuth params, goes to login, never calls preview', async () => {
    mockAuthenticated = false;
    const hook = await renderConsent();
    const { unrelated: _dropped, ...expected } = PARAMS;
    expect(mockStash).toHaveBeenCalledWith(expected);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    expect(mockPreview).not.toHaveBeenCalled();
    expect(hook.current.status).toBe('loading');
  });
});
