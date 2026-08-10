import { resolveMapperInitialState } from '../resolveMapperInitialState';
import type { BankImportPreviewResponse } from '@budget/shared-types';

const HEADERS = ['Data operacji', 'Kwota', 'Opis operacji'];

describe('resolveMapperInitialState', () => {
  it('falls back to positional headers and today\'s literal defaults with no preview at all', () => {
    const out = resolveMapperInitialState(null, HEADERS);
    expect(out).toEqual({
      dateCol: 'Data operacji',
      splitDebitCredit: false,
      amountCol: 'Kwota',
      debitCol: '',
      creditCol: '',
      descCol: 'Opis operacji',
      currencyCol: '',
      counterpartyCol: '',
      delimiter: ';',
      encoding: 'auto',
      amountFormat: 'polish',
      dateFormat: 'auto',
    });
  });

  it('falls back the same way when preview carries headers but no AI mapping (the consent-decline case)', () => {
    // needs_ai_consent never carries aiMapping — declining happens BEFORE any
    // inference has run, so there is nothing to pre-fill from.
    const preview: Partial<BankImportPreviewResponse> = { headers: HEADERS };
    const out = resolveMapperInitialState(preview, HEADERS);
    expect(out.dateCol).toBe('Data operacji');
    expect(out.amountCol).toBe('Kwota');
    expect(out.descCol).toBe('Opis operacji');
    expect(out.delimiter).toBe(';');
    expect(out.amountFormat).toBe('polish');
    expect(out.dateFormat).toBe('auto');
  });

  it('seeds every column AND the parse context from an AI-inferred single-amount mapping', () => {
    const preview: Partial<BankImportPreviewResponse> = {
      aiMapping: { date: 'Data operacji', amount: 'Kwota', description: 'Opis operacji', currency: 'Waluta' },
      delimiter: ',',
      amountFormat: 'standard',
      dateFormat: 'DD.MM.YYYY',
    };
    const out = resolveMapperInitialState(preview, HEADERS);
    expect(out).toEqual({
      dateCol: 'Data operacji',
      splitDebitCredit: false,
      amountCol: 'Kwota',
      debitCol: '',
      creditCol: '',
      descCol: 'Opis operacji',
      currencyCol: 'Waluta',
      counterpartyCol: '',
      delimiter: ',',
      encoding: 'auto',
      amountFormat: 'standard',
      dateFormat: 'DD.MM.YYYY',
    });
  });

  it('seeds a debit/credit split and toggles splitDebitCredit on', () => {
    const preview: Partial<BankImportPreviewResponse> = {
      aiMapping: { date: 'Data', amount: { debit: 'Winien', credit: 'Ma' }, description: 'Opis' },
    };
    const out = resolveMapperInitialState(preview, HEADERS);
    expect(out.splitDebitCredit).toBe(true);
    expect(out.debitCol).toBe('Winien');
    expect(out.creditCol).toBe('Ma');
    // amountCol still falls back positionally (headers[1]) — harmless, since
    // the single-amount picker isn't rendered while splitDebitCredit is true;
    // this mirrors the pre-existing (unchanged) fallback behavior exactly.
    expect(out.amountCol).toBe('Kwota');
  });

  it('never resolves undefined into a column value', () => {
    const preview: Partial<BankImportPreviewResponse> = {
      aiMapping: { date: 'Data', amount: 'Kwota', description: 'Opis' }, // no currency/counterparty
    };
    const out = resolveMapperInitialState(preview, []);
    expect(out.currencyCol).toBe('');
    expect(out.counterpartyCol).toBe('');
  });

  it('falls back to \';\' / \'polish\' / \'auto\' individually when only some parse-context fields are present', () => {
    const preview: Partial<BankImportPreviewResponse> = {
      aiMapping: { date: 'Data', amount: 'Kwota', description: 'Opis' },
      delimiter: '\t',
      // amountFormat/dateFormat intentionally omitted
    };
    const out = resolveMapperInitialState(preview, HEADERS);
    expect(out.delimiter).toBe('\t');
    expect(out.amountFormat).toBe('polish');
    expect(out.dateFormat).toBe('auto');
  });
});
