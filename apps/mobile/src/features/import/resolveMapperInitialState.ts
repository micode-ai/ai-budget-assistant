import type { BankImportPreviewResponse } from '@budget/shared-types';

export type MapperAmountFormat = 'polish' | 'standard';
export type MapperDateFormat = 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
export type MapperEncoding = 'auto' | 'utf-8' | 'windows-1250';

export interface MapperInitialState {
  dateCol: string;
  splitDebitCredit: boolean;
  amountCol: string;
  debitCol: string;
  creditCol: string;
  descCol: string;
  currencyCol: string;
  counterpartyCol: string;
  delimiter: string;
  encoding: MapperEncoding;
  amountFormat: MapperAmountFormat;
  dateFormat: MapperDateFormat;
}

/**
 * The mapper's starting column and format selections.
 *
 * When `preview` carries an AI-inferred mapping — the "Wrong? Tap to fix"
 * chip row on a parsed preview, or the zero-rows-parsed fallback — its
 * columns AND the parse context that produced it (the sniffed delimiter, the
 * model's amount/date format guesses) seed the pickers. Without the parse
 * context, re-opening the mapper on an AI-inferred preview would silently
 * fall back to the mapper's own hardcoded defaults (`;` / `polish` / `auto`),
 * discarding a comma- or tab-delimited file's real delimiter and re-parsing
 * to zero rows — the exact bug this closes.
 *
 * Falls back to today's literals — and to positional `headers[0..2]` for the
 * three required columns — when no AI context is present: a manual mapping
 * from the bank picker, or the `needs_ai_consent` decline path, where NO
 * inference has run yet (`preview.aiMapping` is unset — declining happens
 * BEFORE consent, so there is nothing to pre-fill from).
 */
export function resolveMapperInitialState(
  preview: Pick<BankImportPreviewResponse, 'aiMapping' | 'delimiter' | 'amountFormat' | 'dateFormat'> | null | undefined,
  headers: string[],
): MapperInitialState {
  const ai = preview?.aiMapping;
  const aiAmount = typeof ai?.amount === 'string' ? ai.amount : undefined;
  const aiDebit = typeof ai?.amount === 'object' ? ai.amount.debit : undefined;
  const aiCredit = typeof ai?.amount === 'object' ? ai.amount.credit : undefined;

  return {
    dateCol: ai?.date ?? headers[0] ?? '',
    splitDebitCredit: !!aiDebit,
    amountCol: aiAmount ?? headers[1] ?? '',
    debitCol: aiDebit ?? '',
    creditCol: aiCredit ?? '',
    descCol: ai?.description ?? headers[2] ?? '',
    currencyCol: ai?.currency ?? '',
    counterpartyCol: ai?.counterparty ?? '',
    delimiter: preview?.delimiter ?? ';',
    encoding: 'auto',
    amountFormat: preview?.amountFormat ?? 'polish',
    dateFormat: preview?.dateFormat ?? 'auto',
  };
}
