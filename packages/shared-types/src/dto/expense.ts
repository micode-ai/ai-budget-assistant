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
