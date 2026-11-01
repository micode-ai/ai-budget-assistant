export const PUBLIC_SCOPES = ['expenses:read', 'expenses:write', 'receipts:read', 'categories:read'] as const;
export type PublicScope = (typeof PUBLIC_SCOPES)[number];

export class InvalidScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidScopeError';
  }
}

/** Parses a space-separated scope param: dedups (order kept), rejects unknown or empty. */
export function parseScopeParam(raw: string): PublicScope[] {
  const parts = (raw ?? '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new InvalidScopeError('scope is required');
  const out: PublicScope[] = [];
  for (const p of parts) {
    if (!(PUBLIC_SCOPES as readonly string[]).includes(p)) throw new InvalidScopeError(`unknown scope: ${p}`);
    if (!out.includes(p as PublicScope)) out.push(p as PublicScope);
  }
  return out;
}
