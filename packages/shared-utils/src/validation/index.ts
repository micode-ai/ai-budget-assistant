import { z } from 'zod';

// Enums as Zod schemas
export const CurrencySchema = z.enum(['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN']);
export const SyncStatusSchema = z.enum(['pending', 'synced', 'conflict', 'error']);
export const ExpenseSourceSchema = z.enum(['manual', 'voice', 'ocr', 'import']);
export const BudgetPeriodSchema = z.enum(['daily', 'weekly', 'monthly', 'yearly', 'custom']);
export const CategoryTypeSchema = z.enum(['income', 'expense']);

// Auth schemas
export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  currencyCode: CurrencySchema.optional().default('USD'),
  timezone: z.string().optional(),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Location schema
export const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  name: z.string().optional(),
});

// Expense schemas
export const CreateExpenseSchema = z.object({
  localId: z.string().uuid(),
  amount: z.number().positive('Amount must be positive').max(999999999, 'Amount too large'),
  discountAmount: z.number().min(0).max(999999999).optional(),
  currencyCode: CurrencySchema,
  description: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  categoryId: z.string().uuid().optional(),
  date: z.string().datetime({ offset: true }),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .optional(),
  location: LocationSchema.optional(),
  source: ExpenseSourceSchema,
  isDebt: z.boolean().optional().default(false),
  isDebtRepayment: z.boolean().optional().default(false),
  debtContactName: z.string().max(200).optional(),
  debtDueDate: z.string().datetime({ offset: true }).optional(),
  relatedDebtIncomeId: z.string().uuid().optional(),
}).refine(
  (data) => !(data.isDebt && data.isDebtRepayment),
  { message: 'Cannot be both a debt and a debt repayment' },
).refine(
  (data) => !data.isDebtRepayment || data.relatedDebtIncomeId,
  { message: 'Debt repayment must link to original income' },
);

export const UpdateExpenseSchema = z.object({
  amount: z.number().positive().max(999999999).optional(),
  discountAmount: z.number().min(0).max(999999999).optional(),
  currencyCode: CurrencySchema.optional(),
  description: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  date: z.string().datetime({ offset: true }).optional(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .nullable()
    .optional(),
  location: LocationSchema.nullable().optional(),
  isDebt: z.boolean().optional(),
  isDebtRepayment: z.boolean().optional(),
  debtContactName: z.string().max(200).nullable().optional(),
  debtDueDate: z.string().datetime({ offset: true }).nullable().optional(),
  relatedDebtIncomeId: z.string().uuid().nullable().optional(),
});

// Income schemas
export const CreateIncomeSchema = z.object({
  localId: z.string().uuid(),
  amount: z.number().positive('Amount must be positive').max(999999999, 'Amount too large'),
  currencyCode: CurrencySchema,
  description: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  categoryId: z.string().uuid().optional(),
  date: z.string().datetime({ offset: true }),
  isDebt: z.boolean().optional().default(false),
  isDebtRepayment: z.boolean().optional().default(false),
  debtContactName: z.string().max(200).optional(),
  debtDueDate: z.string().datetime({ offset: true }).optional(),
  relatedDebtExpenseId: z.string().uuid().optional(),
}).refine(
  (data) => !(data.isDebt && data.isDebtRepayment),
  { message: 'Cannot be both a debt and a debt repayment' },
).refine(
  (data) => !data.isDebtRepayment || data.relatedDebtExpenseId,
  { message: 'Debt repayment must link to original expense' },
);

export const UpdateIncomeSchema = z.object({
  amount: z.number().positive().max(999999999).optional(),
  currencyCode: CurrencySchema.optional(),
  description: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  date: z.string().datetime({ offset: true }).optional(),
  isDebt: z.boolean().optional(),
  isDebtRepayment: z.boolean().optional(),
  debtContactName: z.string().max(200).nullable().optional(),
  debtDueDate: z.string().datetime({ offset: true }).nullable().optional(),
  relatedDebtExpenseId: z.string().uuid().nullable().optional(),
});

// Budget schemas
export const BudgetCategoryAllocationSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.number().positive('Amount must be positive').max(999999999),
});

export const CreateBudgetSchema = z.object({
  localId: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(100),
  amount: z.number().positive('Amount must be positive').max(999999999),
  currencyCode: CurrencySchema,
  period: BudgetPeriodSchema,
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }).optional(),
  categoryId: z.string().uuid().optional(),
  categories: z.array(BudgetCategoryAllocationSchema).max(20).optional(),
  alertThreshold: z.number().min(0).max(100).optional().default(80),
});

