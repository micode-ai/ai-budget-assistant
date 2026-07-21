import type { ThemeColors } from './colors';

export interface HSL {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function hexToHsl(hex: string): HSL {
  const int = parseInt(hex.slice(1), 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: HSL): string {
  const hn = (h % 360) / 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (sn === 0) {
    r = g = b = ln;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    r = hue2rgb(p, q, hn + 1 / 3);
    g = hue2rgb(p, q, hn);
    b = hue2rgb(p, q, hn - 1 / 3);
  }
  const toHex = (x: number): string =>
    Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function relativeLuminance(hex: string): number {
  const int = parseInt(hex.slice(1), 16);
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((int >> 16) & 255);
  const g = channel((int >> 8) & 255);
  const b = channel(int & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function readableOn(hex: string): string {
  return relativeLuminance(hex) > 0.4 ? '#1A1D26' : '#FFFFFF';
}

function adjustL(hex: string, delta: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, l: clamp(hsl.l + delta, 0, 100) });
}

/**
 * Derives brand-token overrides from a single accent color. Surfaces, text,
 * and borders come from the light/dark base and are NOT touched here.
 * The on-accent foreground (textInverse, messageBubbleUserText) is chosen by
 * luminance so buttons and chat bubbles stay legible for any accent.
 */
export function deriveAccentColors(
  base: ThemeColors,
  accentHex: string,
  isDark: boolean,
): Partial<ThemeColors> {
  const { h, s } = hexToHsl(accentHex);
  const onAccent = readableOn(accentHex);
  const primaryDark = isDark ? adjustL(accentHex, 14) : adjustL(accentHex, -12);
  const primaryLight = isDark
    ? hslToHex({ h, s: clamp(s, 0, 55), l: 14 })
    : hslToHex({ h, s: clamp(s, 0, 70), l: 93 });
  const accentToken = adjustL(accentHex, isDark ? 10 : 12);
  const textLink = isDark
    ? accentHex
    : relativeLuminance(accentHex) > 0.4
      ? adjustL(accentHex, -18)
      : accentHex;
  return {
    primary: accentHex,
    primaryDark,
    primaryLight,
    secondary: accentHex,
    accent: accentToken,
    textLink,
    tabBarActive: accentHex,
    messageBubbleUser: accentHex,
    textInverse: onAccent,
    messageBubbleUserText: onAccent,
  };
}
