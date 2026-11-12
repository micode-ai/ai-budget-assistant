import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  InvalidTargetError,
  assertClientResource,
  assertResourceMatches,
  parseResourceParam,
} from './oauth-resource.util';
import {
  DCR_ALLOWED_SCOPES,
  MCP_DEFAULT_SCOPES,
  isMcpEnabled,
  mcpResourceUrl,
  oauthAuthorizeUrl,
  oauthIssuer,
} from './mcp.config';

const cfg = (env: Record<string, string | undefined>): ConfigService =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;
const ON = { PUBLIC_API_ENABLED: 'true', MCP_ENABLED: 'true' };
const MCP = 'https://api.ai-budget.pl/mcp';

describe('mcp.config', () => {
  it('defaults', () => {
    const c = cfg({});
    expect(mcpResourceUrl(c)).toBe(MCP);
    expect(oauthIssuer(c)).toBe('https://api.ai-budget.pl');
    expect(oauthAuthorizeUrl(c)).toBe('https://app.ai-budget.pl/authorize');
  });

  it('env values are normalized (trailing slash, host case)', () => {
    const c = cfg({
      MCP_RESOURCE_URL: ' HTTPS://Staging.Example.com/mcp/ ',
      OAUTH_ISSUER: 'https://staging.example.com/',
    });
    expect(mcpResourceUrl(c)).toBe('https://staging.example.com/mcp');
    expect(oauthIssuer(c)).toBe('https://staging.example.com');
  });

  it('an invalid env URL falls back to the default and logs ONE warning (name only, not per call)', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const c = cfg({
        MCP_RESOURCE_URL: 'not a url',
        OAUTH_ISSUER: 'ftp://issuer.example.com',
        OAUTH_AUTHORIZE_URL: 'https://x.example.com/a#frag',
      });
      for (let i = 0; i < 3; i++) {
        expect(mcpResourceUrl(c)).toBe(MCP);
        expect(oauthIssuer(c)).toBe('https://api.ai-budget.pl');
        expect(oauthAuthorizeUrl(c)).toBe('https://app.ai-budget.pl/authorize');
      }
      expect(warn).toHaveBeenCalledTimes(3);
      const messages = warn.mock.calls.map((c) => String(c[0]));
      for (const name of ['MCP_RESOURCE_URL', 'OAUTH_ISSUER', 'OAUTH_AUTHORIZE_URL']) {
        expect(messages.filter((m) => m.includes(name))).toHaveLength(1);
      }
    } finally {
      warn.mockRestore();
    }
  });

  it('an unset or valid env URL logs nothing', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      mcpResourceUrl(cfg({}));
      oauthIssuer(cfg({ OAUTH_ISSUER: 'https://ok.example.com' }));
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('isMcpEnabled needs both flags', () => {
    expect(isMcpEnabled(cfg(ON))).toBe(true);
    expect(isMcpEnabled(cfg({ PUBLIC_API_ENABLED: 'true', MCP_ENABLED: ' TRUE ' }))).toBe(true);
    expect(isMcpEnabled(cfg({ PUBLIC_API_ENABLED: 'true' }))).toBe(false);
    expect(isMcpEnabled(cfg({ MCP_ENABLED: 'true' }))).toBe(false);
    expect(isMcpEnabled(cfg({ PUBLIC_API_ENABLED: 'true', MCP_ENABLED: '1' }))).toBe(false);
  });

  it('default and allowed scopes are the five read scopes', () => {
    const five = [
      'expenses:read',
      'categories:read',
      'incomes:read',
      'budgets:read',
      'analytics:read',
    ];
    expect([...MCP_DEFAULT_SCOPES]).toEqual(five);
    expect([...DCR_ALLOWED_SCOPES]).toEqual(five);
  });
});

