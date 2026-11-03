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
  it('lists all the scopes', () => {
    expect(PUBLIC_SCOPES).toEqual([
      'expenses:read',
      'expenses:write',
      'receipts:read',
      'categories:read',
      'incomes:read',
      'incomes:write',
      'budgets:read',
      'budgets:write',
      'analytics:read',
    ]);
  });
  it('accepts the phase 2 scopes in order', () => {
    expect(
      parseScopeParam('incomes:read incomes:write budgets:read budgets:write analytics:read'),
    ).toEqual(['incomes:read', 'incomes:write', 'budgets:read', 'budgets:write', 'analytics:read']);
  });
  it('rejects analytics:write', () => {
    expect(() => parseScopeParam('analytics:write')).toThrow(InvalidScopeError);
  });
});
