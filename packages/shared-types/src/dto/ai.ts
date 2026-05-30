import type { Currency, BudgetPeriod } from '../entities';

export interface TranscribeRequest {
  language?: string;
}

export interface TranscribeResponse {
  text: string;
  language: string;
  duration: number;
}

export interface ParseExpenseRequest {
  text: string;
  language?: string;
}

export interface ParseExpenseResponse {
  amount: number;
  currencyCode: Currency;
  description: string;
  categoryId?: string;
  categorySuggestion?: string;
  confidence: number;
  merchant?: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

export type ChatActionType =
  | 'create_expense'
  | 'create_income'
  | 'create_budget'
  | 'create_category'
  | 'get_expenses'
  | 'get_budget_status'
  | 'get_category_breakdown'
  | 'record_debt_repayment'
  | 'create_debt'
  | 'get_debt_summary'
  | 'update_goal_balance';

export interface CreateExpenseActionData {
  amount: number;
  currencyCode: Currency;
  description: string;
  categoryName?: string;
  date: string;
  tagNames?: string[];
  projectName?: string;
}

export interface CreateIncomeActionData {
  amount: number;
  currencyCode: Currency;
  description: string;
  categoryName?: string;
  date: string;
}

export interface CreateBudgetActionData {
  name: string;
  amount: number;
  currencyCode: Currency;
  period: BudgetPeriod;
  categoryName?: string;
  startDate: string;
  endDate?: string;
}

export interface GetExpensesActionData {
  startDate: string;
  endDate: string;
  categoryName?: string;
}

export interface GetBudgetStatusActionData {
  budgetName?: string;
  categoryName?: string;
}

export interface GetCategoryBreakdownActionData {
  startDate: string;
  endDate: string;
}

export interface CreateCategoryActionData {
  name: string;
  type: 'expense' | 'income';
}

export interface RecordDebtRepaymentActionData {
  debtId: string;
  amount: number;
  date?: string;
}

export interface CreateDebtActionData {
  contactName: string;
  amount: number;
  currencyCode: Currency;
  direction: 'lent' | 'borrowed';
  dueDate?: string;
}

export interface GetDebtSummaryActionData {
  // No parameters needed
}

export interface UpdateGoalBalanceActionData {
  goalId: string;
  newAmount: number;
}

export type ChatActionData =
  | CreateExpenseActionData
  | CreateIncomeActionData
  | CreateBudgetActionData
  | CreateCategoryActionData
  | GetExpensesActionData
  | GetBudgetStatusActionData
  | GetCategoryBreakdownActionData
  | RecordDebtRepaymentActionData
  | CreateDebtActionData
  | GetDebtSummaryActionData
  | UpdateGoalBalanceActionData;

export interface ChatPendingAction {
  id: string;
  actionType: ChatActionType;
  data: ChatActionData;
  displaySummary: string;
}

export interface ChatActionResult {
  actionType: ChatActionType;
  success: boolean;
  data?: Record<string, unknown>;
  errorMessage?: string;
}

export interface ChatResponse {
  message: string;
  conversationId: string;
  pendingAction?: ChatPendingAction;
  actionResult?: ChatActionResult;
  suggestedActions?: Array<{
    type: 'set_budget' | 'view_chart' | 'add_expense';
    data: Record<string, unknown>;
  }>;
}

export interface ChatConfirmActionRequest {
  conversationId: string;
  actionId: string;
}

export interface ChatRejectActionRequest {
  conversationId: string;
  actionId: string;
  reason?: string;
}

export interface ChatMention {
  userId: string;
}

export interface SendChatRequest {
  message: string;
  conversationId?: string;
  mentions?: ChatMention[];
  isShared?: boolean;
}

export interface SendChatResponse {
  message: string;
  conversationId: string;
  aiResponded: boolean;
  userMessageId: string;
  userMessageCreatedAt: string;
  assistantMessageId?: string;
  assistantCreatedAt?: string;
  pendingAction?: ChatPendingAction;
  actionResult?: ChatActionResult;
  encryptionRestricted?: boolean;
}

export interface ChatConversationSummary {
  id: string;
  title: string | null;
  isShared: boolean;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageResponse {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  senderUserId: string | null;
  senderName: string | null;
  mentionedUserIds: string[];
  tokensUsed: number | null;
  createdAt: string;
}

export interface SetConversationSharedRequest {
  isShared: boolean;
}
