import { validateMappingResponse, validateExtractedRows } from './statement-ai.validator';

const HEADERS = ['Data operacji', 'Kwota', 'Opis operacji', 'Waluta', 'Kontrahent'];

const ok = JSON.stringify({
  date: 'Data operacji',
  amount: 'Kwota',
  description: 'Opis operacji',
  currency: 'Waluta',
  counterparty: 'Kontrahent',
  amountFormat: 'polish',
  dateFormat: 'auto',
  bankLabel: 'mBank',
});

describe('validateMappingResponse', () => {
  it('accepts a response whose columns all exist', () => {
    expect(validateMappingResponse(ok, HEADERS)).toEqual({
      mapping: {
        date: 'Data operacji',
        amount: 'Kwota',
        description: 'Opis operacji',
        currency: 'Waluta',
        counterparty: 'Kontrahent',
      },
      amountFormat: 'polish',
      dateFormat: 'auto',
      bankLabel: 'mBank',
    });
  });

  it('accepts a split debit/credit amount mapping', () => {
    const raw = JSON.stringify({
      date: 'Data operacji',
      amount: { debit: 'Kwota', credit: 'Waluta' },
      description: 'Opis operacji',
      amountFormat: 'polish',
      dateFormat: 'auto',
    });
    expect(validateMappingResponse(raw, HEADERS)?.mapping.amount).toEqual({
      debit: 'Kwota',
      credit: 'Waluta',
    });
  });

  it('REJECTS a column name that is not in headers', () => {
    const raw = JSON.stringify({
      date: 'Transaction Date', // invented
      amount: 'Kwota',
      description: 'Opis operacji',
      amountFormat: 'polish',
      dateFormat: 'auto',
    });
    expect(validateMappingResponse(raw, HEADERS)).toBeNull();
  });

  it('REJECTS an invented column inside a split amount mapping', () => {
    const raw = JSON.stringify({
      date: 'Data operacji',
      amount: { debit: 'Kwota', credit: 'Credit Amount' },
      description: 'Opis operacji',
      amountFormat: 'polish',
      dateFormat: 'auto',
    });
    expect(validateMappingResponse(raw, HEADERS)).toBeNull();
  });

  it('REJECTS an invented optional column rather than dropping it', () => {
    const raw = JSON.stringify({
      date: 'Data operacji',
      amount: 'Kwota',
      description: 'Opis operacji',
      currency: 'Currency',
      amountFormat: 'polish',
      dateFormat: 'auto',
    });
    expect(validateMappingResponse(raw, HEADERS)).toBeNull();
  });

  it('rejects a missing required field', () => {
    const raw = JSON.stringify({ date: 'Data operacji', amount: 'Kwota', amountFormat: 'polish', dateFormat: 'auto' });
    expect(validateMappingResponse(raw, HEADERS)).toBeNull();
  });

  it('rejects an unknown amountFormat or dateFormat', () => {
    const badAmountFormat = JSON.stringify({
      date: 'Data operacji', amount: 'Kwota', description: 'Opis operacji',
      amountFormat: 'martian', dateFormat: 'auto',
    });
    expect(validateMappingResponse(badAmountFormat, HEADERS)).toBeNull();

    const badDateFormat = JSON.stringify({
      date: 'Data operacji', amount: 'Kwota', description: 'Opis operacji',
      amountFormat: 'polish', dateFormat: 'DD/MM/YY',
    });
    expect(validateMappingResponse(badDateFormat, HEADERS)).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(validateMappingResponse('not json at all', HEADERS)).toBeNull();
  });

  it('tolerates a fenced code block around the JSON', () => {
    expect(validateMappingResponse('```json\n' + ok + '\n```', HEADERS)).not.toBeNull();
  });

  it('matches header names exactly, not case-insensitively', () => {
    const raw = JSON.stringify({
      date: 'data operacji', amount: 'Kwota', description: 'Opis operacji',
      amountFormat: 'polish', dateFormat: 'auto',
    });
    expect(validateMappingResponse(raw, HEADERS)).toBeNull();
  });

  it('rejects non-object JSON payloads (array or bare string)', () => {
    expect(validateMappingResponse('[]', HEADERS)).toBeNull();
    expect(validateMappingResponse('"str"', HEADERS)).toBeNull();
  });

  it('fails closed against an empty headers array — nothing can be known', () => {
    const raw = JSON.stringify({
      date: 'Data operacji', amount: 'Kwota', description: 'Opis operacji',
      amountFormat: 'polish', dateFormat: 'auto',
    });
    expect(validateMappingResponse(raw, [])).toBeNull();
  });

  it('treats an explicit null in an optional field as absent, not as an invented column', () => {
    const raw = JSON.stringify({
      date: 'Data operacji',
      amount: 'Kwota',
      description: 'Opis operacji',
      currency: null,
      counterparty: null,
      amountFormat: 'polish',
      dateFormat: 'auto',
    });
    const result = validateMappingResponse(raw, HEADERS);
    expect(result).not.toBeNull();
    expect(result?.mapping.currency).toBeUndefined();
    expect(result?.mapping.counterparty).toBeUndefined();
    expect('currency' in (result?.mapping ?? {})).toBe(false);
    expect('counterparty' in (result?.mapping ?? {})).toBe(false);
  });

  it('trims bankLabel and caps it at 64 characters', () => {
    const raw = JSON.stringify({
      date: 'Data operacji',
      amount: 'Kwota',
      description: 'Opis operacji',
      amountFormat: 'polish',
      dateFormat: 'auto',
      bankLabel: '  ' + 'a'.repeat(200) + '  ',
    });
    const result = validateMappingResponse(raw, HEADERS);
    expect(result?.bankLabel).toHaveLength(64);
    expect(result?.bankLabel).toBe('a'.repeat(64));
  });

  it('trims surrounding whitespace from a normal-length bankLabel', () => {
    const raw = JSON.stringify({
      date: 'Data operacji',
      amount: 'Kwota',
      description: 'Opis operacji',
      amountFormat: 'polish',
      dateFormat: 'auto',
      bankLabel: '  mBank  ',
    });
    expect(validateMappingResponse(raw, HEADERS)?.bankLabel).toBe('mBank');
  });
});

