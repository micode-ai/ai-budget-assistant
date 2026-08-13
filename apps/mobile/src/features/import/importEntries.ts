/**
 * The rows in Settings → Import transactions → "Quick import".
 *
 * The load-bearing detail is the FIRST entry, which deliberately has no `id`.
 *
 * `pickAndPreview(entry.id)` forwards that id to the server as `bankId`, and an
 * explicit `bankId` short-circuits the server's parser resolution — it looks the
 * parser up and uses it, full stop. The whole AI path (and the bank-picker
 * fallback) lives in the server's `if (!parser)` branch, which is reachable only
 * when NEITHER `bankId` nor `mappingId` was sent. So while every row carried an
 * id, the AI import was unreachable from the app no matter what file you picked
 * — including a statement from a bank we have no parser for, which is the entire
 * case the feature exists to serve.
 *
 * Tapping the auto-detect entry sends nothing, so the server runs its full
 * chain: this account's saved mapping → parser auto-detection → the global
 * signature dictionary → AI inference. That makes it the right default for a
 * supported bank too, not only an unsupported one: a recognised format still
 * resolves to its own hand-written parser.
 *
 * If you add a row here, give it an id only if a parser with that id exists.
 * `importEntries.test.ts` pins the invariant that exactly one entry has none.
 */
export interface ImportEntry {
  /** Parser id sent as `bankId`. Absent on the auto-detect entry, by design. */
  id?: string;
  /** Brand names are not translated. */
  label?: string;
  /** i18n key, for the one entry whose label is a sentence rather than a brand. */
  labelKey?: string;
  /** Icon name; the auto-detect entry gets its own so it doesn't read as a bank. */
  icon: 'sparkles-outline' | 'business-outline' | 'swap-horizontal-outline';
}

export const IMPORT_ENTRIES: ImportEntry[] = [
  { labelKey: 'bankImport.autoDetect', icon: 'sparkles-outline' },
  { id: 'wise', label: 'Wise', icon: 'business-outline' },
  { id: 'mbank', label: 'mBank', icon: 'business-outline' },
  { id: 'pko', label: 'PKO BP', icon: 'business-outline' },
  { id: 'revolut', label: 'Revolut', icon: 'business-outline' },
  { id: 'erste', label: 'Erste Bank (PDF)', icon: 'business-outline' },
  { id: 'alior', label: 'Alior Bank (PDF)', icon: 'business-outline' },
  { id: 'universal', label: 'Other (custom CSV)', icon: 'business-outline' },
];

/**
 * Exports from other budgeting apps — the "moving from another app?" card,
 * kept apart from the bank list because it answers a different question.
 *
 * These are not required for such a file to import: an unrecognised export
 * still falls through to the server's AI inference. What a dedicated entry buys
 * is a parser that costs no model call, carries the app's own categories across
 * instead of guessing from the merchant, and — not least — tells a prospective
 * user we support their old app before they have to try it and find out.
 */
export const MIGRATION_ENTRIES: ImportEntry[] = [
  { id: 'monefy', label: 'Monefy', icon: 'swap-horizontal-outline' },
  { id: 'wallet', label: 'Wallet by BudgetBakers', icon: 'swap-horizontal-outline' },
  { id: 'moneymanager', label: 'Money Manager / 1Money', icon: 'swap-horizontal-outline' },
];

/** Display label for a past import's `source`, e.g. `bank:mbank` → `mBank`. */
export function importSourceLabel(source: string): string {
  if (source === 'wise') return 'Wise';
  if (source.startsWith('bank:')) {
    const bankId = source.slice(5);
    // Both lists, or a past migration import would render its raw parser id.
    const entry = [...IMPORT_ENTRIES, ...MIGRATION_ENTRIES].find((e) => e.id === bankId);
    return entry?.label ?? bankId;
  }
  return source;
}
