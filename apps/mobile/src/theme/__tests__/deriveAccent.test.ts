import { hexToHsl, hslToHex, relativeLuminance, readableOn, deriveAccentColors } from '../deriveAccent';
import { lightColors, darkColors } from '../colors';

describe('hex <-> hsl', () => {
  it('round-trips clean colors within 1 unit', () => {
    for (const hex of ['#3B82F6', '#E37F2B', '#10B981', '#EC4899']) {
      const back = hslToHex(hexToHsl(hex));
      // allow ±1 per channel from rounding
      const a = parseInt(hex.slice(1), 16);
      const b = parseInt(back.slice(1), 16);
      const dr = Math.abs(((a >> 16) & 255) - ((b >> 16) & 255));
      const dg = Math.abs(((a >> 8) & 255) - ((b >> 8) & 255));
      const db = Math.abs((a & 255) - (b & 255));
      expect(Math.max(dr, dg, db)).toBeLessThanOrEqual(1);
    }
  });

  it('parses white and black', () => {
    expect(hexToHsl('#FFFFFF').l).toBeGreaterThan(99);
    expect(hexToHsl('#000000').l).toBeLessThan(1);
  });
});

describe('readableOn', () => {
  it('returns dark text on light backgrounds', () => {
    expect(readableOn('#FFFFFF')).toBe('#1A1D26');
    expect(readableOn('#FFD54A')).toBe('#1A1D26');
  });
  it('returns white text on dark backgrounds', () => {
    expect(readableOn('#000000')).toBe('#FFFFFF');
    expect(readableOn('#E37F2B')).toBe('#FFFFFF'); // current orange keeps white text
    expect(readableOn('#3B82F6')).toBe('#FFFFFF');
  });
});

describe('deriveAccentColors', () => {
  it('sets primary to the accent and picks a readable on-accent foreground', () => {
    const out = deriveAccentColors(lightColors, '#3B82F6', false);
    expect(out.primary).toBe('#3B82F6');
    expect(out.tabBarActive).toBe('#3B82F6');
    expect(out.messageBubbleUser).toBe('#3B82F6');
    expect(out.textInverse).toBe('#FFFFFF');
    expect(out.messageBubbleUserText).toBe('#FFFFFF');
  });

  it('uses dark on-accent text for a light accent', () => {
    const out = deriveAccentColors(lightColors, '#FFD54A', false);
    expect(out.textInverse).toBe('#1A1D26');
  });

  it('darkens primaryDark in light mode and lightens it in dark mode', () => {
    const accent = '#3B82F6';
    const accentL = hexToHsl(accent).l;
    const light = deriveAccentColors(lightColors, accent, false);
    const dark = deriveAccentColors(darkColors, accent, true);
    expect(hexToHsl(light.primaryDark!).l).toBeLessThan(accentL);
    expect(hexToHsl(dark.primaryDark!).l).toBeGreaterThan(accentL);
  });

  it('only returns brand tokens (no surfaces/borders)', () => {
    const out = deriveAccentColors(lightColors, '#3B82F6', false);
    expect(out.background).toBeUndefined();
    expect(out.border).toBeUndefined();
    expect(out.textPrimary).toBeUndefined();
  });
});