describe('validateExtractedRows', () => {
  it('keeps well-formed rows', () => {
    const raw = JSON.stringify({
      rows: [
        { date: '2026-01-15', amount: -50.5, currencyCode: 'PLN', description: 'Biedronka' },
        { date: '2026-01-16', amount: 1200, currencyCode: 'PLN', description: 'Salary' },
      ],
    });
    expect(validateExtractedRows(raw)).toHaveLength(2);
  });

  it('drops rows with an unparseable date', () => {
    const raw = JSON.stringify({ rows: [{ date: 'last tuesday', amount: -5, currencyCode: 'PLN', description: 'x' }] });
    expect(validateExtractedRows(raw)).toEqual([]);
  });

  it('drops rows with a non-finite amount', () => {
    const raw = JSON.stringify({ rows: [{ date: '2026-01-15', amount: 'a lot', currencyCode: 'PLN', description: 'x' }] });
    expect(validateExtractedRows(raw)).toEqual([]);
  });

  it('drops rows with a malformed currency code', () => {
    const raw = JSON.stringify({ rows: [{ date: '2026-01-15', amount: -5, currencyCode: 'zloty', description: 'x' }] });
    expect(validateExtractedRows(raw)).toEqual([]);
  });

  it('drops a row with a well-formed but unsupported currency code (no FX rate exists for it)', () => {
    const raw = JSON.stringify({ rows: [{ date: '2026-01-15', amount: -5, currencyCode: 'CHF', description: 'x' }] });
    expect(validateExtractedRows(raw)).toEqual([]);
  });

  it('keeps rows for every currently supported currency code', () => {
    // Mirrors the full `Currency` union in packages/shared-types/src/entities/primitives.ts —
    // BYN included (it was omitted from an earlier stale draft of this list).
    for (const code of ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN']) {
      const raw = JSON.stringify({ rows: [{ date: '2026-01-15', amount: -5, currencyCode: code, description: 'x' }] });
      expect(validateExtractedRows(raw)).toHaveLength(1);
    }
  });

  it('drops a row with a lowercase currency code', () => {
    const raw = JSON.stringify({ rows: [{ date: '2026-01-15', amount: -5, currencyCode: 'pln', description: 'x' }] });
    expect(validateExtractedRows(raw)).toEqual([]);
  });

  it('returns an empty array for malformed JSON', () => {
    expect(validateExtractedRows('{{{')).toEqual([]);
  });

  it('trims a merchant value', () => {
    const raw = JSON.stringify({
      rows: [{ date: '2026-01-15', amount: -5, currencyCode: 'PLN', description: 'x', merchant: '  Biedronka  ' }],
    });
    expect(validateExtractedRows(raw)[0].merchant).toBe('Biedronka');
  });

  it('keeps a row with an empty description but a real merchant', () => {
    const raw = JSON.stringify({
      rows: [{ date: '2026-01-15', amount: -5, currencyCode: 'PLN', description: '', merchant: 'Biedronka' }],
    });
    const rows = validateExtractedRows(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0].merchant).toBe('Biedronka');
  });

  it('drops a row with neither a description nor a merchant', () => {
    const raw = JSON.stringify({
      rows: [{ date: '2026-01-15', amount: -5, currencyCode: 'PLN', description: '', merchant: '   ' }],
    });
    expect(validateExtractedRows(raw)).toEqual([]);
  });

  it('omits the merchant key entirely when no merchant was supplied, rather than emitting merchant: undefined', () => {
    const raw = JSON.stringify({
      rows: [{ date: '2026-01-15', amount: -5, currencyCode: 'PLN', description: 'Biedronka' }],
    });
    const [row] = validateExtractedRows(raw);
    expect('merchant' in row).toBe(false);
    expect(Object.keys(row).sort()).toEqual(['amount', 'currencyCode', 'date', 'description']);
  });

  it('returns an empty array when the model drops the {rows:...} wrapper and replies with a bare array', () => {
    const raw = JSON.stringify([{ date: '2026-01-15', amount: -5, currencyCode: 'PLN', description: 'x' }]);
    expect(validateExtractedRows(raw)).toEqual([]);
  });
});
