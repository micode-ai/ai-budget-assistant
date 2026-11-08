import { classifySharedText, buildSharedTextPrefill } from '../sharedTextCapture';

const NOW = new Date('2026-11-08T10:00:00Z');

describe('classifySharedText', () => {
  it('parses a card-payment SMS', () => {
    const r = classifySharedText('Platnosc karta 45,90 PLN Biedronka Warszawa. Saldo 1 000,00 PLN', NOW);
    expect(r.kind).toBe('parsed');
    if (r.kind === 'parsed') {
      expect(r.amount).toBeCloseTo(45.9);
      expect(r.currencyCode).toBe('PLN');
    }
  });

  it('rejects a promo text (percentage, no spend wording)', () => {
    expect(classifySharedText('Kredyt gotowkowy RRSO 8,99%. Sprawdz oferte!', NOW).kind).toBe('not_spend');
  });

  it('rejects a declined transaction', () => {
    expect(classifySharedText('Transakcja odrzucona: 20,00 PLN Allegro', NOW).kind).toBe('not_spend');
  });

  it('sends a long e-mail body to AI instead of the push parser', () => {
    const body = 'Payment of 12.50 EUR to Shop. ' + 'x'.repeat(1100);
    expect(classifySharedText(body, NOW).kind).toBe('needs_ai');
  });
});

describe('buildSharedTextPrefill', () => {
  it('always marks the source and omits empty fields', () => {
    expect(buildSharedTextPrefill({})).toEqual({ source: 'notification' });
  });
  it('stringifies for route params', () => {
    const p = buildSharedTextPrefill({ amount: 12.5, currencyCode: 'EUR', date: NOW, merchant: 'Shop' });
    expect(p).toMatchObject({ amount: '12.5', currencyCode: 'EUR', merchant: 'Shop', date: NOW.toISOString() });
  });
});
