import * as fs from 'fs';
import * as path from 'path';
import { detectParser, PARSERS } from './registry';
import { decodeCsvBuffer } from '../utils/encoding';
import { sniffDelimiter } from '../utils/delimiter';
import { peekHeaders, peekSampleRows } from '../utils/csv-preview';
import { parseGermanAmount, parseGermanDate } from './german-common';
import { suggestCategoryFromMerchantDE } from '../merchants/merchants-de';

/**
 * German bank exports (ABA-843). The fixtures follow real exports published by
 * open-source importers (RechnungsFee, beancount-dkb, Firefly III configs),
 * with names and IBANs replaced, and keep each bank's encoding, BOM, quoting,
 * line endings and metadata lines, because those are what break detection.
 *
 * Detection runs the way `ImportBankService.parsePreview` does: decode the
 * bytes, sniff the delimiter, then detect from the first line plus three
 * sample rows.
 */
const load = (name: string) =>
  decodeCsvBuffer(fs.readFileSync(path.join(__dirname, '__fixtures__', name)), 'auto');

function detect(text: string) {
  const delimiter = sniffDelimiter(text);
  return detectParser(peekHeaders(text, delimiter), peekSampleRows(text, 3, delimiter));
}

function parseFixture(name: string) {
  const text = load(name);
  const parser = detect(text);
  return { parser, rows: parser ? parser.parse(text).rows : [] };
}

describe('German bank detection', () => {
  it.each([
    ['sparkasse-camt.csv', 'sparkasse'],
    ['sparkasse-mt940.csv', 'sparkasse'],
    ['volksbank.csv', 'volksbank'],
    ['dkb.csv', 'dkb'],
    ['dkb-legacy.csv', 'dkb'],
    ['ing-de.csv', 'ing-de'],
    ['ing-de-2019.csv', 'ing-de'],
    ['comdirect.csv', 'comdirect'],
    ['commerzbank.csv', 'commerzbank'],
    ['n26.csv', 'n26'],
    ['n26-old.csv', 'n26'],
  ])('%s → %s', (file, id) => {
    expect(detect(load(file))?.id).toBe(id);
  });

  it.each(['mbank.csv', 'pko.csv', 'ing.csv', 'millennium.csv', 'pekao.csv', 'revolut.csv', 'monefy.csv', 'wallet.csv'])(
    'no German parser claims the existing %s fixture',
    (file) => {
      const text = load(file);
      const delimiter = sniffDelimiter(text);
      const headers = peekHeaders(text, delimiter);
      const sample = peekSampleRows(text, 3, delimiter);
      const german = PARSERS.filter((p) =>
        ['sparkasse', 'volksbank', 'dkb', 'ing-de', 'comdirect', 'commerzbank', 'n26'].includes(p.id),
      );
      expect(german.filter((p) => p.detect(headers, sample)).map((p) => p.id)).toEqual([]);
    },
  );
});

describe('SparkasseParser', () => {
  it('reads CAMT rows, skips the pending one, and keeps thousands and two-digit years', () => {
    const { rows } = parseFixture('sparkasse-camt.csv');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: 'expense', amount: 5.95, date: '2025-12-05', currencyCode: 'EUR', merchant: 'Sparkasse' });
    expect(rows[1]).toMatchObject({ amount: 1143.41, merchant: 'REWE Markt GmbH', suggestedCategoryName: 'Groceries' });
    expect(rows[2]).toMatchObject({ kind: 'income', amount: 2500, description: 'Lohn/Gehalt 11/2025', merchant: 'Muster GmbH' });
  });

  it('reads the MT940 variant', () => {
    const { rows } = parseFixture('sparkasse-mt940.csv');
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'expense', amount: 29.9, date: '2025-12-04', merchant: 'Fitness Studio' }),
    ]);
  });
});

describe('VolksbankParser', () => {
  it('cuts the SEPA tail off the purpose and reads amounts without decimals', () => {
    const { rows } = parseFixture('volksbank.csv');
    expect(rows[0]).toMatchObject({
      kind: 'expense',
      amount: 453.11,
      date: '2025-12-01',
      merchant: 'Versicherung AG',
      description: '40-059254925/Lebensversicherung',
    });
    expect(rows[1]).toMatchObject({ kind: 'income', amount: 600, description: 'Miete Dezember' });
  });
});

