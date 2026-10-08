import {
  PenaltyBox,
  combineReplies,
  evaluateAuth,
  mapHandoffOutcome,
  mapRcptOutcome,
  parseRecipient,
  type AuthSummary,
} from './policy';

const DOMAIN = 'in.ai-budget.pl';
const TOKEN = 'abcdefghijklmnop';

describe('parseRecipient', () => {
  it('accepts a valid token, case-insensitively', () => {
    expect(parseRecipient(`${TOKEN}@${DOMAIN}`, DOMAIN)).toEqual({ ok: true, token: TOKEN });
    expect(parseRecipient(`${TOKEN.toUpperCase()}@IN.AI-BUDGET.PL`, DOMAIN)).toEqual({ ok: true, token: TOKEN });
  });

  it('strips +subaddress before matching', () => {
    expect(parseRecipient(`${TOKEN}+paragony@${DOMAIN}`, DOMAIN)).toEqual({ ok: true, token: TOKEN });
  });

  it('refuses any other domain as relaying (550 5.7.1), including the apex', () => {
    for (const a of [`${TOKEN}@ai-budget.pl`, 'x@gmail.com', `${TOKEN}@evil.${DOMAIN}`, `${TOKEN}@${DOMAIN}.evil.com`]) {
      const r = parseRecipient(a, DOMAIN);
      expect(r).toMatchObject({ ok: false, reason: 'foreign_domain', reply: { code: 550 } });
      expect((r as { reply: { text: string } }).reply.text).toMatch(/^5\.7\.1/);
    }
  });

  it('refuses a malformed local part with 550 5.1.1', () => {
    const bad = ['short', 'abcdefghijklmno', 'abcdefghijklmnopq', 'abcdefghijklmn01', 'abcdefghijklmno!', 'ABC-efghijklmnop', ''];
    for (const l of bad) {
      expect(parseRecipient(`${l}@${DOMAIN}`, DOMAIN)).toMatchObject({
        ok: false,
        reason: 'bad_local',
        reply: { code: 550, text: expect.stringMatching(/^5\.1\.1/) },
      });
    }
    expect(parseRecipient('no-at-sign', DOMAIN)).toMatchObject({ ok: false });
  });
});

describe('mapRcptOutcome', () => {
  const cases: Array<[string, { status: number; body?: unknown }, number | null, RegExp | null]> = [
    ['200 accept', { status: 200, body: { result: 'accept' } }, null, null],
    ['200 unknown', { status: 200, body: { result: 'unknown' } }, 550, /^5\.1\.1/],
    ['200 limited', { status: 200, body: { result: 'limited' } }, 452, /^4\.2\.2/],
    ['200 garbage', { status: 200, body: { result: 'wat' } }, 451, /^4\.3\.0/],
    ['200 no body', { status: 200 }, 451, /^4\.3\.0/],
    ['503', { status: 503 }, 451, /^4\.3\.0/],
    ['400', { status: 400 }, 550, null],
    ['401', { status: 401 }, 451, /^4\.3\.0/],
    ['403', { status: 403 }, 451, /^4\.3\.0/],
    ['timeout/network (0)', { status: 0 }, 451, /^4\.3\.0/],
    ['500', { status: 500 }, 451, /^4\.3\.0/],
  ];
  it.each(cases)('%s', (_n, outcome, code, text) => {
    const m = mapRcptOutcome(outcome);
    expect(m.reply?.code ?? null).toBe(code);
    if (text) expect(m.reply?.text).toMatch(text);
  });

  it('flags 401/403 as an operator problem, never a 550', () => {
    for (const s of [401, 403]) {
      const m = mapRcptOutcome({ status: s });
      expect(m.operatorProblem).toBe(true);
      expect(m.reply?.code).toBe(451);
    }
  });
});

