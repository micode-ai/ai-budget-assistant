/**
 * Unit tests for the generic notification parser and the dispatch logic.
 *
 * The generic parser is a pure function with no native deps, so these tests
 * run directly in Node without RN mocks.
 *
 * Run: npx jest apps/mobile/src/services/__tests__/notificationParser.test.ts
 */

import { parseGeneric, extractAmount, extractCurrency } from '../notificationParser/generic';
import { parseNotification } from '../notificationParser/index';

// ---------------------------------------------------------------------------
// extractAmount
// ---------------------------------------------------------------------------
describe('extractAmount', () => {
  it('handles European comma-decimal with space thousands: "1 234,56"', () => {
    expect(extractAmount('Zapłacono 1 234,56 zł w Lidl')).toBeCloseTo(1234.56);
  });

  it('handles European comma-decimal without thousands: "89,99"', () => {
    expect(extractAmount('Płatność 89,99 PLN')).toBeCloseTo(89.99);
  });

  it('handles European dot-thousands comma-decimal: "1.234,56"', () => {
    expect(extractAmount('Betrag: 1.234,56 EUR')).toBeCloseTo(1234.56);
  });

  it('handles Anglo dot-decimal with comma thousands: "1,234.56"', () => {
    expect(extractAmount('You paid $1,234.56 at Amazon')).toBeCloseTo(1234.56);
  });

  it('handles Anglo dot-decimal without thousands: "12.99"', () => {
    expect(extractAmount('Spent £12.99 at Tesco')).toBeCloseTo(12.99);
  });

  it('returns null when there is no number with decimal', () => {
    expect(extractAmount('Your OTP is 123456')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractAmount('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractCurrency
// ---------------------------------------------------------------------------
describe('extractCurrency', () => {
  it('detects € symbol → EUR (supported)', () => {
    const r = extractCurrency('Betrag: 12,34 €');
    expect(r).not.toBeNull();
    if (r) {
      expect(r.code).toBe('EUR');
      expect(r.supported).toBe(true);
    }
  });

  it('detects zł → PLN (supported)', () => {
    const r = extractCurrency('Płatność 50,00 zł');
    expect(r).not.toBeNull();
    if (r) {
      expect(r.code).toBe('PLN');
      expect(r.supported).toBe(true);
    }
  });

  it('detects ₴ → UAH (supported)', () => {
    const r = extractCurrency('Списано 500,00 ₴');
    expect(r).not.toBeNull();
    if (r) {
      expect(r.code).toBe('UAH');
      expect(r.supported).toBe(true);
    }
  });

  it('detects £ → GBP (supported)', () => {
    const r = extractCurrency("£12.99 at Sainsbury's");
    expect(r).not.toBeNull();
    if (r) {
      expect(r.code).toBe('GBP');
      expect(r.supported).toBe(true);
    }
  });

  it('detects BYN ISO code (supported)', () => {
    const r = extractCurrency('Аплата 34,00 BYN');
    expect(r).not.toBeNull();
    if (r) {
      expect(r.code).toBe('BYN');
      expect(r.supported).toBe(true);
    }
  });

  it('detects CHF → supported=false', () => {
    const r = extractCurrency('CHF 120.00 at Migros');
    expect(r).not.toBeNull();
    if (r) {
      expect(r.code).toBe('CHF');
      expect(r.supported).toBe(false);
    }
  });

  it('returns null when no currency token present', () => {
    expect(extractCurrency('Payment at Tesco')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseGeneric — happy-path country formats
// ---------------------------------------------------------------------------
describe('parseGeneric', () => {

  // German "bei" connector
  it('parses a German Sparkasse-style notification (EUR, bei connector)', () => {
    const result = parseGeneric(
      'Kartenzahlung',
      'Zahlung von 45,99 € bei Rewe Supermarkt erfolgt.',
    );
    expect(result).not.toBeNull();
    if (result) {
      expect(result.amount).toBeCloseTo(45.99);
      expect(result.currencyCode).toBe('EUR');
      expect(result.merchant).toBeDefined();
      expect(result.merchant).toMatch(/Rewe/i);
    }
  });

  // French "chez" connector
  it('parses a French BNP-style notification (EUR, chez connector)', () => {
    const result = parseGeneric(
      'Paiement effectué',
      'Vous avez payé 12,50 € chez Monoprix.',
    );
    expect(result).not.toBeNull();
    if (result) {
      expect(result.amount).toBeCloseTo(12.5);
      expect(result.currencyCode).toBe('EUR');
      expect(result.merchant).toMatch(/Monoprix/i);
    }
  });

  // English "at" connector (Revolut-style)
  it('parses an English Revolut-style notification (EUR, at connector)', () => {
    const result = parseGeneric(
      'Payment',
      'You paid €23.00 at Starbucks.',
    );
    expect(result).not.toBeNull();
    if (result) {
      expect(result.amount).toBeCloseTo(23.0);
      expect(result.currencyCode).toBe('EUR');
      expect(result.merchant).toMatch(/Starbucks/i);
    }
  });

  // PLN with pipe separator (common Eastern-European bank format)
  it('parses a Polish-style notification with PLN ISO code', () => {
    const result = parseGeneric(
      'Transakcja',
      'Obciążenie 99,90 PLN | IKEA WARSZAWA',
    );
    expect(result).not.toBeNull();
    if (result) {
      expect(result.amount).toBeCloseTo(99.9);
      expect(result.currencyCode).toBe('PLN');
    }
  });

  // UAH with Cyrillic "у" connector
  it('parses a Ukrainian monobank-style notification (₴ + Cyrillic у)', () => {
    const result = parseGeneric(
      'Переказ',
      'Списано 1 250,00 ₴ у АТБ',
    );
    expect(result).not.toBeNull();
    if (result) {
      expect(result.amount).toBeCloseTo(1250.0);
      expect(result.currencyCode).toBe('UAH');
    }
  });

  // GBP
  it('parses a British-style notification (£ symbol)', () => {
    const result = parseGeneric(
      'Card payment',
      'You spent £34.50 at Marks Spencer.',
    );
    expect(result).not.toBeNull();
    if (result) {
      expect(result.amount).toBeCloseTo(34.5);
      expect(result.currencyCode).toBe('GBP');
    }
  });

  // BYN
  it('parses a Belarusian-style notification (BYN)', () => {
    const result = parseGeneric(
      'Аплата',
      'Спісана 28,00 BYN у краме Евроопт',
    );
    expect(result).not.toBeNull();
    if (result) {
      expect(result.amount).toBeCloseTo(28.0);
      expect(result.currencyCode).toBe('BYN');
    }
  });

  // Non-transaction: OTP / promo — must return null (no decimal amount)
  it('returns null for an OTP notification (no transaction amount)', () => {
    const result = parseGeneric(
      'Код підтвердження',
      'Ваш OTP: 483921. Дійсний 5 хвилин.',
    );
    expect(result).toBeNull();
  });

  // Non-transaction: text without any currency token → null
  it('returns null when text contains no currency token', () => {
    const result = parseGeneric(
      'Special offer',
      'Get 20% off your next purchase. No currency here!',
    );
    // Even if "20" pattern is matched, there is no currency → null
    expect(result).toBeNull();
  });

  // Unsupported currency CHF — must return null and warn
  it('returns null for an unsupported currency (CHF) and emits a console.warn', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parseGeneric(
      'Kartenzahlung',
      'Zahlung CHF 120.00 bei Migros Supermarkt',
    );
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('CHF'));
    warnSpy.mockRestore();
  });

  // Unsupported currency CZK
  it('returns null for CZK (unsupported) and emits a console.warn', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parseGeneric('Platba', 'Zaplaceno 350,00 CZK v Billa');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('CZK'));
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// parseNotification dispatch — generic fallback path
// ---------------------------------------------------------------------------
describe('parseNotification — generic fallback', () => {
  it('uses generic for a non-PL package with no template', () => {
    const result = parseNotification(
      'com.ing.mobile',       // NL ING — no PL template
      'Betaling geslaagd',
      'Je hebt €55,00 betaald bij Albert Heijn.',
      Date.now(),
    );
    expect(result).not.toBeNull();
    if (result) {
      expect(result.amount).toBeCloseTo(55.0);
      expect(result.currencyCode).toBe('EUR');
    }
  });

  it('still uses the PL template when the package has one (PKO BP)', () => {
    const result = parseNotification(
      'pl.pkobp.iko',
      'Płatność kartą',
      'Płatność kartą -75,00 PLN w BIEDRONKA',
      Date.now(),
    );
    expect(result).not.toBeNull();
    if (result) {
      expect(result.amount).toBeCloseTo(75.0);
      expect(result.currencyCode).toBe('PLN');
      // PL template + normalizeMerchantPL should return canonical 'Biedronka'
      expect(result.merchant).toBe('Biedronka');
      expect(result.suggestedCategory).toBe('Groceries');
    }
  });

  it('returns null for an entirely unknown (non-bank) package', () => {
    const result = parseNotification(
      'com.facebook.katana',
      'You have a new message',
      'John sent you a photo.',
      Date.now(),
    );
    // Unknown package → template=undefined → generic runs → no amount/currency → null
    expect(result).toBeNull();
  });
});
