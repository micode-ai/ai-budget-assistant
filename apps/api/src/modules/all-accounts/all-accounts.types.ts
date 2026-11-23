export type LedgerNote = 'planned' | 'splitReceivable' | 'internalTransfer' | null;

export interface MergedCategory {
  key: string;
  name: string;
  systemKey: string | null;
}

export interface LedgerRow {
  accountId: string;
  kind: 'expense' | 'income';
  /** YYYY-MM-DD */
  date: string;
  description: string;
  amount: number;
  currencyCode: string;
  /** null = no rate */
  amountBase: number | null;
  category: MergedCategory;
  note: LedgerNote;
}
