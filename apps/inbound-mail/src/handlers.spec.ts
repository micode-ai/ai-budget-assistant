import type { ApiClient } from './apiClient';
import type { AuthenticateFn } from './authenticate';
import type { InboundConfig } from './config';
import { buildEml, PASSING_AUTH, PDF_BYTES } from './eml.testutil';
import { Semaphore, handleData, handleRcptTo, type DataSession, type Deps } from './handlers';
import { silentLogger } from './log';
import { PenaltyBox, type ApiOutcome } from './policy';

const TOKEN = 'abcdefghijklmnop';
const TOKEN2 = 'qrstuvwxyz234567';
const config: InboundConfig = {
  domain: 'in.ai-budget.pl',
  hostname: 'mail-in.ai-budget.pl',
  secret: 's3cret',
  apiUrl: 'http://api:3000/api/v1',
  apiTimeoutMs: 1000,
  port: 2525,
};

function makeDeps(over: { rcpt?: ApiOutcome; handoff?: ApiOutcome | ((t: string) => ApiOutcome); auth?: AuthenticateFn } = {}) {
  const api = {
    rcpt: jest.fn(async () => over.rcpt ?? { status: 200, body: { result: 'accept' } }),
    handoff: jest.fn(async (p: { token: string }) =>
      typeof over.handoff === 'function' ? over.handoff(p.token) : (over.handoff ?? { status: 202 }),
    ),
  };
  const authenticate: AuthenticateFn = over.auth ?? (async () => PASSING_AUTH);
  const deps: Deps = {
    config,
    api: api as unknown as ApiClient,
    authenticate,
    log: silentLogger,
    penalty: new PenaltyBox(),
    gate: new Semaphore(2),
  };
  return { deps, api };
}

const session = (over: Partial<DataSession> = {}): DataSession => ({
  remoteIp: '203.0.113.9',
  helo: 'mx.shop.example',
  envelopeFrom: 'orders@shop.example',
  recipients: [`${TOKEN}@in.ai-budget.pl`],
  sizeExceeded: false,
  ...over,
});

const eml = () =>
  buildEml({ text: 'Total 10 PLN', attachments: [{ filename: 'p.pdf', contentType: 'application/pdf', content: PDF_BYTES }] });

describe('handleRcptTo: local precheck before any API call', () => {
  it('refuses a foreign domain without calling the API', async () => {
    const { deps, api } = makeDeps();
    const r = await handleRcptTo('victim@gmail.com', '1.1.1.1', 0, deps);
    expect(r).toMatchObject({ code: 550, text: expect.stringMatching(/^5\.7\.1/) });
    expect(api.rcpt).not.toHaveBeenCalled();
  });

  it('refuses a bad local part without calling the API', async () => {
    const { deps, api } = makeDeps();
    const r = await handleRcptTo('nottoken@in.ai-budget.pl', '1.1.1.1', 0, deps);
    expect(r?.code).toBe(550);
    expect(api.rcpt).not.toHaveBeenCalled();
  });

  it('calls the API with the normalised token and the remote IP', async () => {
    const { deps, api } = makeDeps();
    const r = await handleRcptTo(`${TOKEN.toUpperCase()}+x@IN.AI-BUDGET.PL`, '9.9.9.9', 0, deps);
    expect(r).toBeNull();
    expect(api.rcpt).toHaveBeenCalledWith(TOKEN, '9.9.9.9');
  });

  it('caps recipients per transaction at 5 with 452 4.5.3', async () => {
    const { deps, api } = makeDeps();
    const r = await handleRcptTo(`${TOKEN}@in.ai-budget.pl`, '1.1.1.1', 5, deps);
    expect(r).toMatchObject({ code: 452, text: expect.stringMatching(/^4\.5\.3/) });
    expect(api.rcpt).not.toHaveBeenCalled();
  });

  it('feeds bad recipients into the penalty box', async () => {
    const { deps } = makeDeps();
    for (let i = 0; i < 10; i++) await handleRcptTo('x@gmail.com', '6.6.6.6', 0, deps);
    expect(deps.penalty.isBoxed('6.6.6.6')).toBe(true);
    expect(deps.penalty.isBoxed('7.7.7.7')).toBe(false);
  });

  it.each([
    [{ status: 200, body: { result: 'unknown' } }, 550],
    [{ status: 200, body: { result: 'limited' } }, 452],
    [{ status: 503 }, 451],
    [{ status: 401 }, 451],
    [{ status: 403 }, 451],
    [{ status: 400 }, 550],
    [{ status: 0 }, 451],
  ])('maps API %j to SMTP %i', async (rcpt, code) => {
    const { deps } = makeDeps({ rcpt });
    const r = await handleRcptTo(`${TOKEN}@in.ai-budget.pl`, '1.1.1.1', 0, deps);
    expect(r?.code).toBe(code);
  });
});

