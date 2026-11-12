import { assertScopesAllowedForClient, defaultScopesForClient } from './oauth-scope-policy';
import { InvalidScopeError, PUBLIC_SCOPES } from './oauth-scopes';
import { MCP_DEFAULT_SCOPES } from './mcp.config';

const dcr = { source: 'mcp_dcr' as const };
const manual = { source: 'manual' as const };

describe('oauth scope policy', () => {
  it('mcp_dcr may hold the five read scopes', () => {
    expect(() => assertScopesAllowedForClient(dcr, [...MCP_DEFAULT_SCOPES])).not.toThrow();
  });

  it('mcp_dcr + expenses:write throws InvalidScopeError', () => {
    expect(() => assertScopesAllowedForClient(dcr, ['expenses:read', 'expenses:write'])).toThrow(
      InvalidScopeError
    );
  });

  it('mcp_dcr + receipts:read throws InvalidScopeError', () => {
    expect(() => assertScopesAllowedForClient(dcr, ['receipts:read'])).toThrow(InvalidScopeError);
  });

  it('every write scope is refused for mcp_dcr', () => {
    for (const s of PUBLIC_SCOPES.filter((x) => x.endsWith(':write'))) {
      expect(() => assertScopesAllowedForClient(dcr, [s])).toThrow(InvalidScopeError);
    }
  });

  it('a manual client is unrestricted', () => {
    expect(() => assertScopesAllowedForClient(manual, [...PUBLIC_SCOPES])).not.toThrow();
  });

  it('defaults: the five read scopes for mcp_dcr (a fresh copy), null for manual', () => {
    const d = defaultScopesForClient(dcr)!;
    expect(d).toEqual([...MCP_DEFAULT_SCOPES]);
    d.push('expenses:write');
    expect(defaultScopesForClient(dcr)).toHaveLength(5);
    expect(defaultScopesForClient(manual)).toBeNull();
  });
});