export const UpdateBudgetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  amount: z.number().positive().max(999999999).optional(),
  currencyCode: CurrencySchema.optional(),
  period: BudgetPeriodSchema.optional(),
  endDate: z.string().datetime({ offset: true }).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  categories: z.array(BudgetCategoryAllocationSchema).max(20).optional(),
  alertThreshold: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

// Category schemas
export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  icon: z.string().max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
    .optional(),
  type: CategoryTypeSchema,
  parentId: z.string().uuid().optional(),
});

export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  icon: z.string().max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  parentId: z.string().uuid().nullable().optional(),
});

// Tag schemas
export const CreateTagSchema = z.object({
  name: z.string().min(1, 'Name is required').max(30),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
    .optional(),
  icon: z.string().max(50).optional(),
});

export const UpdateTagSchema = z.object({
  name: z.string().min(1).max(30).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  icon: z.string().max(50).nullable().optional(),
});

// Project schemas
export const CreateProjectSchema = z.object({
  localId: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
    .optional(),
  icon: z.string().max(50).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  budget: z.number().min(0).max(999999999).optional(),
  currencyCode: CurrencySchema.optional(),
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  icon: z.string().max(50).nullable().optional(),
  startDate: z.string().datetime({ offset: true }).nullable().optional(),
  endDate: z.string().datetime({ offset: true }).nullable().optional(),
  budget: z.number().min(0).max(999999999).nullable().optional(),
  currencyCode: CurrencySchema.nullable().optional(),
  isArchived: z.boolean().optional(),
});

// Expense category split schemas
export const CreateExpenseCategorySplitSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.number().positive('Amount must be positive').max(999999999),
  percentage: z.number().min(0).max(100),
  notes: z.string().max(200).optional(),
});

export const SetExpenseSplitsSchema = z.object({
  splits: z.array(CreateExpenseCategorySplitSchema).min(2, 'At least 2 splits required').max(10, 'Maximum 10 splits'),
});

// Sync schemas
export const SyncOperationSchema = z.enum(['create', 'update', 'delete']);

export const SyncEntityTypeSchema = z.enum([
  'expense', 'budget', 'category', 'walletBalance', 'currencyExchange', 'income',
  'tag', 'expense_tag', 'income_tag', 'project', 'project_expense', 'project_income', 'expense_category_split',
  'portfolio_holding', 'investment_transaction',
]);

export const SyncChangeSchema = z.object({
  entityType: SyncEntityTypeSchema,
  entityId: z.string().uuid(),
  operation: SyncOperationSchema,
  payload: z.unknown(),
  encryptedPayload: z.string().optional(),
  encryptionKeyVersion: z.number().int().positive().optional(),
  clientVersion: z.number().int().min(0),
});

export const SyncPushRequestSchema = z.object({
  changes: z.array(SyncChangeSchema).max(100, 'Maximum 100 changes per request'),
  lastSyncTimestamp: z.string().datetime({ offset: true }).optional(),
});

// Savings Goal schemas
export const GoalStatusSchema = z.enum(['active', 'paused', 'completed', 'failed']);
export const AiResponseModeSchema = z.enum(['simple', 'balanced', 'expert']);

export const CreateGoalSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  targetAmount: z.number().positive('Amount must be positive').max(100000000),
  currencyCode: CurrencySchema,
  deadline: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
});

export const UpdateGoalSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  targetAmount: z.number().positive().max(100000000).optional(),
  deadline: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date').optional(),
  currentAmount: z.number().min(0).max(100000000).optional(),
  status: GoalStatusSchema.optional(),
});

// Fat Finder schemas
export const GenerateFatFinderSchema = z.object({
  forceRegenerate: z.boolean().optional(),
  language: z.string().length(2).optional(),
});

// AI schemas
export const ParseExpenseRequestSchema = z.object({
  text: z.string().min(1).max(1000),
  language: z.string().length(2).optional(),
});

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});

// Query parameter schemas
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const ExpenseFiltersSchema = PaginationSchema.extend({
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  categoryId: z.string().uuid().optional(),
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  search: z.string().max(100).optional(),
  source: ExpenseSourceSchema.optional(),
  isDebt: z.string().transform((v) => v === 'true').optional(),
  isDebtRepayment: z.string().transform((v) => v === 'true').optional(),
});

