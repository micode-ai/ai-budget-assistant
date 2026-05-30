import * as fs from 'fs';
import * as path from 'path';
import { RevolutParser } from './revolut.parser';

const FIXTURE = fs.readFileSync(path.join(__dirname, '__fixtures__/revolut.csv'), 'utf-8');

describe('RevolutParser', () => {
  const parser = new RevolutParser();

  it('id and displayName', () => {
    expect(parser.id).toBe('revolut');
    expect(parser.displayName).toBe('Revolut');
  });

  describe('detect()', () => {
    it('detects Revolut by Started Date + Completed Date + Balance headers', () => {
      expect(
        parser.detect(['Type', 'Product', 'Started Date', 'Completed Date', 'Description', 'Amount', 'Fee', 'Currency', 'State', 'Balance']),
      ).toBe(true);
    });

    it('returns false for other bank headers', () => {
      expect(parser.detect(['#Data operacji', '#Kwota', '#Opis operacji'])).toBe(false);
      expect(parser.detect(['Data transakcji', 'Dane kontrahenta', 'Kwota transakcji (waluta rachunku)', 'Waluta'])).toBe(false);
      expect(parser.detect(['Data operacji', 'Kwota', 'Typ transakcji'])).toBe(false);
    });
  });

  describe('parse()', () => {
    it('returns detectedHeaders from the CSV header row', () => {
      const { detectedHeaders } = parser.parse(FIXTURE);
      expect(detectedHeaders).toContain('Started Date');
      expect(detectedHeaders).toContain('Amount');
      expect(detectedHeaders).toContain('Currency');
    });

    it('skips DECLINED rows', () => {
      const { rows } = parser.parse(FIXTURE);
      // STARBUCKS row is DECLINED — must not appear
      expect(rows.some((r) => r.description === 'STARBUCKS')).toBe(false);
    });

    it('parses COMPLETED expense row', () => {
      const { rows } = parser.parse(FIXTURE);
      const biedronka = rows.find((r) => r.description === 'BIEDRONKA');
      expect(biedronka).toBeDefined();
      expect(biedronka?.kind).toBe('expense');
      expect(biedronka?.amount).toBe(50);
      expect(biedronka?.date).toBe('2026-01-15');
      expect(biedronka?.currencyCode).toBe('PLN');
      expect(biedronka?.suggestedCategoryName).toBe('Groceries');
    });

    it('parses COMPLETED income row (TOPUP)', () => {
      const { rows } = parser.parse(FIXTURE);
      const topup = rows.find((r) => r.description.startsWith('Top-Up'));
      expect(topup).toBeDefined();
      expect(topup?.kind).toBe('income');
      expect(topup?.amount).toBe(1000);
      expect(topup?.date).toBe('2026-01-16');
      expect(topup?.currencyCode).toBe('PLN');
    });

    it('parses EXCHANGE rows as individual expense/income (pairFxRows handles pairing)', () => {
      const { rows } = parser.parse(FIXTURE);
      // Both EXCHANGE rows are COMPLETED; the parser emits them as expense/income
      // and pairFxRows() in the service will convert them to kind='fx'.
      const fxRows = rows.filter((r) => r.description.startsWith('Exchanged'));
      expect(fxRows).toHaveLength(2);
      const debit = fxRows.find((r) => r.kind === 'expense');
      const credit = fxRows.find((r) => r.kind === 'income');
      expect(debit?.amount).toBe(500);
      expect(debit?.currencyCode).toBe('PLN');
      expect(credit?.amount).toBe(50);
      expect(credit?.currencyCode).toBe('EUR');
    });

    it('parses TRANSFER expense', () => {
      const { rows } = parser.parse(FIXTURE);
      const transfer = rows.find((r) => r.description === 'Jan Kowalski');
      expect(transfer?.kind).toBe('expense');
      expect(transfer?.amount).toBe(200);
      expect(transfer?.date).toBe('2026-01-19');
    });

    it('parses SPOTIFY as subscription expense', () => {
      const { rows } = parser.parse(FIXTURE);
      const spotify = rows.find((r) => r.description === 'SPOTIFY');
      expect(spotify?.kind).toBe('expense');
      expect(spotify?.amount).toBeCloseTo(35.99);
      expect(spotify?.suggestedCategoryName).toBe('Subscriptions');
    });

    it('uses currency per-row from Currency column', () => {
      const { rows } = parser.parse(FIXTURE);
      const eurRow = rows.find((r) => r.currencyCode === 'EUR');
      expect(eurRow).toBeDefined();
    });

    it('total COMPLETED row count is correct (6 of 7, 1 DECLINED skipped)', () => {
      const { rows } = parser.parse(FIXTURE);
      expect(rows).toHaveLength(6);
    });
  });
});
