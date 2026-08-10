import { buildCommitMappingContext } from '../buildCommitMappingContext';
import type { PendingMapping } from '@/stores/importStore';
import type { ColumnMapping } from '@budget/shared-types';

const AI_MAPPING: ColumnMapping = { date: 'Data operacji', amount: 'Kwota', description: 'Opis' };

const PENDING: PendingMapping = {
  mapping: { date: 'Data', amount: 'Kwota', description: 'Opis' },
  delimiter: ',',
  encoding: 'utf-8',
  amountFormat: 'standard',
  dateFormat: 'DD.MM.YYYY',
};

describe('buildCommitMappingContext', () => {
  it('sends nothing at all when the preview has no headerFingerprint (e.g. a PDF extraction)', () => {
    expect(buildCommitMappingContext({ headerFingerprint: undefined, aiMapping: AI_MAPPING }, null, null)).toEqual({});
    expect(buildCommitMappingContext({ headerFingerprint: undefined, aiMapping: undefined }, PENDING, 'universal')).toEqual({});
  });

  // The bug this fixes: a plain AI-accepted import (chips shown, user just
  // taps Import — no trip through the mapper) used to send no fingerprint at
  // all, so neither confirmedCount nor correctedCount ever moved for it.
  it('sends the fingerprint AND the AI mapping for a plain AI-accepted import (no mapper visited)', () => {
    const out = buildCommitMappingContext(
      { headerFingerprint: 'fp-1', aiMapping: AI_MAPPING, aiInferred: true },
      null,
      null,
    );
    expect(out).toEqual({ headerFingerprint: 'fp-1', mapping: AI_MAPPING });
    // No mapper-only fields — those describe a mapper trip, which never happened.
    expect(out.bankId).toBeUndefined();
    expect(out.delimiter).toBeUndefined();
  });

  // The opposite mistake. The server stamps a fingerprint on every CSV/XLSX
  // `parsed` response, so a parser-detected import carries one too — but it
  // never consulted the global dictionary, and telling the server to confirm a
  // signature that usually does not exist produced a warning per import and
  // inflated confirmedCount against quarantine where one did.
  it('sends nothing for a parser-detected import, which carries a fingerprint but never used the dictionary', () => {
    expect(
      buildCommitMappingContext({ headerFingerprint: 'fp-mbank', aiMapping: undefined }, null, 'mbank'),
    ).toEqual({});
    expect(
      buildCommitMappingContext(
        { headerFingerprint: 'fp-mbank', aiMapping: undefined, aiInferred: false },
        null,
        null,
      ),
    ).toEqual({});
  });

  it('sends the fingerprint but no mapping key for an AI preview that carries no mapping (the PDF-extraction shape)', () => {
    const out = buildCommitMappingContext(
      { headerFingerprint: 'fp-2', aiMapping: undefined, aiInferred: true },
      null,
      null,
    );
    expect(out).toEqual({ headerFingerprint: 'fp-2' });
    expect('mapping' in out).toBe(false);
  });

  it('sends the pending mapper mapping (not the stale AI one) plus its own delimiter/format/bankId, after a mapper trip', () => {
    const out = buildCommitMappingContext({ headerFingerprint: 'fp-3', aiMapping: AI_MAPPING }, PENDING, 'universal');
    expect(out).toEqual({
      headerFingerprint: 'fp-3',
      mapping: PENDING.mapping,
      bankId: 'universal',
      delimiter: ',',
      encoding: 'utf-8',
      amountFormat: 'standard',
      dateFormat: 'DD.MM.YYYY',
    });
  });

  it('defaults bankId to universal when none was picked (e.g. arrived via the ai-consent decline path)', () => {
    const out = buildCommitMappingContext({ headerFingerprint: 'fp-4', aiMapping: undefined }, PENDING, null);
    expect(out.bankId).toBe('universal');
  });
});