describe('handleData', () => {
  it('answers 250 only after the API persisted (202), sending the full payload', async () => {
    const { deps, api } = makeDeps();
    const r = await handleData(eml(), session(), deps);
    expect(r).toBeNull();
    expect(api.handoff).toHaveBeenCalledTimes(1);
    const payload = api.handoff.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({ token: TOKEN, remoteIp: '203.0.113.9', kind: 'receipt' });
    expect((payload.document as { kind: string }).kind).toBe('pdf');
  });

  it.each([
    [202, null],
    [409, null],
    [422, null],
    [404, 550],
    [400, 550],
    [429, 452],
    [503, 451],
    [0, 451],
    [401, 451],
    [403, 451],
  ])('maps handoff status %i to SMTP %s', async (status, code) => {
    const { deps } = makeDeps({ handoff: { status } });
    const r = await handleData(eml(), session(), deps);
    expect(r?.code ?? null).toBe(code);
  });

  it('refuses an over-size stream with 552 5.3.4 and never calls the API', async () => {
    const { deps, api } = makeDeps();
    const r = await handleData(Buffer.alloc(0), session({ sizeExceeded: true }), deps);
    expect(r).toMatchObject({ code: 552, text: expect.stringMatching(/^5\.3\.4/) });
    expect(api.handoff).not.toHaveBeenCalled();
  });

  it('rejects 550 5.7.1 when sender authentication fails, without a handoff', async () => {
    const { deps, api } = makeDeps({
      auth: async () => ({ ...PASSING_AUTH, spf: 'fail', dkim: [], dmarc: { result: 'fail', policy: 'reject' } }),
    });
    const r = await handleData(eml(), session(), deps);
    expect(r).toMatchObject({ code: 550, text: expect.stringMatching(/^5\.7\.1/) });
    expect(api.handoff).not.toHaveBeenCalled();
  });

  it('asks the sender to retry (451) when the DNS-based auth check throws', async () => {
    const { deps, api } = makeDeps({
      auth: async () => {
        throw new Error('dns down');
      },
    });
    const r = await handleData(eml(), session(), deps);
    expect(r?.code).toBe(451);
    expect(api.handoff).not.toHaveBeenCalled();
  });

  it('hands off once per distinct recipient and retries the whole mail if any is transient', async () => {
    const { deps, api } = makeDeps({ handoff: (t) => (t === TOKEN2 ? { status: 503 } : { status: 202 }) });
    const r = await handleData(
      eml(),
      session({ recipients: [`${TOKEN}@in.ai-budget.pl`, `${TOKEN2}@in.ai-budget.pl`, `${TOKEN.toUpperCase()}+a@in.ai-budget.pl`] }),
      deps,
    );
    expect(api.handoff).toHaveBeenCalledTimes(2);
    expect(r?.code).toBe(451);
  });

  it('a dead recipient does not bounce a message that another recipient accepted', async () => {
    const { deps } = makeDeps({ handoff: (t) => (t === TOKEN2 ? { status: 404 } : { status: 202 }) });
    const r = await handleData(
      eml(),
      session({ recipients: [`${TOKEN}@in.ai-budget.pl`, `${TOKEN2}@in.ai-budget.pl`] }),
      deps,
    );
    expect(r).toBeNull();
  });

  it('answers 550 when no recipient is ours (defence in depth)', async () => {
    const { deps, api } = makeDeps();
    const r = await handleData(eml(), session({ recipients: ['x@gmail.com'] }), deps);
    expect(r?.code).toBe(550);
    expect(api.handoff).not.toHaveBeenCalled();
  });

  it('never logs bodies, subjects or full tokens', async () => {
    const lines: string[] = [];
    const log = {
      info: (m: string, f?: object) => lines.push(JSON.stringify({ m, ...f })),
      warn: (m: string, f?: object) => lines.push(JSON.stringify({ m, ...f })),
      error: (m: string, f?: object) => lines.push(JSON.stringify({ m, ...f })),
    };
    const { deps } = makeDeps();
    await handleData(eml(), session(), { ...deps, log });
    await handleRcptTo(`${TOKEN}@in.ai-budget.pl`, '1.1.1.1', 0, { ...deps, log });
    const all = lines.join('\n');
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain('Your receipt');
    expect(all).not.toContain('Total 10 PLN');
    expect(all).not.toContain('orders@shop.example');
  });
});

