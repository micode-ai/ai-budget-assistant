/**
 * ABA-387: the spend gate must apply to BOTH parse paths.
 *
 * Six of the eleven per-bank templates (Pekao, Santander, Alior, BNP, Credit Agricole,
 * Nest) use the bare AMOUNT_PATTERN_PL, which matches any decimal number anywhere in
 * the push — so a loan ad ("RRSO 8,99%") or a balance update was booked as an expense
 * exactly like the Revolut price alerts that reached production.
 */
import { parseNotification } from '../index';

const POSTED = new Date(2026, 6, 20, 12, 0, 0).getTime();

describe('parseNotification — non-transaction pushes from allow-listed banks', () => {
  it('rejects a loan ad from a bare-amount template bank', () => {
    expect(
      parseNotification('pl.bzwbk.bzwbk24', 'Oferta specjalna', 'Kredyt gotowkowy z RRSO 8,99%! Sprawdz szczegoly w aplikacji.', POSTED),
    ).toBeNull();
  });

  it('rejects a balance update', () => {
    expect(parseNotification('pl.bzwbk.bzwbk24', 'Saldo', 'Saldo Twojego konta: 1 234,56 PLN', POSTED)).toBeNull();
  });

  it('rejects a declined transaction', () => {
    expect(
      parseNotification('eu.eleader.mobilebanking.pekao', 'Transakcja odrzucona', 'Transakcja 100,00 PLN zostala odrzucona - brak srodkow', POSTED),
    ).toBeNull();
  });

  it('rejects the Revolut price alert that produced the phantom 5.32 USD expense', () => {
    expect(
      parseNotification('com.revolut.revolut', 'Bitcoin', "Bitcoin is up 5.32% in the past 2 hours. It's now $59,123.45", POSTED),
    ).toBeNull();
  });
});

describe('parseNotification — real debits still parse', () => {
  it('parses a PKO BP card debit', () => {
    const r = parseNotification('pl.pkobp.iko', 'Obciazenie karty', 'Kwota: 2,70 PLN.\nMiejsce: ZABKA ZB817 K.2, GDANSK.', POSTED);
    expect(r).toMatchObject({ amount: 2.7, currencyCode: 'PLN' });
    expect(r?.merchant).toMatch(/abka/i);
  });

  it('parses an mBank card debit', () => {
    expect(parseNotification('pl.mbank', 'mBank', 'Obciazenie -50,00 PLN | ZABKA 1234', POSTED)).toMatchObject({
      amount: 50,
      currencyCode: 'PLN',
    });
  });

  it('parses a Santander card transaction from a bare-amount template', () => {
    expect(parseNotification('pl.bzwbk.bzwbk24', 'Transakcja karta', 'Transakcja karta 45,00 PLN ZABKA', POSTED)).toMatchObject({
      amount: 45,
      currencyCode: 'PLN',
    });
  });

  it('parses a Revolut purchase', () => {
    expect(parseNotification('com.revolut.revolut', 'Revolut', 'You paid $9.99 at Spotify', POSTED)).toMatchObject({
      amount: 9.99,
      currencyCode: 'USD',
      merchant: 'Spotify',
    });
  });

  it('parses a terse signed debit from an untemplated bank', () => {
    expect(parseNotification('nl.abnamro.nl.mobile.payments', 'Betaalpas', '-12,34 EUR ALBERT HEIJN', POSTED)).toMatchObject({
      amount: 12.34,
      currencyCode: 'EUR',
    });
  });
});
