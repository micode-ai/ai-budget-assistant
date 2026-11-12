import type { OAuthClient } from '@prisma/client';
import { DCR_ALLOWED_SCOPES, MCP_DEFAULT_SCOPES } from './mcp.config';
import { InvalidScopeError, type PublicScope } from './oauth-scopes';

type ClientWithSource = Pick<OAuthClient, 'source'>;

/**
 * A dynamically registered assistant (`mcp_dcr`) is read-only: any scope outside
 * `DCR_ALLOWED_SCOPES` (every `*:write`, and `receipts:read`) is refused. Manual clients are not
 * restricted here.
 */
export function assertScopesAllowedForClient(
  client: ClientWithSource,
  scopes: readonly string[]
): void {
  if (client.source !== 'mcp_dcr') return;
  const outside = scopes.filter((s) => !(DCR_ALLOWED_SCOPES as readonly string[]).includes(s));
  if (outside.length > 0) {
    throw new InvalidScopeError(`scope not allowed for this client: ${outside.join(' ')}`);
  }
}

/** Scopes used when an authorize request names none: the MCP read set for `mcp_dcr`, else null (scope stays required). */
export function defaultScopesForClient(client: ClientWithSource): PublicScope[] | null {
  return client.source === 'mcp_dcr' ? [...MCP_DEFAULT_SCOPES] : null;
}
