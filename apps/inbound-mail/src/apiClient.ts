import type { InboundMailHandoffPayload } from './types';
import type { ApiOutcome } from './policy';

export interface ApiClient {
  rcpt(token: string, remoteIp: string): Promise<ApiOutcome>;
  handoff(payload: InboundMailHandoffPayload): Promise<ApiOutcome>;
}

/**
 * Talks to the API over the private inbound-mail-net. It sends ONLY Content-Type and
 * X-Inbound-Secret: never X-Forwarded-For / X-Real-IP, which the API treats as "came through
 * the public proxy" and answers 403.
 */
export function createApiClient(opts: {
  baseUrl: string;
  secret: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): ApiClient {
  const doFetch = opts.fetchImpl ?? fetch;

  async function post(path: string, body: unknown): Promise<ApiOutcome> {
    try {
      const res = await doFetch(`${opts.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Inbound-Secret': opts.secret },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
      let parsed: unknown;
      try {
        parsed = await res.json();
      } catch {
        parsed = undefined;
      }
      return { status: res.status, body: parsed };
    } catch {
      return { status: 0 };
    }
  }

  return {
    rcpt: (token, remoteIp) => post('/internal/inbound-mail/rcpt', { token, remoteIp }),
    handoff: (payload) => post('/internal/inbound-mail/messages', payload),
  };
}
