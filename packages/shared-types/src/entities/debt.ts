import type { Currency, DebtStatus } from './primitives';

export interface DebtSummary {
  id: string;
  type: 'lent' | 'borrowed';
  contactName: string;
  originalAmount: number;
  currencyCode: Currency;
  totalRepaid: number;
  remainingAmount: number;
  status: DebtStatus;
  dueDate?: Date;
  date: Date;
  description?: string;
  repayments: Array<{ id: string; amount: number; date: Date; description?: string }>;
}