describe('parseResourceParam', () => {
  it('absent or empty → null', () => {
    expect(parseResourceParam(undefined, cfg(ON))).toBeNull();
    expect(parseResourceParam('', cfg(ON))).toBeNull();
    expect(parseResourceParam('   ', cfg(ON))).toBeNull();
    // even with MCP off: no resource is the existing public API
    expect(parseResourceParam(undefined, cfg({}))).toBeNull();
  });

  it('exact, trailing-slash and case variants → exactly the configured URL', () => {
    for (const raw of [
      MCP,
      `${MCP}/`,
      ` ${MCP} `,
      'HTTPS://API.AI-BUDGET.PL/mcp',
      'https://api.ai-budget.pl:443/mcp',
    ]) {
      expect(parseResourceParam(raw, cfg(ON))).toBe(MCP);
    }
  });

  it('a custom MCP_RESOURCE_URL is what gets returned', () => {
    const c = cfg({ ...ON, MCP_RESOURCE_URL: 'https://staging.example.com/mcp/' });
    expect(parseResourceParam('https://staging.example.com/mcp', c)).toBe(
      'https://staging.example.com/mcp'
    );
    expect(() => parseResourceParam(MCP, c)).toThrow(InvalidTargetError);
  });

  it('anything else → InvalidTargetError', () => {
    for (const raw of [
      'https://api.ai-budget.pl/public',
      'https://api.ai-budget.pl/public/v2',
      'https://api.ai-budget.pl/public/v1/expenses',
      'http://api.ai-budget.pl/public/v1',
      'https://evil.example.com/public/v1',
      'https://api.ai-budget.pl/MCP',
      'https://evil.example.com/mcp',
      'http://api.ai-budget.pl/mcp',
      `${MCP}#x`,
      `${MCP}?a=1`,
      'not a url',
      'urn:x',
    ]) {
      expect(() => parseResourceParam(raw, cfg(ON))).toThrow(InvalidTargetError);
    }
  });

  it('R10: the public API identifiers (issuer, issuer/public/v1, normalized) → null, MCP on or off', () => {
    for (const c of [cfg(ON), cfg({ PUBLIC_API_ENABLED: 'true' })]) {
      for (const raw of [
        'https://api.ai-budget.pl',
        'https://api.ai-budget.pl/',
        'HTTPS://API.AI-BUDGET.PL',
        'https://api.ai-budget.pl/public/v1',
        'https://api.ai-budget.pl/public/v1/',
        ' https://API.ai-budget.pl:443/public/v1 ',
      ]) {
        expect(parseResourceParam(raw, c)).toBeNull();
      }
    }
  });

  it('R10: a custom OAUTH_ISSUER is the public identifier, the default host is not', () => {
    const c = cfg({ ...ON, OAUTH_ISSUER: 'https://staging.example.com/' });
    expect(parseResourceParam('https://staging.example.com/public/v1', c)).toBeNull();
    expect(parseResourceParam('https://staging.example.com', c)).toBeNull();
    expect(() => parseResourceParam('https://api.ai-budget.pl/public/v1', c)).toThrow(InvalidTargetError);
  });

  it('the MCP resource is refused while MCP is off', () => {
    expect(() => parseResourceParam(MCP, cfg({ PUBLIC_API_ENABLED: 'true' }))).toThrow(
      InvalidTargetError
    );
  });
});

describe('assertResourceMatches', () => {
  const c = cfg(ON);
  it('absent request resource never fails', () => {
    expect(() => assertResourceMatches(undefined, null, c)).not.toThrow();
    expect(() => assertResourceMatches(undefined, MCP, c)).not.toThrow();
  });

  it('a matching (normalized) resource passes', () => {
    expect(() => assertResourceMatches(`${MCP}/`, MCP, c)).not.toThrow();
  });

  it('a resource against a public-API binding, or a different one, is InvalidTargetError', () => {
    expect(() => assertResourceMatches(MCP, null, c)).toThrow(InvalidTargetError);
    expect(() => assertResourceMatches('https://evil.example.com/mcp', MCP, c)).toThrow(
      InvalidTargetError
    );
    expect(() => assertResourceMatches('garbage', MCP, c)).toThrow(InvalidTargetError);
    expect(() => assertResourceMatches('https://api.ai-budget.pl/public/v2', null, c)).toThrow(
      InvalidTargetError
    );
  });

  it('R10: a public API identifier matches the null binding and only it', () => {
    for (const raw of ['https://api.ai-budget.pl', 'https://api.ai-budget.pl/public/v1/', 'HTTPS://API.AI-BUDGET.PL/public/v1']) {
      expect(() => assertResourceMatches(raw, null, c)).not.toThrow();
      expect(() => assertResourceMatches(raw, MCP, c)).toThrow(InvalidTargetError);
    }
  });
});

describe('assertClientResource (ruling R4)', () => {
  it('a registered assistant (mcp_dcr) without a resource is InvalidTargetError', () => {
    expect(() => assertClientResource({ source: 'mcp_dcr' }, null)).toThrow(InvalidTargetError);
  });
  it('a registered assistant bound to the MCP resource passes', () => {
    expect(() => assertClientResource({ source: 'mcp_dcr' }, MCP)).not.toThrow();
  });
  it('a manual client may go without a resource (the public API)', () => {
    expect(() => assertClientResource({ source: 'manual' }, null)).not.toThrow();
    expect(() => assertClientResource({ source: 'manual' }, MCP)).not.toThrow();
  });
});
