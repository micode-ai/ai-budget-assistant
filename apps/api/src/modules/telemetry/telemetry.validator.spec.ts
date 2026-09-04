import { sanitizeEvents, isSafeScreen, MAX_EVENTS_PER_BATCH } from './telemetry.validator';

describe('isSafeScreen', () => {
  it('accepts a route pattern, including a dynamic segment and a group', () => {
    expect(isSafeScreen('expense/new')).toBe(true);
    expect(isSafeScreen('expense/[id]')).toBe(true);
    expect(isSafeScreen('(tabs)/index')).toBe(true);
  });

  it('accepts the other shapes real routes in this app actually take', () => {
    // Sampled from apps/mobile/app: an underscore route, a leading slash, a
    // nested path, a kebab segment, a PascalCase file (they exist under app/),
    // and a group with a kebab child. All 116 route names were checked against
    // this rule; these are the distinct shapes among them.
    expect(isSafeScreen('_layout')).toBe(true);
    expect(isSafeScreen('/expense/new')).toBe(true);
    expect(isSafeScreen('settings/import/preview')).toBe(true);
    expect(isSafeScreen('wallet/rate-alerts')).toBe(true);
    expect(isSafeScreen('expense/components/ExpenseDetailsCard')).toBe(true);
    expect(isSafeScreen('(auth)/forgot-password')).toBe(true);
    expect(isSafeScreen('price-history/community')).toBe(true);
  });

  it('rejects a resolved id, which is the leak this rule exists for', () => {
    expect(isSafeScreen('/expense/8f3c1d2e-4a5b-6c7d-8e9f-0a1b2c3d4e5f')).toBe(false);
    expect(isSafeScreen('expense/8f3c1d2e4a5b6')).toBe(false);
    expect(isSafeScreen('expense/12345')).toBe(false);
  });

  it('rejects a UUID whichever nibble it starts with — both cases are here on purpose', () => {
    // The digit-leading one above was passing only via the "must start like a
    // route" gate, which MASKED the real gap: the hyphens in a UUID break the
    // contiguous-hex check, so a UUID beginning with a hex LETTER slipped
    // through entirely. Over 20 000 random UUIDs that was ~37% of them. Both
    // strings stay so neither check can be removed without a failure.
    expect(isSafeScreen('expense/8f3c1d2e-4a5b-6c7d-8e9f-0a1b2c3d4e5f')).toBe(false);
    expect(isSafeScreen('expense/a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
    expect(isSafeScreen('expense/f0000000-0000-0000-0000-000000000000')).toBe(false);
  });

  it('rejects an uppercase-hex UUID, since the shape check is case-insensitive', () => {
    expect(isSafeScreen('expense/A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(false);
    expect(isSafeScreen('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(false);
  });

  it('still accepts the hyphenated route names this app really has', () => {
    // The UUID check must not cost us these: it pins hex-only groups of exactly
    // 8-4-4-4-12, so an ordinary kebab segment cannot match it.
    expect(isSafeScreen('wallet/rate-alerts')).toBe(true);
    expect(isSafeScreen('wallet/set-balance')).toBe(true);
    expect(isSafeScreen('settings/auto-capture')).toBe(true);
    expect(isSafeScreen('(auth)/forgot-password')).toBe(true);
  });

  it('rejects a hex id shorter than the old 13-character floor', () => {
    // The blacklist only fired at 13+, so an ordinary short id sailed through.
    expect(isSafeScreen('expense/8f3c1d2e4a5')).toBe(false);
    expect(isSafeScreen('expense/deadbeefcafe')).toBe(false);
    expect(isSafeScreen('ab12cd34ef56')).toBe(false);
  });

  it('rejects an amount-shaped value — no call site sends one, but the rule must not accept one', () => {
    // The all-digit test used to be per-segment while `.` and `-` were legal
    // inside a segment, so every one of these passed.
    expect(isSafeScreen('1234.56')).toBe(false);
    expect(isSafeScreen('42.50')).toBe(false);
    expect(isSafeScreen('-99.99')).toBe(false);
    expect(isSafeScreen('0.01')).toBe(false);
    expect(isSafeScreen('12345.')).toBe(false);
    expect(isSafeScreen('.12345')).toBe(false);
  });

  it('rejects a dotted merchant string, since no real route name contains a dot', () => {
    expect(isSafeScreen('Lidl.Warszawa')).toBe(false);
  });

  it('DOES accept a bare word-shaped value — the documented limit of shape validation', () => {
    // A single word is indistinguishable from a route segment by shape, so the
    // guarantee is "no id, path, query string or number can land", not "no word
    // can". Pinned as a fact rather than left as a surprise: only the call site
    // (always `getCurrentRoute()?.name`) keeps a merchant name out of here.
    expect(isSafeScreen('Biedronka')).toBe(true);
  });

  it('rejects a query string and anything over-long or oddly punctuated', () => {
    expect(isSafeScreen('expense/new?amount=42.50')).toBe(false);
    expect(isSafeScreen('expense/new;drop')).toBe(false);
    expect(isSafeScreen('a'.repeat(121))).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(isSafeScreen(42)).toBe(false);
    expect(isSafeScreen(null)).toBe(false);
  });
});

describe('sanitizeEvents', () => {
  it('keeps a well-formed event of each allowed name', () => {
    const out = sanitizeEvents([
      { name: 'session_start' },
      { name: 'screen_view', screen: 'expense/new' },
      { name: 'action', props: { flow: 'expense_manual', status: 'completed', ms: 1200 } },
    ]);

    expect(out).toEqual([
      { name: 'session_start', screen: null, props: null },
      { name: 'screen_view', screen: 'expense/new', props: null },
      { name: 'action', screen: null, props: { flow: 'expense_manual', status: 'completed', ms: 1200 } },
    ]);
  });

  it('drops an event name nobody allow-listed', () => {
    expect(sanitizeEvents([{ name: 'expense_amount' }])).toEqual([]);
  });

  it('drops an unknown prop key rather than the whole event', () => {
    const out = sanitizeEvents([
      { name: 'action', props: { flow: 'expense_manual', status: 'completed', amount: 42.5 } },
    ]);

    expect(out[0].props).toEqual({ flow: 'expense_manual', status: 'completed' });
  });

  it('drops an allow-listed key whose value is not one of its enumerated values', () => {
    const out = sanitizeEvents([
      { name: 'action', props: { flow: 'buying_a_boat', status: 'completed' } },
    ]);

    expect(out[0].props).toEqual({ status: 'completed' });
  });

  it('drops a non-finite duration', () => {
    const out = sanitizeEvents([
      { name: 'action', props: { flow: 'expense_manual', status: 'failed', ms: Number.NaN } },
    ]);

    expect(out[0].props).toEqual({ flow: 'expense_manual', status: 'failed' });
  });

  it('drops a screen that fails the shape rule but keeps the event', () => {
    const out = sanitizeEvents([{ name: 'screen_view', screen: '/expense/12345' }]);

    expect(out).toEqual([{ name: 'screen_view', screen: null, props: null }]);
  });

  it('one bad event does not cost the good ones in the same batch', () => {
    const out = sanitizeEvents([
      { name: 'screen_view', screen: 'expense/new' },
      { name: 'nonsense' },
      { name: 'session_start' },
    ]);

    expect(out.map((e) => e.name)).toEqual(['screen_view', 'session_start']);
  });

  it('ignores a payload-supplied userId completely', () => {
    const out = sanitizeEvents([{ name: 'session_start', userId: 'someone-else' }]);

    expect(out[0]).not.toHaveProperty('userId');
  });

  it('caps the batch', () => {
    const many = Array.from({ length: MAX_EVENTS_PER_BATCH + 5 }, () => ({ name: 'session_start' }));

    expect(sanitizeEvents(many)).toHaveLength(MAX_EVENTS_PER_BATCH);
  });

  it('returns an empty list for anything that is not an array', () => {
    expect(sanitizeEvents(null)).toEqual([]);
    expect(sanitizeEvents({ name: 'session_start' })).toEqual([]);
  });
});