describe('DkbParser', () => {
  it('reads the new format: payee on Ausgang, payer on Eingang, card payee cut at //', () => {
    const { rows } = parseFixture('dkb.csv');
    expect(rows).toHaveLength(3); // the Vorgemerkt row is skipped
    expect(rows[0]).toMatchObject({ kind: 'expense', amount: 8.67, date: '2025-12-08', merchant: 'EDEKA', suggestedCategoryName: 'Groceries' });
    expect(rows[1]).toMatchObject({ kind: 'income', amount: 200, merchant: 'Max Mustermann', description: 'Nebenkosten' });
    expect(rows[2]).toMatchObject({ kind: 'expense', amount: 1450, merchant: 'Vermieter GmbH' });
  });

  it('reads the legacy format from an ISO-8859-1 file', () => {
    const { rows } = parseFixture('dkb-legacy.csv');
    expect(rows).toEqual([
      expect.objectContaining({ amount: 15.37, date: '2018-01-16', merchant: 'Mobilfunk Anbieter GmbH', description: 'Mobilfunk' }),
    ]);
  });
});

describe('IngDeParser', () => {
  it('skips the metadata, drops the VISA prefix and reads umlauts from ISO-8859-1', () => {
    const { parser, rows } = parseFixture('ing-de.csv');
    expect(parser?.displayName).toBe('ING Deutschland');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: 'expense', amount: 13.98, date: '2025-12-09', merchant: 'ALDI SUED', suggestedCategoryName: 'Groceries' });
    expect(rows[1]).toMatchObject({ amount: 200, merchant: 'Gerhard Beispiel', description: 'Nebenkosten' });
  });

  it('takes the amount, not the balance, from the 2019 layout with two Währung columns', () => {
    const { rows } = parseFixture('ing-de-2019.csv');
    expect(rows).toEqual([expect.objectContaining({ kind: 'income', amount: 2345.67, currencyCode: 'EUR' })]);
  });
});

describe('ComdirectParser', () => {
  it('pulls the name and purpose out of Buchungstext and skips "offen" rows and the trailer', () => {
    const { rows } = parseFixture('comdirect.csv');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: 'expense', amount: 12999, date: '2022-04-11', merchant: 'Max Mustermann' });
    expect(rows[1]).toMatchObject({
      amount: 23.72,
      merchant: 'PayPal Europe S.a.r.l. et Cie S.C.A',
      description: '82927826268/PP.2722.PP/. , Ihr Einkauf bei',
    });
  });
});

describe('CommerzbankParser', () => {
  it('cuts the SEPA references, drops zero info rows, reads integer amounts', () => {
    const { rows } = parseFixture('commerzbank.csv');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: 'expense', amount: 12.34, description: 'Mail Anbieter GmbH KD-Nr. K12345678' });
    expect(rows[0].merchant).toBeUndefined();
    expect(rows[1]).toMatchObject({ kind: 'income', amount: 4760, date: '2025-01-02' });
  });
});

describe('N26Parser', () => {
  it('reads decimal-point amounts and treats "-" as no reference', () => {
    const { rows } = parseFixture('n26.csv');
    expect(rows[0]).toMatchObject({ kind: 'expense', amount: 21.37, date: '2026-09-05', merchant: 'Cloud Services Inc.', description: 'Cloud Services Inc.' });
    expect(rows[1]).toMatchObject({ kind: 'income', amount: 450, description: 'Rent share' });
  });

  it('reads the old English export', () => {
    const { rows } = parseFixture('n26-old.csv');
    expect(rows).toEqual([expect.objectContaining({ kind: 'expense', amount: 1, merchant: 'ITUNES.COM/BILL' })]);
  });
});

describe('German helpers', () => {
  it('parses two- and four-digit years', () => {
    expect(parseGermanDate('05.12.25')).toBe('2025-12-05');
    expect(parseGermanDate('05.12.2025')).toBe('2025-12-05');
    expect(parseGermanDate('offen')).toBe('');
  });

  it('parses amounts with €, thousands dots and missing decimals', () => {
    expect(parseGermanAmount('4.093,32 €')).toBe(4093.32);
    expect(parseGermanAmount('-1.450')).toBe(-1450);
    expect(parseGermanAmount('-62,3')).toBe(-62.3);
    expect(parseGermanAmount('600')).toBe(600);
  });

  it('matches merchants as whole words only', () => {
    expect(suggestCategoryFromMerchantDE('dm-drogerie markt')).toBe('Health');
    expect(suggestCategoryFromMerchantDE('ADMIRAL Versicherung')).toBeUndefined();
    expect(suggestCategoryFromMerchantDE('Erika Müller')).toBeUndefined();
  });
});
