import type { Currency, BudgetPeriod } from '../entities';
import type { AffordabilityVerdict } from './insights';

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
  | 'update_goal_balance'
  | 'check_affordability'
  | 'add_to_shopping_list'
  | 'remove_from_shopping_list'
  | 'get_shopping_suggestions'
  | 'get_inflation_shield'
  | 'get_deposit_total'
  | 'get_discount_total'
  | 'undo_last_action';

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

// Deliberately empty: get_debt_summary takes no parameters, but this still
// needs to be its own named member of the ChatActionData union below (not a
// `type` alias of `{}`/Record<string, never>` — every other member here is an
// `interface`, and consumers of the public ChatActionData union match on
// these named members) so the rule is disabled for this one declaration
// rather than the interface being deleted or reshaped.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GetDebtSummaryActionData {
}

export interface UpdateGoalBalanceActionData {
  goalId: string;
  newAmount: number;
}

// Read action — no confirmation required. Carries the full verdict so the
// ActionResultCard can render deterministically without re-parsing the LLM narrative.
export interface CheckAffordabilityActionData {
  affordable: AffordabilityVerdict['affordable'];
  amount: AffordabilityVerdict['amount'];
  currencyCode: AffordabilityVerdict['currencyCode'];
  reasonCode: AffordabilityVerdict['reasonCode'];
  safeToSpendToday: AffordabilityVerdict['safeToSpendToday'];
  amountInBase: AffordabilityVerdict['amountInBase'];
  baseCurrency: AffordabilityVerdict['baseCurrency'];
  goalImpact?: AffordabilityVerdict['goalImpact'];
  suggestedDate?: AffordabilityVerdict['suggestedDate'];
}

// undo_last_action takes no user-supplied parameters — the server resolves the target from
// conversation history (see ChatService.findLastUndoableAction). This shape is what the server
// resolves it INTO before building the pending-action confirmation.
export interface UndoLastActionData {
  /** id of the `action_executed` ChatMessage row this undo targets — the server stamps
   *  `undoneAt` back onto it on success so a second "undo" can't re-fire the same write. */
  sourceMessageId: string;
  /** the ChatActionType of the write being undone (one of: create_expense, create_income,
   *  create_debt, record_debt_repayment, update_goal_balance). */
  originalActionType: ChatActionType;
  /** the ChatActionResult.data captured when the original write executed — the authoritative
   *  source the server reverts from. Opaque to clients. */
  originalResultData: Record<string, unknown>;
  // Flattened, display-only mirrors of fields inside originalResultData. They exist ONLY so
  // ActionConfirmationCard's existing generic detail rows ('amount' in data, 'categoryName' in
  // data, 'date' in data) render for this action too, with no new UI code — server logic never
  // reads these, only originalResultData.
  amount?: number;
  currencyCode?: Currency;
  categoryName?: string;
  date?: string;
  description?: string;
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
  | UpdateGoalBalanceActionData
  | CheckAffordabilityActionData
  | UndoLastActionData;

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
  /**
   * Per-VIEWER, not per-conversation: this is whether the CALLER pinned it,
   * from a separate `chat_conversation_pins` join table keyed on
   * (user, conversation) — never a column on the conversation itself. A
   * shared conversation can be pinned by one member and not another.
   */
  isPinned: boolean;
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

/** One uncategorized expense offered for review by POST /ai/categorize-uncategorized. */
export interface CategorizeCandidateExpense {
  /** Server PK. */
  id: string;
  /** The creating device's local id, when it had one — lets a client find its own row. */
  clientId: string | null;
  merchant: string | null;
  description: string | null;
  amount: number;
  currencyCode: string;
  /** YYYY-MM-DD */
  date: string;
}

/**
 * A suggested destination for some expenses. Exactly one of `categoryId` /
 * `proposedName` is set: an existing category, or a new one the user may create.
 */
export interface CategorizeSuggestionGroup {
  categoryId: string | null;
  proposedName: string | null;
  /** Server PKs, each present in `expenses`. */
  expenseIds: string[];
}

export interface CategorizeSuggestionsResponse {
  expenses: CategorizeCandidateExpense[];
  groups: CategorizeSuggestionGroup[];
  /** Server PKs nothing confident was found for. */
  unassigned: string[];
  /** E2EE expenses the server cannot read and therefore skipped. */
  skippedEncrypted: number;
  /** Model passes left today for this account after this one. */
  remainingToday: number;
  /** True when the daily ceiling stopped the model step; rule-based groups are still returned. */
  limitReached: boolean;
}