export const IncomeFiltersSchema = PaginationSchema.extend({
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  isDebt: z.string().transform((v) => v === 'true').optional(),
  isDebtRepayment: z.string().transform((v) => v === 'true').optional(),
});

export const BudgetFiltersSchema = PaginationSchema.extend({
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  categoryId: z.string().uuid().optional(),
  period: BudgetPeriodSchema.optional(),
});

// Wallet Balance schemas
export const CreateWalletBalanceSchema = z.object({
  localId: z.string().uuid(),
  currencyCode: CurrencySchema,
  initialAmount: z.number().min(0, 'Amount cannot be negative').max(999999999),
});

export const UpdateWalletBalanceSchema = z.object({
  initialAmount: z.number().min(0).max(999999999).optional(),
});

// Currency Exchange schemas
export const CreateCurrencyExchangeSchema = z
  .object({
    localId: z.string().uuid(),
    fromCurrency: CurrencySchema,
    toCurrency: CurrencySchema,
    fromAmount: z.number().positive('Amount must be positive').max(999999999),
    toAmount: z.number().positive('Amount must be positive').max(999999999),
    exchangeRate: z.number().positive('Rate must be positive'),
    date: z.string().datetime({ offset: true }),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.fromCurrency !== data.toCurrency, {
    message: 'Source and target currencies must be different',
  });

export const UpdateCurrencyExchangeSchema = z.object({
  fromAmount: z.number().positive().max(999999999).optional(),
  toAmount: z.number().positive().max(999999999).optional(),
  exchangeRate: z.number().positive().optional(),
  date: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const ExchangeFiltersSchema = PaginationSchema.extend({
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  currency: CurrencySchema.optional(),
});

// Investment schemas
export const AssetTypeSchema = z.enum(['stock', 'crypto', 'etf', 'bond', 'commodity']);
export const InvestmentTransactionTypeSchema = z.enum(['buy', 'sell']);

export const CreatePortfolioHoldingSchema = z.object({
  localId: z.string().uuid(),
  assetSymbol: z.string().min(1).max(20).transform(s => s.toUpperCase()),
  assetName: z.string().min(1).max(200),
  assetType: AssetTypeSchema,
  assetExchange: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export const CreateInvestmentTransactionSchema = z.object({
  localId: z.string().uuid(),
  holdingId: z.string().uuid(),
  type: InvestmentTransactionTypeSchema,
  quantity: z.number().positive('Quantity must be positive').max(999999999),
  pricePerUnit: z.number().positive('Price must be positive').max(999999999),
  fee: z.number().min(0).max(999999999).optional().default(0),
  date: z.string().datetime({ offset: true }),
  notes: z.string().max(500).optional(),
});

export const UpdateInvestmentTransactionSchema = z.object({
  quantity: z.number().positive().max(999999999).optional(),
  pricePerUnit: z.number().positive().max(999999999).optional(),
  fee: z.number().min(0).max(999999999).optional(),
  date: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(500).optional(),
});

export const PortfolioAnalyticsRequestSchema = z.object({
  period: z.enum(['week', 'month', 'quarter', 'year', 'all']),
  benchmark: z.string().max(20).optional(),
});

// E2EE schemas

export const EncryptionTierSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const KeyWrappingMethodSchema = z.enum(['ecdh', 'master_key']);

const base64String = z.string().min(1).max(10000);

export const SetupEncryptionSchema = z.object({
  pbkdf2Salt: base64String,
  publicKeyX25519: base64String,
  publicKeyEd25519: base64String,
  wrappedPrivateKeyX25519: base64String,
  wrappedPrivateKeyEd25519: base64String,
});

export const EnableAccountEncryptionSchema = z.object({
  tier: z.union([z.literal(1), z.literal(2)]),
  wrappedAccountKey: base64String,
});

export const GrantKeySchema = z.object({
  targetUserId: z.string().uuid(),
  wrappedAccountKey: base64String,
  wrappingMethod: KeyWrappingMethodSchema,
});

export const RotateAccountKeySchema = z.object({
  newWrappedKeys: z.array(z.object({
    userId: z.string().uuid(),
    wrappedAccountKey: base64String,
  })).min(1),
});

export const SetupRecoverySchema = z.object({
  recoveryKeyHash: z.string().min(1),
  wrappedMasterKeyByRecovery: base64String,
});

export const RecoverEncryptionSchema = z.object({
  recoveryKey: z.string().min(1).max(200),
});

export const EncryptedFieldValueSchema = z.object({
  iv: base64String,
  ct: base64String,
  tag: base64String,
});

export const EncryptedPayloadSchema = z.object({
  v: z.number().int().positive(),
  kv: z.number().int().positive(),
  fields: z.record(z.string(), EncryptedFieldValueSchema),
});

// Report & Export schemas

export const ReportFormatSchema = z.enum(['csv', 'pdf', 'excel']);

export const GenerateReportSchema = z.object({
  format: ReportFormatSchema,
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }),
  categoryIds: z.array(z.string().uuid()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  projectIds: z.array(z.string().uuid()).optional(),
  currencyCode: CurrencySchema.optional(),
  includeIncomes: z.boolean().optional().default(true),
  includeExpenses: z.boolean().optional().default(true),
});

export const UpdateReportPreferencesSchema = z.object({
  weeklyEmailEnabled: z.boolean().optional(),
  weeklyEmailDay: z.number().int().min(0).max(6).optional(),
  monthlyDigestEnabled: z.boolean().optional(),
});

export const RestoreBackupSchema = z.object({
  data: z.string().min(1),
  overwrite: z.boolean(),
});

// Type exports from schemas
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>;
export type CreateBudgetInput = z.infer<typeof CreateBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof UpdateBudgetSchema>;
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
export type SyncPushRequestInput = z.infer<typeof SyncPushRequestSchema>;
export type ParseExpenseRequestInput = z.infer<typeof ParseExpenseRequestSchema>;
export type ChatRequestInput = z.infer<typeof ChatRequestSchema>;
export type ExpenseFiltersInput = z.infer<typeof ExpenseFiltersSchema>;
export type BudgetFiltersInput = z.infer<typeof BudgetFiltersSchema>;
export type CreateWalletBalanceInput = z.infer<typeof CreateWalletBalanceSchema>;
export type UpdateWalletBalanceInput = z.infer<typeof UpdateWalletBalanceSchema>;
export type CreateCurrencyExchangeInput = z.infer<typeof CreateCurrencyExchangeSchema>;
export type UpdateCurrencyExchangeInput = z.infer<typeof UpdateCurrencyExchangeSchema>;
export type ExchangeFiltersInput = z.infer<typeof ExchangeFiltersSchema>;
export type CreateIncomeInput = z.infer<typeof CreateIncomeSchema>;
export type UpdateIncomeInput = z.infer<typeof UpdateIncomeSchema>;
export type IncomeFiltersInput = z.infer<typeof IncomeFiltersSchema>;
export type CreateTagInput = z.infer<typeof CreateTagSchema>;
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
export type CreateExpenseCategorySplitInput = z.infer<typeof CreateExpenseCategorySplitSchema>;
export type SetExpenseSplitsInput = z.infer<typeof SetExpenseSplitsSchema>;
export type CreatePortfolioHoldingInput = z.infer<typeof CreatePortfolioHoldingSchema>;
export type CreateInvestmentTransactionInput = z.infer<typeof CreateInvestmentTransactionSchema>;
export type UpdateInvestmentTransactionInput = z.infer<typeof UpdateInvestmentTransactionSchema>;
export type PortfolioAnalyticsRequestInput = z.infer<typeof PortfolioAnalyticsRequestSchema>;
export type SetupEncryptionInput = z.infer<typeof SetupEncryptionSchema>;
export type EnableAccountEncryptionInput = z.infer<typeof EnableAccountEncryptionSchema>;
export type GrantKeyInput = z.infer<typeof GrantKeySchema>;
export type RotateAccountKeyInput = z.infer<typeof RotateAccountKeySchema>;
export type SetupRecoveryInput = z.infer<typeof SetupRecoverySchema>;
export type RecoverEncryptionInput = z.infer<typeof RecoverEncryptionSchema>;
export type EncryptedPayloadInput = z.infer<typeof EncryptedPayloadSchema>;
export type GenerateReportInput = z.infer<typeof GenerateReportSchema>;
export type UpdateReportPreferencesInput = z.infer<typeof UpdateReportPreferencesSchema>;
export type RestoreBackupInput = z.infer<typeof RestoreBackupSchema>;
export type CreateGoalInput = z.infer<typeof CreateGoalSchema>;
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>;
export type GenerateFatFinderInput = z.infer<typeof GenerateFatFinderSchema>;
export type AiResponseModeInput = z.infer<typeof AiResponseModeSchema>;
