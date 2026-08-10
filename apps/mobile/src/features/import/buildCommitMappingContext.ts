import type { BankImportCommitDto, BankImportPreviewResponse } from '@budget/shared-types';
import type { PendingMapping } from '@/stores/importStore';

export type CommitMappingContext = Pick<
  BankImportCommitDto,
  'headerFingerprint' | 'mapping' | 'bankId' | 'delimiter' | 'encoding' | 'amountFormat' | 'dateFormat'
>;

/**
 * The signature-dictionary bookkeeping fields for a commit request.
 *
 * `headerFingerprint` rides on every commit that could concern the global
 * signature dictionary — an AI-produced preview, or one the user re-mapped by
 * hand — and on no others. Two bugs sit either side of that line:
 *
 * It used to travel only inside the mapper-produced-a-pending-mapping branch,
 * so a plain AI-accepted import (chips shown, user just tapped Import) sent no
 * fingerprint at all and neither the server's confirmedCount nor
 * correctedCount ever moved for it.
 *
 * Sending it unconditionally is the opposite mistake. The server stamps a
 * fingerprint on EVERY CSV/XLSX `parsed` response, including a
 * parser-detected import (mBank, PKO, Revolut) that never consulted the
 * dictionary. Those commits made the server `confirm()` a signature that
 * usually does not exist — one `Failed to bump confirmedCount` warning per
 * import — and, where one did exist, inflated its confirmedCount from traffic
 * that never used it, biasing against the quarantine the counter exists to
 * trigger.
 *
 * `mapping` always reflects what actually produced the committed rows —
 * `pending.mapping` when the user went through the mapper (whether they
 * changed a column or tapped straight through unchanged), else
 * `preview.aiMapping` for a plain AI accept. The server compares this
 * against its own stored signature to tell a genuine correction from an
 * unchanged confirmation — this function only makes sure the server has
 * what it needs to; it does not itself decide correction vs. confirmation.
 */
export function buildCommitMappingContext(
  preview: Pick<BankImportPreviewResponse, 'headerFingerprint' | 'aiMapping' | 'aiInferred'>,
  pending: PendingMapping | null,
  bankId: string | null,
): CommitMappingContext {
  const headerFingerprint = preview.headerFingerprint;
  const concernsDictionary = Boolean(preview.aiInferred) || pending !== null;
  if (!headerFingerprint || !concernsDictionary) return {};

  const mapping = pending?.mapping ?? preview.aiMapping;

  return {
    headerFingerprint,
    ...(mapping ? { mapping } : {}),
    ...(pending
      ? {
          bankId: (bankId ?? 'universal') as BankImportCommitDto['bankId'],
          delimiter: pending.delimiter,
          encoding: pending.encoding,
          amountFormat: pending.amountFormat,
          dateFormat: pending.dateFormat,
        }
      : {}),
  };
}
