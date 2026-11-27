import { sanitizeFromRoute } from '../openSupport';
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));


describe('sanitizeFromRoute', () => {
  it('keeps a route pattern unchanged', () => {
    expect(sanitizeFromRoute('help/index')).toBe('help/index');
    expect(sanitizeFromRoute('expense/[id]')).toBe('expense/[id]');
    expect(sanitizeFromRoute('(tabs)/chat')).toBe('(tabs)/chat');
  });

  it('drops a resolved path carrying an id', () => {
    expect(sanitizeFromRoute('expense/3f2b9c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f')).toBeUndefined();
    expect(sanitizeFromRoute('budget/12345')).toBeUndefined();
  });

  it('drops free text and anything too long', () => {
    expect(sanitizeFromRoute('me@example.com')).toBeUndefined();
    expect(sanitizeFromRoute('a b')).toBeUndefined();
    expect(sanitizeFromRoute('x'.repeat(101))).toBeUndefined();
    expect(sanitizeFromRoute(undefined)).toBeUndefined();
    expect(sanitizeFromRoute('')).toBeUndefined();
  });

  it('takes the first value of a repeated param', () => {
    expect(sanitizeFromRoute(['settings', 'other'])).toBe('settings');
  });
});
