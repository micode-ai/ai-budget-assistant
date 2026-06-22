import { Platform } from 'react-native';
import {
  DESKTOP_MIN_WIDTH,
  CONTENT_MAX_WIDTH,
  SIDEBAR_WIDTH,
  isDesktopWeb,
} from '../webLayout.constants';

describe('webLayout constants', () => {
  it('exposes the agreed dimensions', () => {
    expect(DESKTOP_MIN_WIDTH).toBe(1024);
    expect(CONTENT_MAX_WIDTH).toBe(1080);
    expect(SIDEBAR_WIDTH).toBe(240);
  });
});

describe('isDesktopWeb', () => {
  const original = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  });

  it('is false on native regardless of width', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    expect(isDesktopWeb(1920)).toBe(false);
  });

  it('is false on narrow web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    expect(isDesktopWeb(800)).toBe(false);
  });

  it('is true on wide web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    expect(isDesktopWeb(1024)).toBe(true);
    expect(isDesktopWeb(1600)).toBe(true);
  });
});