describe('mapHandoffOutcome', () => {
  const cases: Array<[number, number | null]> = [
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
    [500, 451],
    [502, 451],
  ];
  it.each(cases)('API %i -> SMTP %s', (status, code) => {
    expect(mapHandoffOutcome({ status }).reply?.code ?? null).toBe(code);
  });

  it('never answers 550 for an operator problem', () => {
    expect(mapHandoffOutcome({ status: 401 }).operatorProblem).toBe(true);
    expect(mapHandoffOutcome({ status: 403 }).operatorProblem).toBe(true);
  });
});

describe('combineReplies', () => {
  const t = { code: 451, text: '4.3.0 x' };
  const p = { code: 550, text: '5.1.1 x' };
  it('transient beats everything so the sender retries', () => {
    expect(combineReplies([null, t, p])).toBe(t);
  });
  it('success beats a permanent failure for another recipient', () => {
    expect(combineReplies([p, null])).toBeNull();
  });
  it('all permanent returns the first', () => {
    expect(combineReplies([p])).toBe(p);
  });
});

describe('evaluateAuth', () => {
  const base: AuthSummary = {
    spf: 'pass',
    dkim: [{ domain: 'shop.example', result: 'pass' }],
    dmarc: { result: 'pass', policy: 'reject' },
    arc: { result: 'none', sealer: null },
  };

  it('accepts a normal authenticated message', () => {
    expect(evaluateAuth(base).ok).toBe(true);
  });

  it('accepts a Gmail auto-forward: DMARC fail under p=reject but a trusted ARC pass', () => {
    const a: AuthSummary = {
      spf: 'fail',
      dkim: [{ domain: 'shop.example', result: 'pass' }],
      dmarc: { result: 'fail', policy: 'reject' },
      arc: { result: 'pass', sealer: 'google.com' },
    };
    expect(evaluateAuth(a).ok).toBe(true);
  });

  it('accepts a manual forward (SPF pass for the forwarder, p=none)', () => {
    expect(evaluateAuth({ ...base, dkim: [], dmarc: { result: 'fail', policy: 'none' } }).ok).toBe(true);
  });

  it('rejects DMARC fail with p=reject and no ARC', () => {
    const d = evaluateAuth({ ...base, dmarc: { result: 'fail', policy: 'reject' } });
    expect(d).toMatchObject({ ok: false, reason: 'dmarc_fail', reply: { code: 550 } });
  });

  it('rejects DMARC fail with p=quarantine and an untrusted ARC sealer', () => {
    const d = evaluateAuth({
      ...base,
      dmarc: { result: 'fail', policy: 'quarantine' },
      arc: { result: 'pass', sealer: 'evil.example' },
    });
    expect(d.ok).toBe(false);
  });

  it('rejects when neither SPF nor any DKIM passes', () => {
    const d = evaluateAuth({ ...base, spf: 'none', dkim: [{ domain: 'x.example', result: 'fail' }] });
    expect(d).toMatchObject({ ok: false, reason: 'no_spf_or_dkim_pass' });
  });

  it('accepts SPF pass alone, or one DKIM pass alone', () => {
    expect(evaluateAuth({ ...base, dkim: [] }).ok).toBe(true);
    expect(evaluateAuth({ ...base, spf: 'softfail' }).ok).toBe(true);
  });
});

describe('PenaltyBox', () => {
  it('boxes an IP after N bad recipients inside the window, then releases it', () => {
    let now = 0;
    const box = new PenaltyBox(3, 1000, 5000, () => now);
    box.record('1.2.3.4');
    box.record('1.2.3.4');
    expect(box.isBoxed('1.2.3.4')).toBe(false);
    box.record('1.2.3.4');
    expect(box.isBoxed('1.2.3.4')).toBe(true);
    expect(box.isBoxed('5.6.7.8')).toBe(false);
    now = 5001;
    expect(box.isBoxed('1.2.3.4')).toBe(false);
  });

  it('forgets hits that fall outside the window', () => {
    let now = 0;
    const box = new PenaltyBox(2, 1000, 5000, () => now);
    box.record('a');
    now = 2000;
    box.record('a');
    expect(box.isBoxed('a')).toBe(false);
  });
});
