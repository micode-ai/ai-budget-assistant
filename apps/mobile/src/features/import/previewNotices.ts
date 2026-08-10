import type { BankImportPreviewResponse } from '@budget/shared-types';

export interface Notice {
  key: string;
  params?: Record<string, string | number>;
  tone: 'info' | 'warning';
}

const WARNING_KEY: Record<string, string> = {
  no_balance: 'bankImport.aiWarningNoBalance',
  balance_mismatch: 'bankImport.aiWarningMismatch',
  pages_truncated: 'bankImport.aiWarningTruncated',
};

/**
 * Everything the user must check before importing, in the order it should be
 * read. These are prompts to review, never errors — `no_balance` in particular
 * fires whenever a statement simply prints no closing balance, which is common.
 * An unrecognised warning value yields no notice rather than an empty banner,
 * so a future server-side addition degrades quietly instead of rendering a
 * blank box.
 */
export function buildPreviewNotices(preview: Partial<BankImportPreviewResponse>): Notice[] {
  const notices: Notice[] = [];

  if (preview.currencyAssumed) {
    notices.push({
      key: 'bankImport.aiCurrencyAssumed',
      params: { currency: preview.currencyAssumed },
      tone: 'info',
    });
  }

  const warningKey = preview.extractionWarning ? WARNING_KEY[preview.extractionWarning] : undefined;
  if (warningKey) {
    notices.push({
      key: warningKey,
      ...(preview.extractionWarning === 'pages_truncated'
        ? { params: { count: preview.droppedPages ?? 0 } }
        : {}),
      tone: 'warning',
    });
  }

  return notices;
}
