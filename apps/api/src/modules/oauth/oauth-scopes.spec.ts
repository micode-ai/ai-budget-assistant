import { parseScopeParam, InvalidScopeError, PUBLIC_SCOPES } from './oauth-scopes';

describe('parseScopeParam', () => {
  it('splits, dedups and keeps order', () => {
    expect(parseScopeParam('expenses:read  receipts:read expenses:read')).toEqual(['expenses:read', 'receipts:read']);
  });
  it('throws on unknown scope', () => {
    expect(() => parseScopeParam('expenses:admin')).toThrow(InvalidScopeError);
  });
  it('throws on empty', () => {
    expect(() => parseScopeParam('')).toThrow(InvalidScopeError);
    expect(() => parseScopeParam('   ')).toThrow(InvalidScopeError);
  });
  it('lists the four scopes', () => {
    expect(PUBLIC_SCOPES).toEqual(['expenses:read', 'expenses:write', 'receipts:read', 'categories:read']);
  });
});
