import {
  PENDING_CONSENT_TTL_MS,
  buildApproveBody,
  buildAuthorizePath,
  pickConsentParams,
  resolvePendingConsent,
  serializePendingConsent,
} from '../consentParams';

const PARAMS = {
  response_type: 'code',
  client_id: 'aba_ci_abc',
  redirect_uri: 'https://app.example.com/cb?x=1&y=2',
  scope: 'expenses:read categories:read',
  state: 'a b&c',
  code_challenge: 'c'.repeat(43),
  code_challenge_method: 'S256',
};

describe('consentParams', () => {
  it('keeps only the OAuth keys and the first value of a repeated key', () => {
    expect(pickConsentParams({ ...PARAMS, client_id: ['first', 'second'], evil: 'x' })).toEqual({
      ...PARAMS,
      client_id: 'first',
    });
  });

  it('round-trips the full query through the authorize path (encoded, nothing lost)', () => {
    const path = buildAuthorizePath(PARAMS);
    expect(path.startsWith('/authorize?')).toBe(true);
    const back = Object.fromEntries(new URLSearchParams(path.slice('/authorize?'.length)));
    expect(back).toEqual(PARAMS);
  });

  it('resumes a fresh stash and discards an expired, future-dated or junk one', () => {
    const now = 1_000_000_000;
    const stash = serializePendingConsent(PARAMS, now);
    expect(resolvePendingConsent(stash, now + 60_000)).toEqual({ status: 'resume', path: buildAuthorizePath(PARAMS) });
    expect(resolvePendingConsent(stash, now + PENDING_CONSENT_TTL_MS + 1)).toEqual({ status: 'discard' });
    expect(resolvePendingConsent(stash, now - 1)).toEqual({ status: 'discard' });
    expect(resolvePendingConsent('not json', now)).toEqual({ status: 'discard' });
    expect(resolvePendingConsent(serializePendingConsent({ scope: 'x' }, now), now)).toEqual({ status: 'discard' });
    expect(resolvePendingConsent(null, now)).toEqual({ status: 'none' });
  });

  describe('resource (RFC 8707)', () => {
    const MCP = 'https://api.ai-budget.pl/mcp';
    const WITH = { ...PARAMS, resource: MCP };

    it('consentParams forwards resource to preview and approve unchanged; absent stays absent', () => {
      expect(pickConsentParams(WITH).resource).toBe(MCP);
      // Never normalized on the client: the server decides what the value means.
      expect(pickConsentParams({ ...PARAMS, resource: ['HTTPS://API.AI-BUDGET.PL/mcp/', 'x'] }).resource).toBe(
        'HTTPS://API.AI-BUDGET.PL/mcp/',
      );
      expect('resource' in pickConsentParams(PARAMS)).toBe(false);

      expect(buildApproveBody(pickConsentParams(WITH), 'allow', ['a1'])).toEqual({
        client_id: PARAMS.client_id,
        redirect_uri: PARAMS.redirect_uri,
        scope: PARAMS.scope,
        state: PARAMS.state,
        code_challenge: PARAMS.code_challenge,
        code_challenge_method: PARAMS.code_challenge_method,
        resource: MCP,
        account_ids: ['a1'],
        decision: 'allow',
      });
      const deny = buildApproveBody(pickConsentParams(PARAMS), 'deny', ['a1']);
      expect('resource' in deny).toBe(false);
      expect('account_ids' in deny).toBe(false);
      expect(buildApproveBody(pickConsentParams(WITH), 'deny', []).resource).toBe(MCP);
    });

    it('survives the sign-in resume (stash → path) unchanged', () => {
      const now = 1_000_000_000;
      const out = resolvePendingConsent(serializePendingConsent(WITH, now), now + 1000);
      expect(out.status).toBe('resume');
      const path = (out as { path: string }).path;
      expect(new URLSearchParams(path.slice('/authorize?'.length)).get('resource')).toBe(MCP);
      expect(buildAuthorizePath(PARAMS)).not.toContain('resource');
    });
  });
});
