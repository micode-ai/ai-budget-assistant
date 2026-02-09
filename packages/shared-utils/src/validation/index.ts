import { z } from 'zod';

// Enums as Zod schemas
export const CurrencySchema = z.enum(['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB']);
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
});

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
});

// Budget schemas
export const CreateBudgetSchema = z.object({
  localId: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(100),
  amount: z.number().positive('Amount must be positive').max(999999999),
  currencyCode: CurrencySchema,
  period: BudgetPeriodSchema,
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }).optional(),
  categoryId: z.string().uuid().optional(),
  alertThreshold: z.number().min(0).max(100).optional().default(80),
});

export const UpdateBudgetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  amount: z.number().positive().max(999999999).optional(),
  currencyCode: CurrencySchema.optional(),
  period: BudgetPeriodSchema.optional(),
  endDate: z.string().datetime({ offset: true }).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
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

// Sync schemas
export const SyncOperationSchema = z.enum(['create', 'update', 'delete']);

export const SyncChangeSchema = z.object({
  entityType: z.enum(['expense', 'budget', 'category', 'walletBalance', 'currencyExchange']),
  entityId: z.string().uuid(),
  operation: SyncOperationSchema,
  payload: z.unknown(),
  clientVersion: z.number().int().min(0),
});

export const SyncPushRequestSchema = z.object({
  changes: z.array(SyncChangeSchema).max(100, 'Maximum 100 changes per request'),
  lastSyncTimestamp: z.string().datetime({ offset: true }).optional(),
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
