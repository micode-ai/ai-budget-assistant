import type { Currency, ExpenseSource, ShareType, SettleMethod, SettleUpTransaction } from '../entities';

export interface ExpenseShareDto {
  userId: string;
  value: number; // interpretation depends on the parent request's splitType
}

/**
 * A single receipt/manual line item sent alongside `CreateExpenseDto.items`.
 * `categoryId` addresses a category by the client's own local id (same
 * convention as the top-level `CreateExpenseDto.categoryId` and each
 * `CreateExpenseCategorySplitDto.categoryId`) — the server resolves it before
 * persisting to `expense_items.category_id`.
 */
export interface CreateExpenseItemDto {
  description: string;
  canonicalName?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice: number;
  sortOrder?: number;
  categoryId?: string | null;
}

export interface CreateExpenseDto {
  localId: string;
  amount: number;
  discountAmount?: number;
  depositAmount?: number;
  currencyCode: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date: string;
  time?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
  };
  source: ExpenseSource;
  items?: CreateExpenseItemDto[];
  /** SHA-256 of the scanned receipt file, from the scan response (ABA-603). */
  receiptFingerprint?: string;
  tagIds?: string[];
  projectId?: string;
  isDebt?: boolean;
  isDebtRepayment?: boolean;
  debtContactName?: string;
  debtDueDate?: string;
  relatedDebtIncomeId?: string;
  externalRef?: string;
  splitType?: ShareType;
  shares?: ExpenseShareDto[];
  paidByUserId?: string;
}

export interface UpdateExpenseDto {
  amount?: number;
  discountAmount?: number;
  depositAmount?: number;
  currencyCode?: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date?: string;
  time?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
  } | null;
  tagIds?: string[];
  projectId?: string | null;
  isDebt?: boolean;
  isDebtRepayment?: boolean;
  debtContactName?: string | null;
  debtDueDate?: string | null;
  relatedDebtIncomeId?: string | null;
  splitType?: ShareType;
  shares?: ExpenseShareDto[];
  paidByUserId?: string | null;
}

export interface MergeExpensesFieldChoices {
  merchant?: boolean;
  notes?: boolean;
  categoryId?: boolean;
  projectId?: boolean;
  tagIds?: boolean;
  receiptImage?: boolean;
}

export interface MergeExpensesDto {
  keepId: string;
  mergeId: string;
  fieldChoices?: MergeExpensesFieldChoices;
}

export interface MergeExpensesResponse {
  keptId: string;
  mergedId: string;
}

export interface MoveExpenseDto {
  targetAccountId: string;
}

export interface MoveExpenseResponse {
  id: string;
  accountId: string;
  categoryId: string | null;
}

/**
 * An already-saved expense a receipt being scanned probably duplicates (ABA-603).
 * `exact` — the very same file was scanned and saved before (fingerprint match,
 * found BEFORE OCR); `likely` — a different file whose merchant, amount, currency
 * and date (±1 day) match a saved expense (found after OCR).
 */
export interface ReceiptDuplicateMatch {
  kind: 'exact' | 'likely';
  expenseId: string;
  /** The row's clientId — what the app routes an expense by. */
  clientId: string;
  merchant: string | null;
  description: string | null;
  amount: number;
  currencyCode: string;
  /** ISO date of the saved expense. */
  date: string;
}

export interface ReceiptDuplicateCheckResponse {
  duplicate: ReceiptDuplicateMatch | null;
}

export interface CreateExpenseCategorySplitDto {
  categoryId: string;
  amount: number;
  percentage: number;
  notes?: string;
}

export interface SetExpenseSplitsDto {
  splits: CreateExpenseCategorySplitDto[];
}

export interface SplitSuggestionResponse {
  shouldSplit: boolean;
  confidence: number;
  suggestedSplits?: Array<{
    categoryId?: string;
    categoryName: string;
    amount: number;
    percentage: number;
    reasoning: string;
  }>;
}

export interface SettleUpBalance {
  userId: string;
  userName: string;
  netAmount: number; // in Account.currencyCode; positive = is owed, negative = owes
}

export interface SuggestedTransfer {
  fromUserId: string;
  toUserId: string;
  amount: number; // in Account.currencyCode
}

export interface SettleUpResponse {
  balances: SettleUpBalance[];
  suggestedTransfers: SuggestedTransfer[];
  currencyCode: Currency;
  fxApproximate: boolean;
  pendingTransactions: SettleUpTransaction[];
}

export interface SettleUpPayDto {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface SettleUpPayResponse {
  transactionId: string;
  paymentLink: string | null;
  manualInstructions: boolean;
  paymentHandle: string | null;
}

export interface AccountMemberPaymentInfoDto {
  paymentMethod: SettleMethod;
  paymentHandle: string;
}
