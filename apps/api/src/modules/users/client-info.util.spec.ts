import { parseClientInfo } from './client-info.util';

describe('parseClientInfo (ABA-813)', () => {
  it('accepts the native and web version shapes', () => {
    expect(parseClientInfo({ 'x-app-version': '1.42.0 (123)', 'x-app-platform': 'android' })).toEqual({
      appVersion: '1.42.0 (123)',
      appPlatform: 'android',
    });
    expect(parseClientInfo({ 'x-app-version': '1.42.0+abc1234', 'x-app-platform': 'WEB' })?.appPlatform).toBe('web');
    expect(parseClientInfo({ 'x-app-version': '1.42.0', 'x-app-platform': 'ios' })?.appVersion).toBe('1.42.0');
  });

  it('drops anything else instead of storing client input', () => {
    expect(parseClientInfo({ 'x-app-version': '<script>', 'x-app-platform': 'web' })).toBeNull();
    expect(parseClientInfo({ 'x-app-version': '1.42.0', 'x-app-platform': 'windows' })).toBeNull();
    expect(parseClientInfo({ 'x-app-version': '1.42.0' })).toBeNull();
    expect(parseClientInfo(undefined)).toBeNull();
  });
});
