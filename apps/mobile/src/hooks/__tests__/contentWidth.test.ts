import { Platform } from 'react-native';
import { contentWidthFor } from '../useContentWidth';
import { CONTENT_MAX_WIDTH, COLUMN_HORIZONTAL_PADDING } from '../../components/webLayout.constants';

describe('contentWidthFor', () => {
  const original = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  });

  it('returns the window width on native (mobile unchanged)', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    expect(contentWidthFor(412)).toBe(412);
  });

  it('returns the window width on narrow web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    expect(contentWidthFor(800)).toBe(800);
  });

  it('returns the padded column width on desktop web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    expect(contentWidthFor(1600)).toBe(CONTENT_MAX_WIDTH - COLUMN_HORIZONTAL_PADDING * 2);
  });
});