describe('Semaphore', () => {
  it('never runs more than max tasks at once', async () => {
    const gate = new Semaphore(2);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        gate.run(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active--;
        }),
      ),
    );
    expect(peak).toBe(2);
  });
});

describe('Semaphore wake-up (ABA-644 audit L3)', () => {
  it('re-checks its limit after a wake-up: a caller that grabs the slot first cannot push it over max', async () => {
    const gate = new Semaphore(1);
    let active = 0;
    let peak = 0;
    const task = async (): Promise<void> => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    };
    const first = gate.run(task);
    const waiting = gate.run(task); // queued behind `first`
    await first;
    // `first` has released and woken `waiting`; a new caller arrives before it resumes.
    const intruder = gate.run(task);
    await Promise.all([waiting, intruder]);
    expect(peak).toBe(1);
  });
});

describe('handleData: authenticate + parse deadline (ABA-644 audit M3)', () => {
  it('answers 451 and releases the slot when parsing never finishes', async () => {
    const { deps } = makeDeps();
    deps.deadlineMs = 50;
    deps.extract = () => new Promise(() => undefined);
    const r = await handleData(eml(), session(), deps);
    expect(r).toMatchObject({ code: 451 });
    // The gate is free again: a normal message goes through on the same deps.
    deps.extract = undefined;
    expect(await handleData(eml(), session(), deps)).toBeNull();
  });

  it('answers 451 when authentication hangs past the deadline', async () => {
    const { deps } = makeDeps({ auth: () => new Promise(() => undefined) });
    deps.deadlineMs = 50;
    expect(await handleData(eml(), session(), deps)).toMatchObject({ code: 451 });
  });

  it('answers 451 (not 550) when the worker reports a parse timeout', async () => {
    const { ExtractTimeoutError } = await import('./extractInWorker');
    const { deps } = makeDeps();
    deps.extract = async () => {
      throw new ExtractTimeoutError();
    };
    expect(await handleData(eml(), session(), deps)).toMatchObject({ code: 451 });
  });

  it('passes the RCPT addresses to the extractor', async () => {
    const { deps } = makeDeps();
    const extract = jest.fn(async () => ({ kind: 'receipt', fromAddress: 'a@b.example' }) as never);
    deps.extract = extract;
    await handleData(eml(), session(), deps);
    expect(extract).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ recipients: [`${TOKEN}@in.ai-budget.pl`] }));
  });
});
