import { buildShieldSharePayload, buildShieldShareMessage } from '../shieldShare';
import type { InflationShieldResponse } from '@budget/shared-types';

const DATA: InflationShieldResponse = {
  baseCurrency: 'PLN',
  items: [
    { canonicalName: 'Masło', monthlyChangePct: 12, currentPrice: 5.9, projectedPrice: 6.5, quantity: 2, projectedSaving: 0.6, store: 'Lidl', currencyOriginal: 'PLN', affordableToday: true },
  ],
  basketMonthlyForecastPct: 3.4,
  totalProjectedSaving: 8,
  savedSoFar: 42,
  hasEnoughData: true,
  fxApproximate: false,
  computedAt: '2026-07-16T00:00:00Z',
};

// Fake i18n + money: `t` echoes "key|param1=val1" so tests assert composition, not translations.
const t = (k: string, p?: Record<string, unknown>) =>
  p ? `${k}|${Object.entries(p).map(([a, b]) => `${a}=${b}`).join(',')}` : k;

describe('buildShieldSharePayload', () => {
  it('returns null when there is not enough data', () => {
    expect(buildShieldSharePayload({ ...DATA, hasEnoughData: false }, { hideAmounts: false, money: String, t })).toBeNull();
  });

  it('builds title, saved/basket/item/total lines, and a footer', () => {
    const p = buildShieldSharePayload(DATA, { hideAmounts: false, money: (n) => `${n}zł`, t })!;
    expect(p.title).toBe('inflationShield.shareTitle');
    expect(p.footer).toBe('inflationShield.shareCta');
    const labels = p.lines.map((l) => l.label);
    expect(labels.some((l) => l.startsWith('inflationShield.shareSaved') && l.includes('42zł'))).toBe(true);
    expect(labels.some((l) => l.startsWith('inflationShield.shareBasket') && l.includes('3.4'))).toBe(true);
    expect(labels.some((l) => l.startsWith('inflationShield.shareItem') && l.includes('Masło') && l.includes('0.6zł'))).toBe(true);
    expect(labels.some((l) => l.startsWith('inflationShield.shareTotal') && l.includes('8zł'))).toBe(true);
  });

  it('masks monetary amounts but KEEPS inflation percentages visible when hideAmounts is set', () => {
    // "Hide amounts" masks money figures (savedSoFar/projectedSaving/total) via the
    // injected `money` masker; the basket forecast (3.4%) and per-item rising % (12%)
    // are inflation RATES, not personal money amounts, so they stay visible — masking
    // them ("+•••%") would reveal nothing personal and break the card's story.
    const money = (_n: number) => '•••'; // caller passes a masking money when hideAmounts
    const p = buildShieldSharePayload(DATA, { hideAmounts: true, money, t })!;
    const joined = p.lines.map((l) => l.label).join(' ');
    expect(joined).toContain('•••');
    expect(joined).not.toContain('42');  // savedSoFar masked
    expect(joined).not.toContain('0.6'); // projectedSaving masked
    expect(joined).toContain('3.4');     // basket forecast % stays visible
    expect(joined).toContain('12');      // per-item rising % stays visible
  });
});

describe('buildShieldShareMessage', () => {
  it('returns a newline-joined text with the same content, or "" below the data threshold', () => {
    expect(buildShieldShareMessage({ ...DATA, hasEnoughData: false }, { hideAmounts: false, money: String, t })).toBe('');
    const msg = buildShieldShareMessage(DATA, { hideAmounts: false, money: (n) => `${n}zł`, t });
    expect(msg).toContain('inflationShield.shareTitle');
    expect(msg).toContain('42zł');
    expect(msg).toContain('inflationShield.shareCta');
    expect(msg.split('\n').length).toBeGreaterThan(2);
  });
});
