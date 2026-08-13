import { readFileSync } from 'fs';
import { join } from 'path';
import { WalletParser } from './wallet.parser';

const fixture = readFileSync(join(__dirname, '__fixtures__', 'wallet.csv'), 'utf8');
const headers = fixture.split('\n')[0].split(';');

describe('WalletParser', () => {
  const parser = new WalletParser();

  describe('detect', () => {
    it('recognises a Wallet export by its refAmount/type/transfer trio', () => {
      expect(parser.detect(headers, [])).toBe(true);
    });

    it('does not claim an export that merely has category and amount', () => {
      expect(parser.detect(['date', 'account', 'category', 'amount', 'currency', 'description'], [])).toBe(false);
    });

    it('does not claim a bank statement', () => {
      expect(parser.detect(['Started Date', 'Completed Date', 'Balance', 'Amount'], [])).toBe(false);
    });
  });

  describe('parse', () => {
    it('reads the explicit type column rather than inferring from the sign', () => {
      const { rows } = parser.parse(fixture);
      expect(rows.find((r) => r.description === 'Pensja luty')!.kind).toBe('income');
      expect(rows.find((r) => r.description === 'Biedronka')!.kind).toBe('expense');
    });

    it('skips transfers between the user own accounts', () => {
      // A transfer is not spending. Mapping it would need account mapping we do
      // not have, so it is dropped rather than booked as an expense.
      const { rows } = parser.parse(fixture);
      expect(rows.find((r) => r.description === 'ATM')).toBeUndefined();
    });

    it('carries the exporting app own category through', () => {
      const { rows } = parser.parse(fixture);
      expect(rows.find((r) => r.description === 'Biedronka')!.suggestedCategoryName).toBe('Food & Drinks');
    });

    it('keeps the transaction currency, not the base one it was converted to', () => {
      // refAmount/refCurrency are Wallet's own base-currency view. Booking the
      // converted figure would silently restate what the user actually paid.
      const { rows } = parser.parse(fixture);
      const spotify = rows.find((r) => r.description === 'Spotify')!;
      expect(spotify.currencyCode).toBe('EUR');
      expect(spotify.amount).toBe(19.99);
    });

    it('takes the payee as the merchant when there is one', () => {
      const { rows } = parser.parse(fixture);
      expect(rows.find((r) => r.description === 'Biedronka')!.merchant).toBe('Biedronka');
    });

    it('reads the date out of a timestamp', () => {
      const { rows } = parser.parse(fixture);
      expect(rows[0].date).toBe('2024-02-01');
    });

    it('always reports a positive amount', () => {
      const { rows } = parser.parse(fixture);
      expect(rows.every((r) => r.amount > 0)).toBe(true);
    });

    it('reports the detected headers', () => {
      const { detectedHeaders } = parser.parse(fixture);
      expect(detectedHeaders).toEqual(headers);
    });
  });
});
