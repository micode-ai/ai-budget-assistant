import { HttpClient } from '../http-client';

jest.mock('../secureStorage', () => ({
  secureStorage: { getItem: jest.fn(async () => 'token-1'), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('../connectivity', () => ({ reportApiFetchFailure: jest.fn(), reportApiResponse: jest.fn() }));
jest.mock('@/features/about/clientHeaders', () => ({ clientHeaders: () => ({}) }));

function okResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
}

describe('HttpClient skipAccountScope', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn(async () => okResponse({ ok: true }));
    (global as any).fetch = fetchMock;
  });

  function sentHeaders(): Record<string, string> {
    return fetchMock.mock.calls[0][1].headers as Record<string, string>;
  }

  it('by default sends the current account and refuses a demo account (unchanged behaviour)', async () => {
    const client = new HttpClient('http://api');
    client.setAccountIdGetter(() => 'acc-1');
    await client.request('/x');
    expect(sentHeaders()['X-Account-Id']).toBe('acc-1');

    client.setAccountIdGetter(() => 'demo-1');
    await expect(client.request('/x')).rejects.toThrow('Sample data is local-only');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('with skipAccountScope sends no X-Account-Id but keeps the bearer token', async () => {
    const client = new HttpClient('http://api');
    client.setAccountIdGetter(() => 'acc-1');
    await client.request('/support/thread', { skipAccountScope: true });
    expect(sentHeaders()['X-Account-Id']).toBeUndefined();
    expect(sentHeaders().Authorization).toBe('Bearer token-1');
  });

  it('with skipAccountScope reaches the server while a demo account is current', async () => {
    const client = new HttpClient('http://api');
    client.setAccountIdGetter(() => 'demo-1');
    await expect(client.request('/support/thread', { skipAccountScope: true })).resolves.toEqual({ ok: true });
    expect(sentHeaders()['X-Account-Id']).toBeUndefined();
  });
});
