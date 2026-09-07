import { SETTINGS_FORM_MAX_WIDTH } from '@/features/settings/settingsRegistry';
import { paneChildCapStyle } from '../PaneChildWidth';

describe('paneChildCapStyle', () => {
  it('caps and centers at the settings form width on desktop', () => {
    expect(paneChildCapStyle(true)).toEqual({
      width: '100%',
      maxWidth: SETTINGS_FORM_MAX_WIDTH,
      alignSelf: 'center',
    });
  });

  it('reuses SETTINGS_FORM_MAX_WIDTH rather than a second number', () => {
    expect(paneChildCapStyle(true)?.maxWidth).toBe(720);
  });

  it('applies no cap off desktop', () => {
    expect(paneChildCapStyle(false)).toBeUndefined();
  });
});
