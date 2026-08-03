/**
 * ABA-387: auto-capture turned non-transaction bank-app notifications into expenses.
 *
 * Real production rows this guards against (account 2338d07b…, source 'notification'):
 *   5.32 USD  merchant "The Past 2 Hours. It's Now"   <- a Revolut price alert
 *   5.28/5.29/5.40 USD  same shape
 *   8.16/9.72/11.47/13.28 USD  no merchant at all
 *
 * The app allow-lists bank *packages*, not bank *notifications*, so any push from an
 * allow-listed app that merely contained a number and a currency symbol became an
 * expense — a percentage in a price alert read as the amount and "$" as the currency.
 */
import { extractAmount, extractAmountSigned, hasSpendIntent, parseGeneric } from '../generic';

describe('extractAmount — percentages are not amounts', () => {
  it('skips a percentage and takes the real amount that follows', () => {
    expect(extractAmount("Bitcoin is up 5.32% in the past 2 hours. It's now $59,123.45")).toBe(59123.45);
  });

  it('returns null when every number in the text is a percentage', () => {
    expect(extractAmount('Kredyt gotowkowy 5,99% RRSO 7,25%')).toBeNull();
  });

  it('still reads a plain amount', () => {
    expect(extractAmount('Payment 12,34 EUR')).toBe(12.34);
  });
});

describe('extractAmountSigned', () => {
  it('reports an explicit debit sign', () => {
    expect(extractAmountSigned('Karta ****1234: -12,34 EUR ALBERT HEIJN')).toEqual({ value: 12.34, negative: true });
  });

  it('reports an unsigned amount as not negative', () => {
    expect(extractAmountSigned('Saldo 1 234,56 PLN')).toEqual({ value: 1234.56, negative: false });
  });
});

describe('hasSpendIntent', () => {
  it.each([
    'You paid $9.99 at Spotify',
    'Spent £50.00 at Amazon',
    'Obciazenie karty 45,00 PLN',
    'Płatność kartą 75,50 PLN',
    'Zahlung 20,00 EUR',
    'Pago de 15,00 EUR',
    'Оплата 500,00 RUB',
    'Списание 1 000,00 RUB',
  ])('accepts %s', (text) => {
    expect(hasSpendIntent(text)).toBe(true);
  });

  it.each([
    "Bitcoin is up 5.32% in the past 2 hours. It's now $59,123.45",
    'Your balance is now $8.16',
    'EUR/PLN rate alert: 4,32',
  ])('rejects %s', (text) => {
    expect(hasSpendIntent(text)).toBe(false);
  });
});

describe('parseGeneric — non-transaction notifications create nothing', () => {
  it('returns null for a crypto price alert (the production 5.32 USD row)', () => {
    expect(parseGeneric('Bitcoin', "Bitcoin is up 5.32% in the past 2 hours. It's now $59,123.45")).toBeNull();
  });

  it('returns null for a balance update with no spend wording', () => {
    expect(parseGeneric('Revolut', 'Your USD balance is now $8.16')).toBeNull();
  });

  it('returns null for a rate alert', () => {
    expect(parseGeneric('Revolut', 'EUR/PLN rate alert: 4,32 PLN')).toBeNull();
  });
});

describe('parseGeneric — real debits still parse', () => {
  it('accepts a spend-keyword push and extracts the merchant', () => {
    expect(parseGeneric('Revolut', 'You paid $9.99 at Spotify')).toEqual({
      amount: 9.99,
      currencyCode: 'USD',
      merchant: 'Spotify',
    });
  });

  it('accepts a terse signed debit with no keyword at all', () => {
    expect(parseGeneric('Karta ****1234', '-12,34 EUR ALBERT HEIJN')).toMatchObject({
      amount: 12.34,
      currencyCode: 'EUR',
    });
  });

  it('still refuses to guess a currency', () => {
    expect(parseGeneric('Karta', 'Payment 12,34')).toBeNull();
  });
});
