import { buildPreviewNotices } from '../previewNotices';

describe('buildPreviewNotices', () => {
  it('returns nothing for an ordinary parsed preview', () => {
    expect(buildPreviewNotices({ status: 'parsed', rows: [] })).toEqual([]);
  });

  it('reports an assumed currency as info, carrying the code', () => {
    expect(buildPreviewNotices({ status: 'parsed', currencyAssumed: 'EUR' })).toEqual([
      { key: 'bankImport.aiCurrencyAssumed', params: { currency: 'EUR' }, tone: 'info' },
    ]);
  });

  it('maps each extraction warning to its own string', () => {
    expect(buildPreviewNotices({ status: 'parsed', extractionWarning: 'no_balance' })[0].key)
      .toBe('bankImport.aiWarningNoBalance');
    expect(buildPreviewNotices({ status: 'parsed', extractionWarning: 'balance_mismatch' })[0].key)
      .toBe('bankImport.aiWarningMismatch');
  });

  it('carries the dropped page count on a truncated statement', () => {
    expect(buildPreviewNotices({ status: 'parsed', extractionWarning: 'pages_truncated', droppedPages: 5 }))
      .toEqual([
        { key: 'bankImport.aiWarningTruncated', params: { count: 5 }, tone: 'warning' },
      ]);
  });

  it('shows both notices when both apply, currency first', () => {
    const out = buildPreviewNotices({
      status: 'parsed', currencyAssumed: 'GBP', extractionWarning: 'no_balance',
    });
    expect(out.map((n) => n.key)).toEqual([
      'bankImport.aiCurrencyAssumed',
      'bankImport.aiWarningNoBalance',
    ]);
  });

  it('treats an unknown warning value as no notice rather than crashing', () => {
    expect(buildPreviewNotices({ status: 'parsed', extractionWarning: 'something_new' as never })).toEqual([]);
  });
});
