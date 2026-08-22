# Architecture

## System Overview

AI Budget Assistant follows a monorepo architecture with two main applications and shared packages.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Expo Mobile App                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │   Screens   │  │   Stores    │  │  Local Database │   │  │
│  │  │ (Expo Router)│  │  (Zustand)  │  │ (SQLite/Drizzle)│   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS / REST API
                              │ X-Account-Id header
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Server Layer                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     NestJS Backend                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ Controllers │  │  Services   │  │     Guards      │   │  │
│  │  │   (REST)    │  │  (Business) │  │ (JWT + Account) │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────┬───────┼───────┬──────────────┐
        ▼             ▼       ▼       ▼              ▼
┌────────────┐ ┌──────────┐ ┌──────┐ ┌───────────┐ ┌──────────┐
│ PostgreSQL │ │  Redis   │ │OpenAI│ │ Expo Push │ │ Telegram │
│  (Prisma)  │ │ (Cache)  │ │ API  │ │    API    │ │   Bot    │
└────────────┘ └──────────┘ └──────┘ └───────────┘ └──────────┘
```

## Multi-Account System

The application supports multi-account access with role-based control:

- **Account types**: `personal`, `business`, `shared`, `investment`
- **Roles**: `owner` (full access), `editor` (create/edit), `viewer` (read-only)
- **Account scoping**: All data requests include `X-Account-Id` header; `AccountContextGuard` resolves membership and role
- **Invitations**: Users can be invited to accounts via invite codes with expiration

### Role-Based Access Control

Write access is enforced at multiple layers so a `viewer` can never mutate account-scoped data:

- **`AccountContextGuard`** resolves membership from the `X-Account-Id` header and sets `req.accountId` + `req.accountRole`
- **`AccountRoleGuard` + `@RequireRole('owner'|'editor')`** — DI-based guard (needs `AccountsModule`) for endpoints that require a specific role
- **`ViewerBlockGuard`** — a zero-dependency guard (no `AccountsModule` import) applied as `@UseGuards(new ViewerBlockGuard())` on any POST/PATCH/PUT/DELETE that mutates account-scoped data; reads `req.accountRole`
- **AI chat & bots**: viewer write-actions are blocked in `chat.service.ts` before a pending action is queued; Telegram/WhatsApp user state carries `accountRole` and write handlers check it before executing
- **Mobile UI gating**: `useAccountStore(s => s.canEdit())` returns `false` for viewers; reference-data and write-action screens hide `+`/pencil/trash controls and disable row press feedback (UI-only — the API still enforces server-side)

## Mobile Application

### Technology Stack

- **Framework**: Expo SDK 50 with React Native 0.73
- **Navigation**: Expo Router 3.4 (file-based routing)
- **State Management**: Zustand 4.5
- **Data Fetching**: TanStack React Query 5.17
- **Local Database**: SQLite with Drizzle ORM 0.29
- **Authentication**: JWT with secure storage

### Screen Structure

```
app/
├── (auth)/
│   ├── _layout.tsx
│   ├── login.tsx
│   ├── register.tsx
│   ├── verify-email.tsx
│   ├── forgot-password.tsx
│   └── reset-password.tsx
├── (tabs)/
│   ├── _layout.tsx
│   ├── index.tsx          # Dashboard
│   ├── expenses.tsx       # Expense list
│   ├── budgets.tsx        # Budget management
│   ├── analytics.tsx      # Charts and reports
│   └── chat.tsx           # AI assistant
├── account/
│   ├── [id].tsx           # Account details
│   ├── create.tsx         # Create account
│   ├── list.tsx           # List accounts
│   ├── join.tsx           # Join via invite code
│   └── invite.tsx         # Invite members
├── budget/
│   ├── [id].tsx           # Budget details
│   └── new.tsx            # Create budget
├── expense/
│   ├── [id].tsx           # Expense details
│   ├── new.tsx            # Add expense
│   ├── receipt.tsx        # Receipt scanner
│   └── voice.tsx          # Voice input
├── income/
│   ├── [id].tsx           # Income details
│   └── new.tsx            # Add income
├── tags/
│   └── index.tsx          # Tag management
├── projects/
│   ├── index.tsx          # Project list
│   ├── [id].tsx           # Project details & analytics
│   └── new.tsx            # Create project
├── wallet/
│   ├── index.tsx          # Wallet balances
│   ├── exchange.tsx       # Currency exchange
│   ├── set-balance.tsx    # Set wallet balance
│   ├── transfer.tsx       # Transfer between accounts
│   ├── transfers.tsx      # Transfer history with filters
│   ├── exchanges.tsx      # Exchange history with filters
│   └── [id].tsx           # Transfer details
├── debts/
│   └── index.tsx          # Debts & loans screen with FAB
├── analytics/
│   └── drill-down.tsx    # Chart drill-down explorer
├── calendar/
│   └── index.tsx          # Full-screen calendar with categories/wallets/transactions tabs
├── achievements.tsx       # Achievements & gamification
├── story.tsx              # AI spending story dashboard
├── fat-finder.tsx         # AI Expense Audit — finds savings opportunities
├── scenario-simulator.tsx # What-if simulator: adjust sliders to project savings over 3/6/12 months
├── admin.tsx              # Admin dashboard
├── settings.tsx           # User settings
└── _layout.tsx            # Root layout
```

### State Management

Zustand stores manage application state:

| Store | Purpose |
|-------|---------|
| `useAuthStore` | Authentication state, tokens, user profile |
| `useExpenseStore` | Expense CRUD operations, filters |
| `useIncomeStore` | Income CRUD, per-currency monthly totals |
| `useBudgetStore` | Budget management, progress tracking |
| `useAccountStore` | Multi-account management, switching |
| `useChatStore` | AI chat conversations |
| `useWalletStore` | Wallet balances, currency exchange, net worth computation |
| `useExchangeRateStore` | Live exchange rates, base currency, `convertedIncomeTotal`, `convertedExpenseTotal` |
| `useThemeStore` | Theme preferences, dark mode |
| `useWidgetVisibilityStore` | Dashboard widget visibility toggles, persisted via MMKV |
| `useInsightsStore` | AI insights loading, caching, dismissal |
| `useTagStore` | Tag CRUD, expense/income tag associations, AI suggestions |
| `useProjectStore` | Project CRUD, expense/income assignment, archiving |
| `useCategoryStore` | Category management, loading from DB |
| `useGamificationStore` | Achievements, streaks, XP/levels, new badge modal |
| `useReportStore` | Report generation, monthly digest, share/download, backups, email preferences |
| `useDebtStore` | Debt tracking — lent/borrowed debts, repayments, status computation |
| `useGoalStore` | Savings goals tracking |
| `useInvestmentStore` | Investment portfolio summary |
| `useEncryptionStore` | Client-side encryption state |
| `useSubscriptionStore` | Subscription tier, limits, paywall |

### Local Database Schema

```typescript
// expenses table
{
  localId: integer (PK, autoincrement),
  serverId: text (nullable),
  clientId: text (unique),
  accountId: text,
  categoryId: text,
  amount: real,
  discountAmount: real (nullable),
  currencyCode: text,
  description: text,
  date: text (ISO),
  time: text (nullable),
  locationLat: real (nullable),
  locationLng: real (nullable),
  notes: text (nullable),
  receiptUrl: text (nullable),
  isRecurring: integer (boolean),
  recurringId: text (nullable),
  source: text (manual|voice|ocr|import),
  isDeleted: integer (boolean),
  syncStatus: text (pending|synced|conflict),
  syncVersion: integer,
  createdAt: text,
  updatedAt: text
}

// categories table
{
  localId: integer (PK),
  serverId: text (nullable),
  accountId: text,
  name: text,
  icon: text,
  color: text,
  type: text (expense|income),
  isSystem: integer (boolean),
  parentId: text (nullable),
  isDeleted: integer (boolean),
  syncStatus: text,
  syncVersion: integer
}

// budgets table
{
  localId: integer (PK),
  serverId: text (nullable),
  clientId: text (unique),
  accountId: text,
  name: text,
  amount: real,
  currencyCode: text,
  period: text (daily|weekly|monthly|yearly|custom),
  startDate: text,
  endDate: text (nullable),
  alertThreshold: integer (0-100),
  isActive: integer (boolean),
  isDeleted: integer (boolean),
  syncStatus: text,
  syncVersion: integer
}

// incomes table
{
  id: text (PK),
  localId: text,
  serverId: text (nullable),
  userId: text,
  accountId: text,
  amount: real,
  currencyCode: text,
  description: text (nullable),
  notes: text (nullable),
  categoryId: text (nullable),
  date: integer (timestamp),
  createdAt: integer,
  updatedAt: integer,
  isDeleted: integer (boolean),
  syncStatus: text (pending|synced|conflict),
  syncVersion: integer
}

// tags table
{
  id: text (PK),
  serverId: text (nullable),
  accountId: text,
  name: text,
  color: text (nullable),
  icon: text (nullable),
  usageCount: integer (default 0),
  isDeleted: integer (boolean),
  syncStatus: text (pending|synced|conflict),
  syncVersion: integer,
  createdAt: integer,
  updatedAt: integer
}

// expense_tags table
{
  id: text (PK),
  expenseId: text,
  tagId: text,
  isDeleted: integer (boolean),
  syncVersion: integer,
  createdAt: integer,
  updatedAt: integer
}

// income_tags table
{
  id: text (PK),
  incomeId: text,
  tagId: text,
  isDeleted: integer (boolean),
  syncVersion: integer,
  createdAt: integer,
  updatedAt: integer
}

// projects table
{
  id: text (PK),
  localId: text,
  serverId: text (nullable),
  accountId: text,
  name: text,
  description: text (nullable),
  color: text (nullable),
  icon: text (nullable),
  startDate: integer (nullable),
  endDate: integer (nullable),
  budget: real (nullable),
  currencyCode: text (nullable),
  isArchived: integer (boolean),
  isDeleted: integer (boolean),
  syncStatus: text (pending|synced|conflict),
  syncVersion: integer,
  createdAt: integer,
  updatedAt: integer
}

// project_expenses table
{
  id: text (PK),
  projectId: text,
  expenseId: text,
  isDeleted: integer (boolean),
  syncVersion: integer,
  createdAt: integer,
  updatedAt: integer
}

// expense_category_splits table
{
  id: text (PK),
  expenseId: text,
  categoryId: text,
  amount: real,
  percentage: real,
  notes: text (nullable),
  isDeleted: integer (boolean),
  syncVersion: integer,
  createdAt: integer,
  updatedAt: integer
}

// sync_queue table
{
  id: integer (PK),
  entityType: text (expense|category|budget|tag|project|...),
  entityLocalId: integer,
  operation: text (create|update|delete),
  payload: text (JSON),
  createdAt: text,
  attempts: integer,
  lastError: text (nullable)
}
```

## Backend API

### Technology Stack

- **Framework**: NestJS 10.3
- **Database**: PostgreSQL with Prisma ORM 5.8
- **Cache**: Redis with ioredis 5.3
- **Authentication**: Passport JWT
- **Validation**: class-validator, Zod
- **AI Integration**: OpenAI SDK 4.24
- **Push Notifications**: Expo Push API

### Module Structure

```
src/
├── modules/
│   ├── auth/                    # Authentication (JWT)
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── jwt.strategy.ts
│   │   └── guards/
│   │       └── jwt-auth.guard.ts
│   ├── users/                   # User management
│   │   ├── users.controller.ts
│   │   └── users.service.ts
│   ├── accounts/                # Multi-account system
│   │   ├── accounts.controller.ts
│   │   ├── accounts.service.ts
│   │   └── dto/
│   ├── expenses/                # Expense tracking
│   │   ├── expenses.controller.ts
│   │   ├── expenses.service.ts
│   │   └── dto/
│   ├── incomes/                 # Income tracking
│   │   ├── incomes.controller.ts
│   │   ├── incomes.service.ts
│   │   └── dto/
│   ├── budgets/                 # Budget management
│   │   ├── budgets.controller.ts
│   │   ├── budgets.service.ts
│   │   ├── budget-alert.service.ts
│   │   └── dto/
│   ├── categories/              # Category management
│   │   ├── categories.controller.ts
│   │   └── categories.service.ts
│   ├── tags/                     # Tag management
│   │   ├── tags.controller.ts
│   │   ├── tags.service.ts
│   │   └── tags.module.ts
│   ├── projects/                 # Project management
│   │   ├── projects.controller.ts
│   │   ├── projects.service.ts
│   │   └── projects.module.ts
│   ├── ai/                      # AI services
│   │   ├── ai.controller.ts
│   │   ├── ai.module.ts
│   │   ├── embedding.module.ts
│   │   ├── services/
│   │   │   ├── chat.service.ts                 # OpenAI call lifecycle orchestrator (~415 lines)
│   │   │   ├── user-context-builder.service.ts # Assembles UserContext for the prompt
│   │   │   ├── ai-tools.service.ts             # 11 function schemas + executeAction dispatcher
│   │   │   ├── prompt-builder.service.ts       # System prompt, language detection, action i18n
│   │   │   ├── whisper.service.ts              # Voice transcription
│   │   │   ├── ocr.service.ts                  # Receipt OCR
│   │   │   ├── categorization.service.ts
│   │   │   ├── tag-suggestion.service.ts
│   │   │   ├── project-suggestion.service.ts
│   │   │   ├── split-suggestion.service.ts
│   │   │   ├── goal-planner.service.ts
│   │   │   ├── embedding.service.ts
│   │   │   ├── model-resolver.ts
│   │   │   └── response-mode.helper.ts
│   │   └── utils/                              # Currency symbol mapping, etc.
│   ├── analytics/               # Spending analytics
│   │   ├── analytics.controller.ts
│   │   └── analytics.service.ts
│   ├── insights/                # AI insights, stories, anomalies
│   │   ├── insights.controller.ts
│   │   ├── insights.service.ts
│   │   ├── ai-insights.service.ts    # GPT-4 insight generation
│   │   └── story.service.ts          # AI story narrative generation
│   ├── subscriptions/           # Subscription tiers & AI usage
│   │   ├── subscriptions.service.ts
│   │   ├── guards/
│   │   │   ├── subscription-tier.guard.ts
│   │   │   └── ai-usage.guard.ts
│   │   └── decorators/
│   │       ├── require-tier.decorator.ts
│   │       └── track-ai-usage.decorator.ts
│   ├── admin/                   # Admin dashboard
│   │   ├── admin.controller.ts
│   │   └── admin.service.ts
│   ├── wallet/                  # Multi-currency wallets
│   │   ├── wallet.controller.ts
│   │   ├── wallet.service.ts
│   │   └── wallet-currency.service.ts  # leaf: ensures a row exists per held currency
│   ├── currency-exchange/       # Currency exchange tracking
│   │   ├── currency-exchange.controller.ts
│   │   ├── currency-exchange.service.ts
│   │   └── exchange-rate.service.ts
│   ├── sync/                    # Data synchronization
│   │   ├── sync.controller.ts
│   │   └── sync.service.ts
│   ├── gamification/              # Achievements & streaks
│   │   ├── gamification.module.ts
│   │   ├── gamification.controller.ts
│   │   ├── gamification.service.ts
│   │   ├── streak.service.ts
│   │   ├── achievement-definitions.ts
│   │   └── tracking-gap-reminder.cron.ts  # Daily cron — nudge when no expense logged 3+ days
│   ├── referrals/               # Referral program
│   │   ├── referrals.controller.ts
│   │   ├── referrals.service.ts
│   │   └── referral-qualification.cron.ts
│   ├── notifications/           # Push notifications (Expo)
│   │   ├── notifications.service.ts
│   │   └── shared-activity.service.ts
│   ├── mail/                    # Email infrastructure
│   │   └── mail.service.ts
│   ├── telegram/                # Telegram bot integration
│   │   ├── telegram.service.ts
│   │   ├── telegram-bot.service.ts
│   │   ├── telegram-bot.controller.ts
│   │   ├── telegram-link.service.ts
│   │   ├── types.ts
│   │   ├── handlers/
│   │   │   ├── chat.handler.ts
│   │   │   ├── command.handler.ts
│   │   │   ├── expense.handler.ts
│   │   │   ├── income.handler.ts
│   │   │   ├── voice.handler.ts
│   │   │   └── photo.handler.ts
│   │   └── helpers/
│   │       ├── format-telegram.ts
│   │       ├── parse-amount.ts
│   │       └── resolve-account.ts
│   ├── import-wise/             # Wise CSV statement import
│   │   ├── import-wise.module.ts
│   │   ├── import-wise.controller.ts
│   │   ├── import-wise.service.ts
│   │   └── dto/index.ts
│   ├── import-bank/             # Polish bank CSV/PDF statement import (strategy registry)
│   │   ├── import-bank.controller.ts
│   │   ├── import-bank.service.ts
│   │   ├── parsers/            # per-bank parsers (mbank, pko, revolut, ing, millennium, pekao, erste, alior, universal)
│   │   ├── merchants/         # merchants-pl.ts brand→category hints
│   │   ├── mapping/           # saved column mappings
│   │   └── utils/             # polish-amount, polish-date, encoding, fx-pairing, pdf-text
│   ├── import-batches/         # Import batch history + rollback
│   │   ├── import-batches.controller.ts
│   │   └── import-batches.service.ts
│   ├── backups/                # Full account snapshot export/restore
│   │   ├── backups.controller.ts
│   │   ├── backups.service.ts
│   │   └── dto/index.ts
│   ├── reports/                # Reports, digests, scheduled emails
│   │   ├── reports.controller.ts
│   │   ├── reports.service.ts
│   │   ├── digest.service.ts
│   │   └── generators/        # csv / pdf / excel generators
│   ├── account-transfers/      # Transfers between accounts
│   ├── debts/                  # Debts & loans, repayments, reminder cron
│   ├── encryption/             # Client-side E2EE key management
│   ├── app-versions/           # App version gate (update prompt)
│   ├── health/                 # Public health check (SELECT 1)
│   ├── anomaly/                # Rule-based on-write anomaly detection → AnomalyAlert feed
│   ├── price-history/          # Personal Inflation Index — Laspeyres index over OCR receipt items
│   │   ├── price-history.module.ts
│   │   ├── price-history.controller.ts
│   │   └── price-history.service.ts
│   ├── shopping-list/          # Smart Shopping List — shared offline-first lists + basket compare (ABA-330)
│   │   ├── shopping-list.module.ts
│   │   ├── shopping-list.controller.ts
│   │   ├── shopping-list.service.ts
│   │   ├── restock-predictor.ts     # pure predictRestock
│   │   ├── deal-detector.ts         # pure detectDeals
│   │   └── shopping-reminder.cron.ts
│   ├── receipt-split/          # Receipt splitting + public guest links
│   │   ├── receipt-split.module.ts
│   │   ├── receipt-split.controller.ts   # payer-facing /expenses/:id/receipt-split*
│   │   ├── guest.controller.ts           # public, unauthenticated /s/:token*
│   │   ├── receipt-split.service.ts
│   │   ├── split-calculator.ts           # pure resolveItemSplit / resolveEqualSplit
│   │   └── helpers/                      # guest-page.ts, guest-page-i18n.ts
│   └── whatsapp/               # WhatsApp Business Cloud bot
│       ├── whatsapp-bot.service.ts
│       ├── whatsapp-bot.controller.ts
│       ├── whatsapp-client.service.ts
│       ├── whatsapp-link.service.ts
│       ├── handlers/
│       └── helpers/
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── middleware/
│   │   └── account-context.middleware.ts
│   ├── interceptors/
│   └── types/
└── database/
    └── prisma.service.ts
```

### Database Schema (PostgreSQL)

```prisma
// Enums
enum AccountType { personal, business, shared }
enum AccountRole { owner, editor, viewer }
enum InvitationStatus { pending, accepted, declined, expired }

model User {
  id                   String    @id @default(uuid())
  email                String    @unique
  passwordHash         String
  name                 String
  currencyCode         String    @default("USD")
  timezone             String    @default("UTC")
  pushToken            String?
  notifyBudgetAlerts   Boolean   @default(true)
  notifySharedActivity Boolean   @default(true)
  isActive             Boolean   @default(true)
  defaultAccountId     String?
  lastSyncAt           DateTime?
  aiResponseMode       String    @default("balanced")  // simple | balanced | expert
  aiModel              String    @default("balanced")  // fast | balanced | quality
  isVerified           Boolean   @default(false)
  emailVerificationCode String?
  emailVerificationExpiresAt DateTime?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  expenses          Expense[]
  incomes           Income[]
  budgets           Budget[]
  categories        Category[]
  chatConversations ChatConversation[]
  budgetAlerts      BudgetAlert[]
  syncLogs          SyncLog[]
  ownedAccounts     Account[]
  accountMembers    AccountMember[]
  walletBalances    WalletBalance[]
  currencyExchanges CurrencyExchange[]
}

model Account {
  id           String      @id @default(uuid())
  name         String
  type         AccountType
  currencyCode String      @default("USD")
  ownerId      String
  icon         String?
  isActive     Boolean     @default(true)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  owner       User                @relation(fields: [ownerId], references: [id])
  members     AccountMember[]
  invitations AccountInvitation[]
  expenses    Expense[]
  incomes     Income[]
  budgets     Budget[]
  categories  Category[]
  syncLogs    SyncLog[]
  walletBalances    WalletBalance[]
  currencyExchanges CurrencyExchange[]
}

model AccountMember {
  id        String      @id @default(uuid())
  accountId String
  userId    String
  role      AccountRole
  joinedAt  DateTime    @default(now())

  account Account
  user    User

  @@unique([accountId, userId])
}

model AccountInvitation {
  id           String           @id @default(uuid())
  accountId    String
  invitedBy    String
  invitedEmail String?
  inviteCode   String           @unique
  role         AccountRole      @default(editor)
  status       InvitationStatus @default(pending)
  expiresAt    DateTime
  acceptedBy   String?

  account Account
}

model Category {
  id          String   @id @default(uuid())
  userId      String?
  accountId   String?
  name        String
  icon        String?
  color       String?
  type        String   @default("expense")
  isSystem    Boolean  @default(false)
  parentId    String?
  isDeleted   Boolean  @default(false)
  syncVersion Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user     User?
  account  Account?
  parent   Category?  @relation("CategoryHierarchy")
  children Category[] @relation("CategoryHierarchy")
  expenses Expense[]
  incomes  Income[]
  budgets  Budget[]

  @@unique([accountId, name, type])
}

model Income {
  id           String   @id @default(uuid())
  userId       String
  accountId    String
  clientId     String
  categoryId   String?
  amount       Decimal  @db.Decimal(12, 2)
  currencyCode String   @default("USD")
  description  String?
  notes        String?
  date         DateTime @db.Date
  isDeleted    Boolean  @default(false)
  syncVersion  Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user     User
  account  Account
  category Category?

  @@unique([accountId, clientId])
  @@index([accountId, date(sort: Desc)])
}

model Expense {
  id             String   @id @default(uuid())
  userId         String
  accountId      String
  clientId       String
  categoryId     String?
  amount         Decimal  @db.Decimal(12, 2)
  discountAmount Decimal? @db.Decimal(12, 2)
  currencyCode   String   @default("USD")
  description    String?
  notes          String?
  date           DateTime @db.Date
  time           String?
  locationLat    Decimal? @db.Decimal(10, 8)
  locationLng    Decimal? @db.Decimal(11, 8)
  receiptUrl     String?
  receiptImage   Bytes?
  isRecurring    Boolean  @default(false)
  recurringId    String?
  source         String   @default("manual")
  isDeleted      Boolean  @default(false)
  syncVersion    Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user     User
  account  Account
  category Category?
  items    ExpenseItem[]

  @@unique([accountId, clientId])
  @@index([accountId, date(sort: Desc)])
}

model ExpenseItem {
  id            String   @id @default(uuid())
  expenseId     String
  description   String
  canonicalName String?  // normalised product name set by OCR service or user alias (migration 20260702160001)
  quantity      Decimal  @default(1) @db.Decimal(10, 3)
  unitPrice     Decimal  @default(0) @db.Decimal(12, 2)
  totalPrice    Decimal  @db.Decimal(12, 2)
  sortOrder     Int      @default(0)
  isDeleted     Boolean  @default(false)
  syncVersion   Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  expense Expense
}

model ProductAlias {
  id            String   @id @default(uuid())
  accountId     String
  rawName       String
  canonicalName String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  account Account @relation(fields: [accountId], references: [id])

  @@unique([accountId, rawName])
  @@map("product_aliases")
}

model Budget {
  id             String    @id @default(uuid())
  userId         String
  accountId      String
  clientId       String
  name           String
  amount         Decimal   @db.Decimal(12, 2)
  currencyCode   String    @default("USD")
  period         String    @default("monthly")
  startDate      DateTime  @db.Date
  endDate        DateTime? @db.Date
  alertThreshold Int       @default(80)
  isActive       Boolean   @default(true)
  isDeleted      Boolean   @default(false)
  syncVersion    Int       @default(0)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  user     User
  account  Account
  category Category?
  alerts   BudgetAlert[]

  @@unique([accountId, clientId])
}

model BudgetAlert {
  id                  String   @id @default(uuid())
  budgetId            String
  userId              String
  thresholdPercentage Int
  triggeredAt         DateTime
  currentSpent        Decimal  @db.Decimal(12, 2)
  isRead              Boolean  @default(false)
  notificationSent    Boolean  @default(false)

  budget Budget
  user   User
}

model ChatConversation {
  id        String   @id @default(uuid())
  userId    String
  title     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user     User
  messages ChatMessage[]
}

model ChatMessage {
  id             String   @id @default(uuid())
  conversationId String
  role           String   // user, assistant, system
  content        String
  tokensUsed     Int?
  createdAt      DateTime @default(now())

  conversation ChatConversation
}

model SyncLog {
  id                 String   @id @default(uuid())
  userId             String
  accountId          String?
  entityType         String
  entityId           String
  operation          String
  clientVersion      Int
  serverVersion      Int
  conflictResolved   Boolean  @default(false)
  resolutionStrategy String?
  createdAt          DateTime @default(now())

  user    User
  account Account?
}

model WalletBalance {
  id            String   @id @default(uuid())
  accountId     String
  userId        String
  clientId      String
  currencyCode  String
  initialAmount Decimal  @db.Decimal(12, 2)
  isDeleted     Boolean  @default(false)
  syncVersion   Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  account Account
  user    User

  @@unique([accountId, currencyCode])
  @@unique([accountId, clientId])
}

model CurrencyExchange {
  id           String   @id @default(uuid())
  accountId    String
  userId       String
  clientId     String
  fromCurrency String
  toCurrency   String
  fromAmount   Decimal  @db.Decimal(12, 2)
  toAmount     Decimal  @db.Decimal(12, 2)
  exchangeRate Decimal  @db.Decimal(12, 6)
  date         DateTime @db.Date
  notes        String?
  isDeleted    Boolean  @default(false)
  syncVersion  Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  account Account
  user    User

  @@unique([accountId, clientId])
}

model Tag {
  id          String   @id @default(uuid())
  accountId   String
  name        String
  color       String?
  icon        String?
  usageCount  Int      @default(0)
  isDeleted   Boolean  @default(false)
  syncVersion Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  account     Account
  expenseTags ExpenseTag[]
  incomeTags  IncomeTag[]

  @@unique([accountId, name])
}

model ExpenseTag {
  id          String   @id @default(uuid())
  expenseId   String
  tagId       String
  isDeleted   Boolean  @default(false)
  syncVersion Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  expense Expense
  tag     Tag

  @@unique([expenseId, tagId])
}

model IncomeTag {
  id          String   @id @default(uuid())
  incomeId    String
  tagId       String
  isDeleted   Boolean  @default(false)
  syncVersion Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  income Income
  tag    Tag

  @@unique([incomeId, tagId])
}

model Project {
  id           String    @id @default(uuid())
  accountId    String
  clientId     String
  name         String
  description  String?
  color        String?
  icon         String?
  startDate    DateTime? @db.Date
  endDate      DateTime? @db.Date
  budget       Decimal?  @db.Decimal(12, 2)
  currencyCode String?
  isArchived   Boolean   @default(false)
  isDeleted    Boolean   @default(false)
  syncVersion  Int       @default(0)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  account         Account
  projectExpenses ProjectExpense[]
  projectIncomes  ProjectIncome[]

  @@unique([accountId, clientId])
}

model ProjectExpense {
  id          String   @id @default(uuid())
  projectId   String
  expenseId   String
  isDeleted   Boolean  @default(false)
  syncVersion Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project Project
  expense Expense

  @@unique([projectId, expenseId])
}

model ProjectIncome {
  id          String   @id @default(uuid())
  projectId   String
  incomeId    String
  isDeleted   Boolean  @default(false)
  syncVersion Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project Project
  income  Income

  @@unique([projectId, incomeId])
}

model ExpenseCategorySplit {
  id          String   @id @default(uuid())
  expenseId   String
  categoryId  String
  amount      Decimal  @db.Decimal(12, 2)
  percentage  Decimal  @db.Decimal(5, 2)
  notes       String?
  isDeleted   Boolean  @default(false)
  syncVersion Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  expense  Expense
  category Category
}

model Subscription {
  id               String   @id @default(uuid())
  userId           String   @unique
  tier             SubscriptionTier @default(free)
  status           String   @default("active")
  aiRequestsUsed   Int      @default(0)
  aiCostUnitsUsed  Float    @default(0)
  periodStart      DateTime
  periodEnd        DateTime
  trialEndsAt      DateTime?
  // ... relations
}

model GeneratedInsight {
  id               String   @id @default(uuid())
  accountId        String
  insightType      String
  title            String
  description      String
  severity         String
  chartConfig      Json
  actionSuggestion String?
  periodStart      DateTime
  periodEnd        DateTime
  isExpired        Boolean  @default(false)
  expiresAt        DateTime
  createdAt        DateTime @default(now())
}

model SpendingStory {
  id          String   @id @default(uuid())
  accountId   String
  periodLabel String
  periodStart DateTime
  periodEnd   DateTime
  blocks      Json
  summary     String
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  @@unique([accountId, periodStart, periodEnd])
}
```

## Synchronization

### Strategy

The application uses optimistic version-based synchronization with last-write-wins conflict resolution.

### Sync Flow

```
┌─────────────────┐                    ┌─────────────────┐
│  Mobile Client  │                    │     Server      │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │  1. User creates expense offline     │
         │  ┌───────────────────────────┐       │
         │  │ Save to SQLite            │       │
         │  │ Add to sync_queue         │       │
         │  │ syncStatus = "pending"    │       │
         │  └───────────────────────────┘       │
         │                                      │
         │  2. Network available                │
         │  ──────────────────────────────────► │
         │  POST /sync/push                     │
         │  X-Account-Id: <account-uuid>        │
         │  { changes: [...] }                  │
         │                                      │
         │                                      │  3. Process changes
         │                                      │  ┌─────────────────────┐
         │                                      │  │ Validate versions   │
         │                                      │  │ Apply changes       │
         │                                      │  │ Increment versions  │
         │                                      │  └─────────────────────┘
         │                                      │
         │  ◄────────────────────────────────── │
         │  { processed: [...], conflicts: [] } │
         │                                      │
         │  4. Update local state               │
         │  ┌───────────────────────────┐       │
         │  │ Update serverId           │       │
         │  │ syncStatus = "synced"     │       │
         │  │ Remove from queue         │       │
         │  └───────────────────────────┘       │
         │                                      │
         │  5. Pull server changes              │
         │  ──────────────────────────────────► │
         │  GET /sync/pull?since=timestamp      │
         │                                      │
         │  ◄────────────────────────────────── │
         │  { expenses: [...], budgets: [...] } │
         │                                      │
         │  6. Merge server changes             │
         │  ┌───────────────────────────┐       │
         │  │ Upsert by serverId        │       │
         │  │ Handle conflicts          │       │
         │  └───────────────────────────┘       │
         │                                      │
```

### Conflict Resolution

1. **Version Comparison**: Each entity has a `syncVersion` field
2. **Last Write Wins**: By default, the latest change wins
3. **Conflict Detection**: If local and server versions diverge, mark as conflict
4. **Resolution Strategy**: Stored in SyncLog for auditability
5. **Manual Resolution**: User can choose which version to keep (future feature)

### Bulk Expense Operations

`PATCH /expenses/bulk` (`BulkUpdateExpensesDto`) powers mobile multi-select bulk **delete / recategorize / tag** in one round-trip. Because the mobile client may send rows that have not yet synced, both the expense `ids` and the `tagIds` are resolved against **server PKs and local `clientId`s** via `OR: [{ id }, { clientId }]` (`Expense.clientId`, `Tag.clientId`), so synced and unsynced rows are matched alike. `isDeleted: true` soft-deletes; otherwise `categoryId` and/or `tagIds` are applied (tags appended).

## Bank & Statement Import

### Bank Import (strategy registry)

The `import-bank` module imports CSV/PDF bank statements through a **strategy registry** of per-bank parsers. Each parser in `parsers/*.parser.ts` implements `BankParser { id, displayName, format?: 'csv'|'pdf', detect(), parse() }` and is registered in `registry.ts`.

- **Banks**: `mbank`, `pko`, `revolut`, `ing`, `millennium`, `pekao` (CSV) + `erste`, `alior` (PDF) + a `universal` column-mapping fallback (`detect()` always returns `false`)
- **Visible vs hidden** (mobile `BANKS` list): Wise, mBank, PKO, Revolut, Erste (PDF), Alior (PDF), Other are shown; ING / Millennium / Pekao exist in the registry but are hidden until validated against real exports
- **Revolut** (`parsers/revolut.parser.ts`): CSV export `Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance`. Only `State = COMPLETED` rows are kept; `Amount` is signed (negative = expense) with `Fee` already folded in; `EXCHANGE` rows are paired into FX via `pairFxRows`
- **Flow** (`ImportBankService`): `decodeCsvBuffer` (UTF-8 / Windows-1250 auto-detect via `iconv-lite`) → parser dispatch (mappingId → bankId → saved fingerprint → auto-detect) → normalized rows → `pairFxRows` (same date, opposite sign, different currency) → `buildExternalRef` → dedup. PDF statements are detected by a `%PDF` header, text-extracted via `pdf-parse`, and routed to PDF parsers (CSV header/mapping/fingerprint steps skipped)
- **Two dedup layers** in `buildPreviewResponse`: (1) exact `externalRef` match (re-import of the same file); (2) content match on `(date, signedAmountCents, currency)` against all account Expense/Income regardless of source (greedy 1-to-1, FX excluded). Matched rows are flagged `alreadyImported` and auto-unchecked in the preview
- **Dedup key**: `bank:<bankId>:<isoDate>:<signedAmountCents>:<sha256(normalize(desc)).slice(0,8)>`
- **Saved mappings**: `csv_import_mappings` table (`@@unique([accountId, headerFingerprint])`) persists a column mapping so a recognized layout auto-applies on the next import
- **Request-a-bank**: `POST /import/bank/request-bank` forwards an optional sample file + bank name to the **ops Telegram chat** (`TELEGRAM_CHAT_ID`), never to the user

Endpoints are guarded by `JwtAuthGuard + AccountContextGuard`. Wise CSV import (`import-wise`) follows the same preview/commit + `externalRef` dedup model, emitting in-wallet FX rows as `CurrencyExchange`.

### Import Batch History & Rollback

Every Wise and bank commit creates an `ImportBatch` row (table `import_batches`) inside the same transaction and stamps each created record with `importBatchId`.

- `GET /import/batches` returns the last 20 batches; each carries `canRollback` (`status === 'committed'` and within a 30-day window)
- `DELETE /import/batches/:id` rolls back: sets `isDeleted = true` and **clears `externalRef`** on linked rows (so the same file can be re-imported) and marks the batch `rolled_back`

## AI Integration

### Model Selection

Users can choose their preferred AI model in Settings → **AI Model**. The preference applies globally to all text and vision AI features (Whisper transcription is excluded):

| Preference | Model | Max Tokens | Cost Multiplier |
|------------|-------|-----------|-----------------|
| `fast` | `gpt-4o-mini` | 1500 | ×0.75 |
| `balanced` (default) | `gpt-4o` | 2000 | ×1.0 |
| `quality` | `gpt-4.1` | 3000 | ×1.5 |

The cost multiplier scales the AI quota consumed per request. For example, with the Free plan (5 AI requests/month), a "quality" request costs 1.5 units and a "fast" request costs 0.75 units.

**Implementation:** `apps/api/src/modules/ai/services/model-resolver.ts` — exports `resolveAiModel(pref?)` and `getAiCostMultiplier(pref?)`. The `AiUsageGuard` applies the multiplier centrally before recording quota usage.

### Services

| Service | OpenAI Model | Purpose |
|---------|--------------|---------|
| Transcription | `whisper-1` (fixed) | Convert audio to text |
| Expense Parsing | User-selected model | Extract expense data from text |
| Categorization | User-selected model | Suggest expense categories |
| Receipt Scanner | User-selected model | Extract data from receipt images (incl. structured store address) |
| Geocoding | — (OpenStreetMap/Nominatim) | Resolve a scanned receipt's store address to map coordinates (structured query, cached, fail-silent) |
| Chat Assistant | User-selected model | Financial advice and insights |
| AI Insights | User-selected model | Analyze patterns, generate insight cards |
| Story Generation | User-selected model | Create narrative spending dashboards |
| Investment Insights | User-selected model | Portfolio analysis, concentration risks, performance alerts |
| Tag Suggestions | User-selected model | Suggest tags based on expense description (history-first, AI fallback) |
| Project Suggestions | User-selected model | Match expenses to active projects by date range and semantic analysis |
| Split Suggestions | User-selected model | Suggest category splits for multi-category expenses |

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Client    │────►│   Backend    │────►│   OpenAI     │
│              │     │   (Proxy)    │     │    API       │
│              │◄────│              │◄────│              │
└──────────────┘     └──────────────┘     └──────────────┘

1. Client sends request to backend
2. Backend adds API key and context
3. Backend calls OpenAI API
4. Response processed and returned
```

### Context Injection

The chat assistant receives user context for personalized responses:

```typescript
const context = {
  monthlySpending: number,
  budgetLimits: { category: string, limit: number, spent: number }[],
  topCategories: { category: string, amount: number }[],
  recentExpenses: { description: string, amount: number, date: string }[]
};
```

All user-controlled string fields (expense descriptions, project names, tag names, category names, goal names) are sanitized before inclusion using `sanitizeForPrompt()` from `@budget/shared-utils`. This prevents prompt injection attacks where malicious text stored in user data could override AI instructions.

User context is passed to the model as a structurally isolated JSON data block delimited by `--- USER FINANCIAL DATA ---` / `--- END USER FINANCIAL DATA ---` markers, so the model treats it as data rather than instructions.

### Shared AI Chat

Conversations support a per-conversation opt-in group mode for shared accounts. `ChatConversation` carries `accountId` + `isShared`; chat history is account-scoped (`accountId = X-Account-Id AND (isShared OR userId = me)`).

- **Sharing toggle**: `isShared` is **creator-only** to set — any account member may share/unshare a conversation **they created** (via `PATCH /ai/chat/conversations/:id/shared` or `chat()`'s `initialIsShared`). The endpoint checks `conversation.userId === caller`, not the account role, so a member cannot change the sharing flag on someone else's conversation (even an owner's). Shared conversations are visible to all members; private ones stay creator-only
- **Mentions**: a message that `@mentions` a member (`{userId}[]`, validated, self excluded) **silences the AI** and pushes a `chat_mention` notification (gated by `notifySharedActivity`) to each mentioned member who is not currently present; a message with no mention gets a normal AI reply
- **Presence**: tracked in Redis under `chat:presence:{conversationId}:{userId}` (TTL 45s); mobile polls `…/poll?since=` every 4s while a shared conversation is focused and refreshes its own presence key
- **AI history**: each member's message is prefixed with a sanitized `[Name]: ` so the model can attribute turns
- **Deep-link**: tapping a `chat_mention` push switches `accountId` and opens the conversation

## Notifications

### Push Notifications (Expo Push API)

The application uses Expo Push API for sending push notifications. No Firebase configuration is required.

**Notification types:**
- `budget_alert` — triggered when spending exceeds budget threshold
- `spending_anomaly` — triggered by the anomaly module (category spike, price increase, duplicate charge, recurring suggestion); capped at 3 per account per day
- `shared_expense` — triggered when a member creates an expense in a shared account
- `debt_reminder` — upcoming or overdue debt due-date reminder
- `recurring_expense` — auto-created recurring expense notification
- `subscription_renewal` — subscription renewal reminder or auto-charge notification
- `chat_mention` — user was @mentioned in a shared AI conversation
- `tracking_gap_reminder` — nudge sent when no expense has been logged for 3+ days (fires on day 3, 6, 9…)

**User preferences** (`GET/PATCH /users/me/notification-preferences`)
- `budgetAlerts` — controls `budget_alert` notifications
- `sharedActivity` — controls `shared_expense` and `chat_mention` notifications
- `debtReminders` — controls `debt_reminder` notifications
- `recurringExpenses` — controls `recurring_expense` notifications
- `subscriptionRenewals` — controls `subscription_renewal` notifications
- `anomalyAlerts` — controls `spending_anomaly` push notifications from the anomaly module (default `true`)
- `trackingGap` — controls `tracking_gap_reminder` notifications (default `true`)

**Batch processing:** Notifications are sent in batches of 100 messages.

### Telegram Integration

The Telegram module provides two services:

1. **TelegramService** — admin notifications for system events (new user registration, new subscriptions)
2. **TelegramBotService** — full-featured user-facing bot with AI chat, expense/income commands, voice transcription, and receipt OCR

**Bot Architecture:**
- **Middleware**: Resolves `TelegramLink` → sets `ctx.userState` (userId, accountId, conversationId) before every handler
- **Handlers**: 6 specialized handlers — `ChatHandler` (AI chat), `CommandHandler` (/start, /link, /account, /unlink, /newchat, /help), `ExpenseHandler`, `IncomeHandler`, `VoiceHandler` (Whisper transcription), `PhotoHandler` (OCR receipt scanning)
- **Account linking**: 6-char codes with 10-minute TTL, stored in `TelegramLinkCode` table. One-to-one mapping: Telegram user ↔ App user
- **Account context resolution**: `resolve-account.ts` helper detects account names in user messages and overrides the default accountId for that query (without permanently switching). This allows users to query different accounts by mentioning the account name (e.g., "Show expenses in Family")
- **Webhook/Polling**: Uses webhook mode when `TELEGRAM_WEBHOOK_URL` is set, otherwise falls back to long polling for development

### WhatsApp Integration

The WhatsApp module is a `@Global()` bot on the **Meta Business Cloud API**, running in parallel to Telegram and reusing the same shared services (`ChatService`, `WhisperService`, `OcrService`, `ExpensesService`, `IncomesService`, `CategoriesService`, `SubscriptionsService`). It exposes the same feature set: AI chat, voice transcription, and receipt OCR.

Key differences from Telegram:

- **Webhook-only**: `POST /whatsapp/webhook` (excluded from the `/api/v1` global prefix in `main.ts`). No polling mode
- **Signature verification**: HMAC-SHA256 over `req.rawBody` (key = `WHATSAPP_APP_SECRET`) on every inbound request
- **State in Redis** (not in-memory): `wa:msg:{id}` (idempotency, 24h), `wa:pa:{shortId}` (pending actions, 1800s), `wa:receipt:{shortId}` + `wa:awaiting_date:{phone}`, `wa:cat:{shortId}`
- **Callback IDs use `--` separator** (UUIDs contain single `-`)
- **Interactive UI**: `WhatsAppClientService.sendButtons` (max 3 × 20 char) / `sendList` (max 10 rows); WhatsApp markdown (`*bold*`, `_italic_`) via `markdownToWhatsApp`
- **Account linking**: 6-hex code — mobile shows a QR + `wa.me/{phone}?text=link%20{code}` deep link; `CommandHandler.handleLink` is the only command accepted from an unlinked number
- **Localization**: `helpers/i18n.ts` ports Telegram's keys across 8 languages

### Email (Mail)

Mail module provides email sending infrastructure for transactional emails.

## Subscription System

The application uses a tiered subscription model to manage access to AI-powered features:

- **Three tiers**: free, pro, business
- **AI usage tracking**: Each AI request is tracked per user with cost units (fractional)
- **Model cost multiplier**: Applied by `AiUsageGuard` before recording usage — fast=0.75×, balanced=1.0×, quality=1.5×
- **Trial periods**: New users receive trial access with reduced limits
  - Trial limits: free = 50, pro = 15, business = 100
  - Active limits: free = 50, pro = 300, business = unlimited
- **Guards**:
  - `SubscriptionTierGuard` checks that the user's subscription tier meets the minimum required tier for the endpoint
  - `AiUsageGuard` checks that the user has not exceeded their AI usage limit for the current billing period; applies model cost multiplier
- **AI features** (insights, story, fat finder) are available on all tiers — only AI request limits differ by plan

## Dashboard Widgets (in-app)

The home screen (`app/(tabs)/index.tsx`) renders financial overview widgets from `src/components/widgets/`:

### Net Profit Widget (`NetProfitWidget`)
- **Data**: Calls `GET /analytics/summary` for each of the last 6 months in parallel via `Promise.all`
- **Stores**: `useAccountStore` (account scope), `useAuthStore` (base currency)
- **Chart**: `InteractiveLineChart` with `lineColor` green (positive) or red (negative)
- **Refresh**: Accepts `refreshKey: number` prop; increments on pull-to-refresh to re-trigger `useEffect`
- **Formula**: `netSavings = totalIncome - totalExpenses` computed server-side in `analytics.service.ts`

### Net Capital Widget (`NetCapitalWidget`)
- **Data**: Reads `walletStore.walletSummary` (already loaded) — no additional API calls
- **Computation**: `totalNetCapital = Σ convertAmount(s.currentBalance, s.currencyCode, baseCurrency, rates)` using `convertAmount()` from `exchangeRateStore`
- **Display**: Total in base currency + per-currency breakdown list
- **Empty state**: Shown when `walletSummary.length === 0` (no initial balances set)

### Calendar Widget (`CalendarWidget`)
- **Hook**: Uses shared `useCalendarData()` hook from `src/hooks/useCalendarData.ts`
- **Data**: Reads `expenseStore`, `incomeStore`, `categoryStore`, `exchangeRateStore` — no API calls, all local
- **Display**: Monthly calendar grid with colored dots (green = income, red = expense), month navigation, income/expense/net profit summary
- **Navigation**: Tapping the widget opens full-screen `app/calendar/index.tsx` with three tabs:
  - **Categories** — income/expense breakdown by category with icons, percentages, amounts
  - **Wallets** — wallet balances from `walletStore.walletSummary` with percentage of total
  - **Transactions** — merged expense/income list, filterable by tapping a specific day
- **Multi-currency**: All amounts converted via `convertAmount()` from `exchangeRateStore`
- **Week start**: Monday (matches `getStartOfWeek()` convention in shared-utils)

## Home Screen Widgets

Android home screen widgets provide quick access to financial data without opening the app:

- **Technology**: `react-native-android-widget` for native Android widget rendering
- **4 widgets**:
  - **Small** (110×40 dp, `BudgetWidgetSmall`): Today's spending total with delta vs yesterday
  - **Medium** (250×110 dp, `BudgetWidgetMedium`): Weekly spending bar chart + today's total
  - **Large** (250×180 dp, `BudgetWidgetLarge`): Budget progress bars + top spending categories
  - **Quick Add** (250×60 dp, `QuickActionWidget`): Three deep-link buttons — 🎤 Voice, 📷 Scan, ✏️ Add
- **Data bridge**: `widgetData.ts` service serializes data from API responses and local SQLite storage into a format suitable for widget rendering
- **Background refresh**: `expo-background-fetch` triggers data updates every 30 minutes for data widgets; Quick Add is static (`updatePeriodMillis: 0`)
- **Deep links**: Quick Add uses `clickAction="OPEN_URI"` with the `budget:///` scheme to open specific app screens directly
- **Widget task handler**: Registered in `index.js` to handle widget update requests from the Android system
- **Developer docs**: See [`docs/en/WIDGETS.md`](./WIDGETS.md) for full architecture and how to add new widgets

## Insights & Anomaly Detection

The Insights module provides:

1. **Spending Anomalies**: Compares current month's category spending against 3-month average. Categories with >30% increase are flagged.
2. **Budget Predictions**: Forecasts budget exhaustion dates based on daily burn rate and projects end-of-period totals.

### Proactive Anomaly Alerts (`anomaly` module)

The `anomaly` module (37th API module) runs **rule-based on-write detection** and persists results to the `anomaly_alerts` feed table. Unlike the passive Insights endpoint, alerts are pushed to users as they happen.

**4 detectors:**

| Detector | Trigger condition |
|----------|-------------------|
| `category_spike` | The expense's category total for the current calendar month (per currency) is ≥30% above the average of the previous ≥2 months. No budget required. |
| `price_increase` | An active tracked `UserSubscription` (matched by normalized name) or a `recurringId` series is charged **>10%** more than before, same currency. |
| `duplicate_charge` | Same **payee** (merchant, or description when no merchant) + amount + currency within **±1 calendar day**; pairs from the same import batch are excluded. |
| `recurring_suggestion` | 3+ same-amount charges from an **untracked** merchant on a regular cadence (monthly 25–35 days / weekly 6–8 days); fires once ever per merchant. |

**Dedup:** each alert has a deterministic `dedupKey` with a `@@unique([accountId, dedupKey])` constraint — the same event cannot produce duplicate rows regardless of retry or race conditions.

**Push cap:** at most 3 `spending_anomaly` push notifications are sent per account per calendar day; further alerts are written to the feed but not pushed. Gate: the `anomalyAlerts` notification preference (`user.notifyAnomalyAlerts`, default `true`).

**Hooks:** `ExpensesService.create` calls `AnomalyService.analyzeExpense(expense)` synchronously after the expense row is committed. Import commit endpoints (`import-wise`, `import-bank`) call `AnomalyService.analyzeExpenseBatch(expenses)` asynchronously (fire-and-forget) so import throughput is unaffected.

**API:** `GET /alerts`, `PATCH /alerts/read-all`, `PATCH /alerts/:id/read`, `DELETE /alerts/:id` — all behind `JwtAuthGuard + AccountContextGuard`; write endpoints guarded by `ViewerBlockGuard`.

## Safe-to-Spend

The `insights` module (ABA-293) computes a single "safe to spend today" number that powers both the home-screen hero figure and the `check_affordability` AI chat function — one formula, two consumers.

### How It Works

1. **Formula**: `safeToSpendToday = max(0, (walletBalance + expectedIncome − obligations − buffer) / daysRemaining)`, where `buffer` is `0` in v1.
2. **Inputs**: current wallet balance (`WalletService.getSummary`), upcoming subscription charges (active `UserSubscription` rows projected forward within the horizon), upcoming recurring expenses (same grouping logic as the recurring-expense cron — latest row per `recurringId`, next due date), on-track goal contributions (linear pace to each goal's deadline), and inferred monthly income (a 25–35-day cadence heuristic over 90 days of income history — the same detector used by the `recurring_suggestion` anomaly).
3. **Horizon**: `min(end of the current calendar month, next expected income date)`, clamped to a minimum of 1 day.
4. **Currency**: every input is converted to the account's display currency via `getRatesSafe`/`convertAmount`, with an `fxApproximate` flag when a rate is stale or missing.
5. **Sharing**: the pure formula helper (`computeSafeToSpend`) is a **deliberately duplicated pair**, the same convention as `financial-month.ts` and `receipt-category-split.ts` — the service imports its own canonical copy at `apps/api/src/modules/insights/safe-to-spend.util.ts`, while a hand-kept mirror in `packages/shared-utils` is what the mobile offline fallback (`useSafeToSpend.ts`) actually imports. It is **not** one shared function: the API has no build step for workspace packages, so a runtime import of `@budget/shared-utils` from `apps/api/src` crash-loops production with `ERR_UNSUPPORTED_DIR_IMPORT` — which is why `scripts/check-no-shared-utils-runtime-import.sh` fails the deploy over it. Change one copy, change the other.

### Caching

Result is cached in Redis under `sts:{accountId}:{baseCurrency}`, TTL 300 s. No database migration — everything is computed from existing tables (wallet, subscriptions, recurring expenses, goals, income history).

### AI Chat Integration

`check_affordability(amount, currencyCode?, description?)` is a **read** AI chat function (no confirmation) that returns a deterministic `AffordabilityVerdict` — `affordable: boolean` plus a `reasonCode` (`within_safe`, `within_available_tight`, `over_available`, `delays_goal`, `wait_until_income`). The model narrates the verdict verbatim rather than computing its own judgment.

### Mobile Integration

- **`useSafeToSpend`** hook + MMKV-cached `insightsStore.loadSafeToSpend()` — paints instantly from cache.
- **Home hero number**: tapping it opens a breakdown bottom sheet showing each input that fed the total.
- **`safeToSpend`** home-screen widget (`WidgetKey`).
- **`check_affordability`** chat result renders as a yes/no chip with the `reasonCode`.

### API Endpoints

`GET /insights/safe-to-spend` — behind `JwtAuthGuard + AccountContextGuard`. No `SubscriptionTierGuard` — available on the free plan.

## Financial Wrapped

The `insights` module (ABA-336) assembles a Spotify-Wrapped-style year-in-review entirely from existing data — no new tables, no LLM cost for the numbers themselves.

### How It Works

1. **Assembly**: the pure, unit-tested `assembleWrapped` (`wrapped.util.ts`, mirrors `safe-to-spend.util.ts`) builds an ordered discriminated-union list of `WrappedCard`s — `intro`, `total_tracked`, `top_merchant` (by visit count, tie-broken by spend), `biggest_month`, `top_category`, `category_mix`, `receipts_scanned` (OCR/notification-sourced expenses), `savings` (net + rate + year-over-year comparison), `personal_inflation` (reuses the Personal Inflation Index's rolling-12-month index, current/previous year only), and `streak` (from the gamification `StreakService`). Only cards backed by real data are included.
2. **Data floor**: `hasEnoughData: false` (with an empty card list) when the account has fewer than 5 tracked rows for the year, or when the account uses full (tier-2) end-to-end encryption.
3. **Currency**: every amount is FX-converted to the user's display currency via `getRatesSafe`/`convertAmount`, with an `fxApproximate` flag when a rate is unavailable (the amount is excluded from the affected sum rather than reported wrong).
4. **`wrapped.service.ts`** is a thin IO wrapper around `assembleWrapped` — it fetches the raw rows and hands them to the pure function, keeping the interesting logic unit-testable without a database.

### Caching

Result is cached in Redis under `wrapped:{accountId}:{baseCurrency}:{year}`, TTL 3600 s. The `year` query param is clamped to `[2000, currentYear]`.

### Mobile Integration

- **`useWrapped`** hook + `api.getWrapped(year)`.
- **`app/wrapped/index.tsx`**: a full-screen, swipeable gradient card deck — built with zero new native modules (a paging `ScrollView` + `expo-linear-gradient`), progress dots, and an amount-hiding toggle.
- **Sharing**: a plain-text share (`Share.share`) composed from `wrapped.share*` i18n strings, plus a **shareable image** — `WrappedShareCard.tsx` renders a hidden `react-native-webview` hosting a self-contained HTML/canvas story card (1080×1920), exports it to PNG via `canvas.toDataURL`, and shares it through `expo-sharing`; falls back to the text share on web or on any failure.
- **Entry point**: a banner in the Analytics tab.

### API Endpoints

`GET /insights/wrapped?year=YYYY` — behind `JwtAuthGuard + AccountContextGuard`. No `SubscriptionTierGuard` — free, for shareability (same precedent as Safe-to-Spend).

## Personal Inflation Index

The `price-history` module (ABA-307) computes a Laspeyres price index over the account's receipt line items, enabling users to track how their personal "shopping basket" prices change over time without any AI cost.

### How It Works

1. **Data capture**: The OCR service (`ocr.service.ts`) sets `ReceiptItem.canonicalName` for each scanned line item via a `buildCanonicalNameFallback(description)` heuristic. User-defined aliases (`product_aliases` table, `@@unique([accountId, rawName])`) can override raw OCR names to a clean canonical form.
2. **Storage**: `ExpenseItem.canonicalName` (migration `20260702160001_add_expense_item_canonical_name`) persists the resolved canonical name alongside the raw `description`.
3. **Index calculation**: `PriceHistoryService.getInflationIndex(accountId, period)` fetches the earliest and latest unit prices per canonical product within the period, computes a Laspeyres index (`Σ(p₁ × q₀) / Σ(p₀ × q₀)`), and caches the result in Redis (`ph:{accountId}:{period}`, TTL 300 s).
4. **Product management**: Users can view per-product price trends, create/update raw→canonical aliases, and merge duplicate product variants (5 endpoints, all free-tier, `ViewerBlockGuard` on write paths).

### Database Tables

- `expense_items.canonical_name TEXT` — nullable column added to the existing `expense_items` table (migration `20260702160001`)
- `product_aliases` — new table: `id`, `accountId`, `rawName`, `canonicalName`, `createdAt`, `updatedAt`; `@@unique([accountId, rawName])` (migration `20260702160002_add_product_aliases`)

### Mobile Integration

- **`priceHistoryStore.ts`**: server-only Zustand store (no SQLite cache — prices require cross-device consistency)
- **`priceHistory.api.ts`**: API client methods for all 5 endpoints
- **`InflationIndexSection`**: component in the Analytics tab showing the current index value and per-product price changes
- **`app/settings/products.tsx`**: product alias management screen; accessible from the reference-data hub

### API Endpoints

`GET /price-history`, `GET /price-history/products`, `PATCH /price-history/products/alias`, `DELETE /price-history/products/alias/:rawName`, `POST /price-history/products/merge` — all behind `JwtAuthGuard + AccountContextGuard`; write endpoints guarded by `ViewerBlockGuard`. No `SubscriptionTierGuard` — available on the free plan.

## Inflation Shield

The `insights` module (ABA-346) builds on the Personal Inflation Index's per-product price series to forecast which tracked products are about to get more expensive and recommends stocking up on them **now**, plus tracks how much money that advice has actually saved. Fully deterministic — no LLM cost.

### How It Works

1. **Forecast engine** (`inflation-shield.util.ts`, pure and unit-tested): `forecastProductTrend` runs a least-squares regression over a `SHIELD_FORECAST_LOOKBACK_WEEKS` (12) window, gated by a minimum time span (`minSpanDays`, 14) and a `hasSignal` flag for products with too little history. `estimateCadenceDays` derives how often a product is typically bought. `isStockpileable` conservatively excludes short-cadence perishables (e.g. milk) below `SHIELD_MIN_CADENCE_DAYS` (14) and stays silent on unknown cadence rather than guessing.
2. **Recommendation**: `recommendStockUp` sizes the stock-up quantity as weekly consumption × `min(horizon, SHIELD_MAX_STOCK_WEEKS)` (8), capped at `SHIELD_MAX_UNITS` (12). `projectedSaving` is deliberately **halved** — a linear-ramp avoided-cost model `(projectedPrice − currentPrice) / 2 × quantity`, not the full end-of-horizon price gap, since the user won't hold every unit until the price fully rises.
3. **Assembly**: `assembleShield` keeps only products that are rising at least `SHIELD_MIN_MONTHLY_RISE_PCT` (5%) per month, are stockpileable, and have ≥3 price points (`SHIELD_MIN_POINTS`). Every amount is FX-converted to the account's display currency (with an `fxApproximate` flag), and the basket-wide forecast percentage weights only products with `hasSignal: true`. All thresholds are env-tunable via `SHIELD_*` variables, with defaults in `SHIELD_DEFAULTS`.
4. **Data sources**: `PriceHistoryService.getProductTrends(accountId)` supplies each product's price series (reusing the Personal Inflation Index's private row-fetching); `SafeToSpendService.compute` supplies each item's `affordableToday` flag (stock-up cost ≤ projected available safe-to-spend).
5. **Scope**: Plan 1 is **personal-only** — the engine accepts an optional community `store`/`currentBestPrice` input, but the community-boost integration (resolving the cheapest store via `CommunityPriceService`) is deferred until the Community Price Map's anti-Sybil hardening is validated and its read kill-switch is turned on.

### Realized Savings Tracking

A separate leaf module, `InflationShieldTrackingService`, is Prisma-only (no service dependencies) and is imported by both `InsightsModule` and `ExpensesModule` to stay cycle-free:

- **`recordRecommendations`**: snapshots the current recommendation set once per `(accountId, canonicalName, periodMonth)` — idempotent via create + catch-`P2002` outside any transaction, so the first snapshot of the month wins.
- **`reconcilePurchase`**: fired from `ExpensesService.create`'s post-create hook (`@Optional()` injection, same fire-and-forget pattern as `familyFeed`/`communityPrices`) whenever a new expense is created. Matches an `active` recommendation by exact `canonicalName`, quantity ≥ half the recommended amount, and a calendar-day date gate (`expense.date >= floor(recommendedAt)`) — never a cross-currency price comparison. A match is marked `acted` and credits a proportional share of `projectedSaving` toward `savedSoFar`.
- **`getShield`** fire-and-forgets `recordRecommendations` before populating the Redis cache, and returns a real FX-summed `savedSoFar` (flagging `fxApproximate` if any acted recommendation needed currency conversion).
- **Cache invalidation**: a new expense busts both `shield:{accountId}:*` and the AI tool's `chat:get_inflation_shield:*` cache keys, so the shield is never served stale right after a stock-up purchase.

### Database Tables

- `inflation_shield_recommendations` — snapshot of recommendations per `(accountId, canonicalName, periodMonth)`, with a `ShieldStatus` enum (`active` | `acted` | `expired`).

### AI Chat Integration

`get_inflation_shield` is a **read** AI chat function (not in `isWriteAction` — it executes immediately through the cached/narrated read path, same as `get_expenses`/`get_budget_status`). It takes no parameters. The prompt instructs the model to report numbers verbatim, frame savings as an **estimate**, and always use the response's `baseCurrency` rather than each item's `currencyOriginal`.

### Mobile Integration

- **`inflationShieldStore`**: MMKV-cached, server-only Zustand store — paints instantly from cache, keeps the last known state on a fetch error, no upgrade gate (the feature is free).
- **`useInflationShield`** hook + `api.getInflationShield()`.
- **`InflationShieldWidget`**: home-screen widget (`WidgetKey: 'inflationShield'`, ordered after `safeToSpend`); hidden when there's no data.
- **`app/inflation-shield/index.tsx`**: full screen — hero "saved so far" estimate, basket-wide forecast, buy-ahead cards with an affordability badge, pull-to-refresh, empty state.
- **Share image**: `InflationShieldShareCard.tsx` mirrors the Financial Wrapped share card's architecture (an off-screen WebView renders an HTML/canvas story image, exported as PNG via `expo-sharing`) with a distinct green gradient; a `Share.share` text fallback covers web and any failure.

### API Endpoints

`GET /insights/inflation-shield` — behind `JwtAuthGuard + AccountContextGuard`. No `SubscriptionTierGuard` — available on the free plan (same precedent as Safe-to-Spend and Financial Wrapped).

## Receipt Price Check

ABA-373. A receipt-scan-time check that compares each line item against this user's own **median** price for that same product at that same store, and surfaces lines that cost measurably more — while the user is still standing at the register. Fully deterministic (no LLM cost) and required no database migration; it reads the same `expense_items.canonical_name` corpus the Personal Inflation Index already populates.

### How It Works

The entire comparison lives in one pure, unit-tested module: `modules/price-history/receipt-check.util.ts`, exporting `checkReceiptPrices(input)`.

1. **Grouping**: `groupReceiptLines` collapses a receipt's line items by normalized product name into a quantity-weighted average unit price, so one product produces at most one finding even if a receipt lists it on several lines.
2. **Baseline**: for each grouped line, `PriceHistoryService.getProductTrendsFor(accountId, canonicalNames, merchantNormalized, since, currencyCode, excludeExpenseId?)` fetches this account's own prior `ExpenseItem` rows for that exact product **at that exact merchant**, in the same currency, within a `RECEIPT_CHECK_LOOKBACK_WEEKS` (default 12) window. The baseline is the **median** of those prior unit prices — median rather than mean specifically to resist a single outlier purchase skewing the comparison.
3. **Threshold**: a line is only reported when it costs at least `RECEIPT_CHECK_MIN_RISE_PCT` (default 15%) above the baseline **and** the absolute overpaid amount clears `RECEIPT_CHECK_MIN_AMOUNT` (default 1.0, in the receipt's own currency) — a 20% rise on a $0.10 item is not worth surfacing. A rise above `RECEIPT_CHECK_MAX_RISE_PCT` (default 100%) is dropped rather than reported: an enormous jump is far more likely to be a different product (or a misread OCR line) than a genuine price change, and reporting it would erode trust in every other finding.
4. **Confidence**: a product needs at least `RECEIPT_CHECK_MIN_POINTS` (default 2) prior purchases at that store before it says anything at all. `confidence: 'low'` when the baseline rests on exactly the minimum (2 points); `'high'` on 3 or more. The mobile card renders a "based on only two earlier purchases" caveat on `'low'` findings.
5. **Scope discipline**: the comparison is **same product, same store, same currency, always** — `getProductTrendsFor` filters both merchant and currency in JS before a price ever reaches the median calculation, and a product with history in a different currency than the current receipt is simply skipped, never converted. Different pack sizes are already different products, because the OCR-assigned `canonicalName` keeps the size in the string (e.g. `"Mleko Łaciate 3,2% 1L"` vs the 0.5 L variant) — no separate pack-size gate is needed.
6. **Output cap**: at most `RECEIPT_CHECK_MAX_FINDINGS` (default 5) findings are returned per receipt, sorted by `overpaidAmount` descending.
7. **Wording discipline**: `ReceiptCheckFinding` (`packages/shared-types/src/dto/receipt-check.ts`) and every consumer of it are deliberately framed as "this costs more than usual — worth checking the receipt", never as a claim that the user was overcharged or that a discount was withheld — a receipt cannot prove either of those, and a silently-unapplied promotion is the most common real cause. The response's running total is named `overpaidAmount`/"found", never "saved".
8. **Community baseline (reserved, unused)**: the engine accepts an optional `community: CommunityBaseline[]` input as a fallback when personal history is too thin, but no caller supplies it yet — every finding today has `source: 'personal'`. This mirrors the same deferred-until-validated posture as the Inflation Shield's community-boost and the Community Price Map's anti-Sybil hardening.

### Two Call Sites

The same deterministic engine is called from exactly two places, for two different reasons:

1. **Scan time** — `OcrService.finalizeReceipt()` (the single funnel every one of the four scan paths — mobile camera/gallery/PDF and all three chat bots — passes through before returning a `ReceiptExpense`) calls a private `runPriceCheck(accountId, receipt)` and sets `receipt.priceFindings`. This runs **before the expense exists**, so there is no expense id yet to build a dedup key from or to attach the finding to — the result is returned inline in the scan response and rendered immediately, without ever touching the database.
2. **Post-create** — `AnomalyService.detectPriceOvercharge(accountId, userId, expense)`, called from `checkExpense()` alongside the other anomaly detectors once the expense (and its `ExpenseItem` rows) are committed. This pass persists one `price_overcharge` feed row per receipt (see **Feed & Summary** below) so the finding survives after the scan screen is closed and powers the Analytics-tab yearly total.

Both call sites run the identical `checkReceiptPrices()` function, so they can never disagree about what counts as a finding — the only difference is what each does with the result (render vs. persist). **The post-create pass must exclude the receipt under examination from its own baseline**: by the time `detectPriceOvercharge` runs, `ExpensesService.create` has already committed the new expense's `ExpenseItem` rows, so without `excludeExpenseId: expense.id` on the `getProductTrendsFor` call, the receipt being checked would count as one of its own prior purchases — inflating (or in a single-prior-purchase case, fabricating) its own baseline and silently disagreeing with the scan-time result for the same receipt.

### Feed & Summary

- **Alert type**: `price_overcharge` is written via the same `AnomalyService.createAlert()` path as every other anomaly type, but with `skipPush: true` — it is feed-only and never sent as a push notification, because a push arriving after the user has left the store has nothing actionable in it. `params` holds `{ merchant, currencyCode, totalAmount, findings }`.
- **Release gate**: `AnomalyService.receiptCheckAlertsEnabled()` reads `RECEIPT_CHECK_ALERTS_ENABLED` (default off). This gate covers **only the write** — when off, `detectPriceOvercharge` computes the findings, logs them, and returns without creating an alert row; the scan-time inline card and the bot summary line are unaffected, since neither goes through this gate. The gate exists because the alerts-feed UI for `price_overcharge` ships in a mobile release that must roll out first — turning the write on before that release reaches users would show already-installed apps a card titled with the raw `price_overcharge` type string and an empty body.
- **Summary endpoint**: `GET /alerts/price-check-summary` (`AnomalyController`, declared before the `:id` routes — same ordering rule as `bulk`/`read-all` elsewhere in this codebase) sums `overpaidAmount` across all non-dismissed `price_overcharge` alerts created since the start of the current UTC calendar year, grouped **per currency** (never blended — this feature converts nothing). Powers the Analytics tab's "Found X above your usual prices this year" line, which itself picks a single currency to display (`pickFoundTotal`: the user's own display currency if anything was found in it, else the largest total) rather than ever summing across currencies.

### Configuration

All thresholds are env-tunable via `resolveReceiptCheckConfig(env)`, with defaults in `RECEIPT_CHECK_DEFAULTS`:

| Env var | Default | Meaning |
|---|---|---|
| `RECEIPT_CHECK_LOOKBACK_WEEKS` | 12 | How far back prior purchases are pulled for the baseline |
| `RECEIPT_CHECK_MIN_POINTS` | 2 | Minimum prior purchases at that store before any finding is reported |
| `RECEIPT_CHECK_MIN_RISE_PCT` | 15 | Minimum % above the median baseline to qualify as a finding |
| `RECEIPT_CHECK_MAX_RISE_PCT` | 100 | Rises above this are dropped as "probably a different product", not reported |
| `RECEIPT_CHECK_MIN_AMOUNT` | 1.0 | Minimum absolute overpaid amount (receipt's own currency) to bother reporting |
| `RECEIPT_CHECK_MAX_FINDINGS` | 5 | Cap on findings returned per receipt |
| `RECEIPT_CHECK_ALERTS_ENABLED` | off | Release gate — see **Feed & Summary** above; a negative or malformed override is clamped to 0, never inverted |

### Mobile & Bot Integration

- **Scan-confirmation screen**: `PriceFindingsCard.tsx` renders a collapsed card ("N items cost more than usual · about X more") that expands to per-product rows (usual price, paid price, difference, and a low-confidence caveat where relevant). It is purely informational — it never blocks saving the receipt and never edits any amount.
- **Chat bots** (Telegram, WhatsApp, Slack): each bot's `photo.handler.ts` calls a shared `buildPriceCheckLine(receipt, lang)` helper that appends one extra line to the receipt confirmation message when `receipt.priceFindings` is non-empty, worded identically to the mobile card's honest framing, localized via each bot's own `helpers/i18n.ts` (`priceCheckSummary` key, 9 languages).
- **Alerts bell**: `app/alerts/index.tsx` renders `price_overcharge` alerts with title/body from `alerts.priceCheckTitle`/`alerts.priceCheckBody` — gated end-to-end by `RECEIPT_CHECK_ALERTS_ENABLED`, since no such alert rows exist while the gate is off.
- **Analytics tab**: `InflationIndexSection.tsx` calls `GET /alerts/price-check-summary` and renders the yearly "found" total via `pickFoundTotal`, only when at least one currency has a positive total.

### API Endpoints

`GET /alerts/price-check-summary` — behind `JwtAuthGuard + AccountContextGuard`, no `ViewerBlockGuard` (reading the summary mutates nothing). See [API.md](./API.md#price-check-summary).

## Smart Shopping List

The `shopping-list` module (ABA-330) provides shared, offline-first shopping lists plus a Pro-gated basket price comparison, all built on the receipt price-history corpus.

### Offline-First Sync

Unlike most entities, shopping lists do **not** use the generic `/sync/push|pull` machinery. The mobile app keeps its own SQLite mirror (`shopping_lists` / `shopping_list_items`, each row carrying a `sync_status`) and reconciles through the REST CRUD endpoints directly:

1. Load local rows → paint the screen instantly.
2. Push pending rows via `POST/PATCH/DELETE /shopping-list…` (create then update, so an offline rename/archive isn't reverted).
3. Pull the full server state via `GET /shopping-list`, merge-upsert, and tombstone-by-absence.

A local row's `id` is permanently its `clientId` (it never adopts the server PK), and a row is marked synced only on the server ack. The server CRUD resolves every list/item by `OR: [{ id }, { clientId }]`, and direct-POST creates are idempotent on `clientId`, so a retried or duplicated create returns the existing row instead of duplicating it. `getLists` also returns archived lists, so a cross-device archive is never mistaken for a delete.

### Pure Calculators

Three pure, unit-tested functions drive the intelligence (no AI cost):

- **`computeBasket`** (`price-history/basket-calculator.ts`) — prices a basket per store from each store's latest unit price, coverage-gates the "cheapest" badge (full coverage, else the best store ≥80% covered), flags stale prices, and (with an optional origin) adds per-store `distanceKm` / `nearby` via haversine. Backs the Pro-gated `POST /price-history/basket`.
- **`predictRestock`** (`shopping-list/restock-predictor.ts`) — median gap between purchases of a canonical product (≥3 points) → free `GET /shopping-list/suggestions`.
- **`detectDeals`** (`shopping-list/deal-detector.ts`) — a store's recent unit price ≥15% below the product's 90-day average within a 14-day window → free `GET /shopping-list/deals`.

A daily cron (`shopping-reminder.cron.ts`, `0 10 * * *`) pushes the top due restock (`shopping_reminder`) and the top price drop (`shopping_deal`) per account, each gated by its own preference (`notifyShoppingReminders` / `notifyShoppingDeals`).

### Database Tables

- `shopping_lists` / `shopping_list_items` — `@@unique([accountId, clientId])`, soft-delete + `sync_version`, cascade FKs (migration `20260707173751_add_shopping_lists`)

### API Endpoints

`GET/POST /shopping-list`, `PATCH/DELETE /shopping-list/:id`, `POST /shopping-list/:id/items`, `PATCH/DELETE /shopping-list/items/:itemId`, `POST /shopping-list/:id/clear-checked`, `GET /shopping-list/suggestions`, `GET /shopping-list/deals` — all behind `JwtAuthGuard + AccountContextGuard`. Item writes are collaborative (**not** `ViewerBlockGuard`-gated); only `DELETE /shopping-list/:id` requires an editor or owner role. The basket comparison `POST /price-history/basket` additionally carries `SubscriptionTierGuard` + `@RequireTier('pro')`.

## Receipt Splitting

The `receipt-split` module lets the payer of a shared bill split it among people who don't have the app, via a public, tokenized guest link — no account, no JWT, no `X-Account-Id`.

### How It Works

1. The payer assigns each scanned receipt's line items to a named participant, or splits the whole bill evenly when there are no line items, via `POST /expenses/:id/receipt-split`. The splitting math (`split-calculator.ts`'s pure `resolveItemSplit`/`resolveEqualSplit`) works in integer cents and always leaves the rounding remainder with the payer.
2. That write creates one `receipt_split_participants` row **and** one `isDebt: true, isSplitReceivable: true` Expense per participant — the receivable — alongside the original receipt Expense (the outflow), all in a single transaction.
3. Each participant gets their own 128-bit random token and a public URL: `GUEST_LINK_BASE + /s/<token>?lang=<payer's user.language>`. `GUEST_LINK_BASE` is `APP_PUBLIC_URL` if set, else `https://api.ai-budget.pl` (which already serves the route) — the pretty apex form needs a `location /s/` nginx block that does not ship with the code (see `docs/ops/receipt-split-rollout.md`).
4. A guest opens `GET /s/:token` and sees only their own name, amount, assigned items, the payer's name, and a payment link/instructions — never another participant's data, the receipt image, or any account identifier. An unknown, expired, and cancelled token all produce byte-identical responses.
5. The guest's `POST /s/:token/paid` flips their status to `claimed` and pushes `split_payment_claimed` to the payer. The payer reviews the per-participant status list (`sent → opened → claimed → settled`) and calls `PATCH /expenses/:id/receipt-split/:participantId/confirm`, which runs the debt through the exact same `DebtsService.recordRepayment` path a manual repayment takes, under an atomic `settledAt IS NULL` claim.

### Accounting Correctness

Splitting a 200 bill among three guests creates the 200 receipt Expense **plus** three 50 `isSplitReceivable` Expenses. Counting both would report 350 of spend for one dinner. `common/utils/expense-filters.ts` exports `EXCLUDE_SPLIT_RECEIVABLE = { isSplitReceivable: false }`, the single shared predicate spread into every user-facing total in `analytics.service.ts`, `budget-alert.service.ts`, `safe-to-spend.service.ts`, and `wallet.service.ts`. The filter is deliberately on `isSplitReceivable`, never `isDebt` — for a standalone cash loan the debt row IS the outflow, so filtering on `isDebt` would silently rewrite the numbers of every user who already tracks debts. Mobile mirrors this with `filterConsumption()` (`apps/mobile/src/utils/consumption.ts`), consumed by seven client-side surfaces (`NetProfitWidget`, `useFilteredTransactions`, `useSafeToSpend`, `useScenarioProjection`, `useCalendarData`, `widgetData`, `budgetStore`).

### Database Tables

- `receipt_split_participants` — `id`, `accountId`, `expenseId` (FK `onDelete: Cascade`, which only fires on a genuine hard delete — the app soft-deletes expenses, so `ExpensesService.remove` explicitly expires a deleted expense's split), `seq`, `name`, `token` (`@unique`), `amount`, `currencyCode`, `itemIds` (`Json?`), `debtExpenseId`, `openedAt`/`claimedAt`/`settledAt`/`cancelledAt`/`expiresAt` (migrations `20260726120000_add_receipt_split`, `20260726130000_add_receipt_split_cancelled_at`).
- Partial unique index `receipt_split_live_slot` on `(expense_id, seq) WHERE cancelled_at IS NULL` (migration `20260727120000_add_receipt_split_participant_seq`) — enforces at most one **live** split per expense: a concurrent double-create collides on it (caught outside the `$transaction`), and a re-split after cancellation is free to reuse `seq 0` because the cancelled rows have dropped out of the index.
- `expenses.is_split_receivable` (`Boolean @default(false)`) — marks a participant's receivable Expense so it can be excluded from totals (see Accounting Correctness above).
- `users.payment_method` / `users.payment_handle` (`SettleMethod?` / `String?`) — added in the same first migration; the guest page's payment link resolves the payer's user-level payment info first, falling back to their `AccountMember`-level trip-wallet payment info when either is unset at the user level.

### API Endpoints

`POST/GET/PATCH/DELETE /expenses/:id/receipt-split*` — all behind `JwtAuthGuard + AccountContextGuard` (class) plus `ViewerBlockGuard` + `TripArchivedGuard` (route), including the `GET`. `GET /s/:token` and `POST /s/:token/paid` are the only unauthenticated surface in the app — both excluded from the `/api/v1` prefix in `main.ts`, throttled 20/60s and 10/60s per IP respectively. See [API.md](./API.md#receipt-splitting).

## Expense Geo-Location & Map

Expenses can carry a location (`{ lat, lng, name? }`), and any filtered set of expenses can be shown on a map. Added in ABA-310 (feature) with ABA-311 (structured geocoding).

### How It Works

1. **Coordinate sources** (priority: manual pin > receipt address > device GPS):
   - **Receipt address** — during `POST /ai/scan-receipt`, `OcrService` extracts the store's structured address (`merchantStreet`/`merchantCity`/`merchantPostalCode`/`merchantCountry`, deliberately ignoring the seller company's registered office) and `GeocodingService` resolves it. Needs no device permission.
   - **Device GPS** — opt-in only (default off; toggle in Settings → Data & Reports). Attached at creation time to expenses added manually, by voice, or by bank-notification capture. Requires the location permission.
   - **Manual pin** — the user places/adjusts the pin on the expense location screen; sending `location: null` clears it.
2. **Geocoding** (`modules/ai/services/geocoding.service.ts`): uses OpenStreetMap/Nominatim's **structured** endpoint (separate `street`/`city`/`postalcode`/`country` params — far more robust than free text on Polish receipts that print the store address AND the company's registered seat), strips the street-type prefix (`ul.`, `al.`, Cyrillic `вул.`/`ул.`…) that the structured `street` param rejects, and falls back to a town/postcode centroid when the exact building is not found. Results, including "not found" negatives, are cached in `geocode_cache`; identifying User-Agent, ≥1.1 s request spacing, 5 s timeout, and fail-silent (a lookup failure never blocks receipt scanning).
3. **Map rendering** — client-side only, no server-side geo queries. `ExpenseMapView` renders OpenStreetMap tiles + clustered pins inside a WebView (native) / iframe (web) using an inlined Leaflet bundle — no native map module and no API key. Pins are built from the locally-held expense list.

### Database Tables

- `expenses.location_lat` / `location_lng` (`Decimal`) + `location_name` (`TEXT`) — location columns on the existing `expenses` table (`lat`/`lng` existed dormant since an early schema; `location_name` added in migration `20260703161013_add_expense_location_name_and_geocode_cache`). `location_lat`/`location_lng` are in the E2EE **tier-2** field set, `location_name` in **tier-1**.
- `geocode_cache` — global (not account-scoped) address→coordinate cache: `id`, `queryNormalized` (`@unique`), `lat`/`lng` (`Decimal?`, NULL = negative "no match" entry), `displayName`, `createdAt` (same migration).

### Mobile Integration

- **`locationCapture.ts`** + **`locationSettingsStore.ts`** (MMKV, default off): opt-in GPS capture (`expo-location`), 4 s timeout, never blocks a save.
- **`ExpenseMapView`** (`src/components/map/`): WebView/iframe Leaflet map. The HTML is a committed, self-contained asset generated by `scripts/build-map-html.js` (`npm run generate:map-html`) with Leaflet, markercluster and the marker icons inlined as base64 data URIs — never edit `mapHtml.generated.ts` by hand.
- **Surfaces**: List/Map toggle on the Expenses tab (inherits the period/category/merchant filters), a mini-map + pin editor on the expense detail screen, and a "Trip map" entry on trip accounts.

### API Endpoints

No new REST endpoints — the map is rendered entirely on the client from expense data. Location flows through the existing expense create/update/list endpoints (`location` request field; `locationLat`/`locationLng`/`locationName` response fields) and the `POST /ai/scan-receipt` `location` response field.

## Merchant Tracking

`Expense.merchant` is a free-text column (Prisma `merchant String?` + `@@index([accountId, merchant])`; mobile SQLite `merchant TEXT`). Income has no merchant field.

- **Auto-fill**: populated from receipt OCR (mobile + Telegram/WhatsApp photo handlers) and bank/Wise import commit; manually editable via the shared `MerchantInput` component (free text + autocomplete from `getDistinctMerchants()`)
- **Encryption**: encrypted client-side **like `description`** — it lives in `ENCRYPTION_FIELDS.expense.tier1`, so push paths run it through `maybeEncrypt` and the pull merge reads `decrypted.merchant`
- **Management**: a Settings → **Merchants** screen lists distinct merchants with counts and supports rename / merge / delete (`renameMerchant(from, to|null)` → in-memory update + one account-scoped `bulkRenameMerchant` SQL `UPDATE` → re-sync, which re-encrypts for E2EE)
- **Capture reconciliation**: OCR and voice pre-fill the merchant via `resolveExistingMerchant()` (exact case-insensitive match snaps to the canonical value)
- **Filtering is client-side only** (no `?merchant=` API param): `ExpenseFilters.merchants: string[]` multi-select; the Expenses-tab search box also matches merchant substring

## Gamification

The gamification system encourages consistent financial tracking through achievements, streaks, and XP progression.

### Components

- **Achievement Definitions**: 14 static achievements defined in code (not DB), categorized as milestone, budget, streak, and savings
- **XP System**: 100 XP per level, achievement XP ranges from 10 (common) to 500 (legendary)
- **Daily Streak**: Tracks consecutive days of expense/income activity using user's timezone
- **Rarity Tiers**: common, rare, epic, legendary — with distinct visual styling

### Architecture

- **Server-side computation**: Achievements are evaluated on the API using Prisma queries, then synced to mobile SQLite cache
- **Fire-and-forget triggers**: `GamificationService.checkAchievements()` is called after expense/income/budget creation, wrapped in try/catch to never block core operations
- **Module integration**: `GamificationModule` is imported by `ExpensesModule`, `IncomesModule`, and `BudgetsModule`

### Mobile Components

| Component | Purpose |
|-----------|---------|
| `AchievementBadge` | Single badge display with rarity colors and progress bar |
| `StreakWidget` | Streak count with fire emoji and longest streak |
| `LevelProgress` | XP progress bar with level indicator |
| `NewBadgeModal` | Celebration overlay when achievement is unlocked |

### Database Tables

- `UserAchievement` — tracks per-user achievement progress and completion (unique on `[userId, accountId, achievementId]`)
- `UserStreak` — tracks daily tracking streak per user/account (unique on `[userId, accountId, streakType]`)

## Investment Portfolio

Investment portfolio tracking enables users to monitor stocks, ETFs, crypto, bonds, and commodities with real-time market data.

### Technology

- **Price Data**: Twelve Data API for real-time and historical prices
- **Account Type**: Requires `investment` type account
- **Asset Support**: Stocks, ETFs, crypto, bonds, commodities

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Mobile Client  │────►│  NestJS Backend │────►│  Twelve Data    │
│  (Analytics)    │     │  (investments/) │     │  API            │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   PostgreSQL    │
                        │  (Price Cache)  │
                        └─────────────────┘
```

### Module Structure

```
src/modules/investments/
├── investments.module.ts
├── investments.controller.ts
├── investments.service.ts
├── investment-insights.service.ts  # GPT-4 portfolio insights generation
├── twelve-data.service.ts          # External API integration
└── dto/
    └── index.ts                    # CreateHolding, CreateTransaction, Analytics DTOs
```

### Data Model

```prisma
model Asset {
  id             String    @id @default(uuid())
  symbol         String    @unique
  name           String
  type           AssetType // stock, crypto, etf, bond, commodity
  exchange       String?
  currentPrice   Decimal?  @db.Decimal(18, 8)
  priceCurrency  String    @default("USD")
  logoUrl        String?
  lastPriceUpdate DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  holdings      PortfolioHolding[]
  priceHistory  AssetPriceHistory[]
}

model PortfolioHolding {
  id              String    @id @default(uuid())
  localId         String
  accountId       String
  userId          String
  assetId         String
  quantity        Decimal   @db.Decimal(18, 8)
  averageCostBasis Decimal  @db.Decimal(18, 8)
  totalInvested   Decimal   @db.Decimal(18, 2)
  notes           String?
  isDeleted       Boolean   @default(false)
  syncStatus      String    @default("pending")
  syncVersion     Int       @default(0)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  account      Account
  user         User
  asset        Asset
  transactions InvestmentTransaction[]

  @@unique([accountId, localId])
}

model InvestmentTransaction {
  id           String   @id @default(uuid())
  localId      String
  holdingId    String
  accountId    String
  userId       String
  type         String   // buy, sell
  quantity     Decimal  @db.Decimal(18, 8)
  pricePerUnit Decimal  @db.Decimal(18, 8)
  totalAmount  Decimal  @db.Decimal(18, 2)
  fee          Decimal  @default(0) @db.Decimal(18, 2)
  date         DateTime @db.Date
  notes        String?
  isDeleted    Boolean  @default(false)
  syncStatus   String   @default("pending")
  syncVersion  Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  holding PortfolioHolding
  account Account
  user    User

  @@unique([accountId, localId])
}

model AssetPriceHistory {
  id         String   @id @default(uuid())
  assetId    String
  date       DateTime @db.Date
  openPrice  Decimal  @db.Decimal(18, 8)
  closePrice Decimal  @db.Decimal(18, 8)
  highPrice  Decimal  @db.Decimal(18, 8)
  lowPrice   Decimal  @db.Decimal(18, 8)
  volume     BigInt?
  createdAt  DateTime @default(now())

  asset Asset

  @@unique([assetId, date])
}
```

### Analytics Calculations

| Metric | Formula |
|--------|---------|
| Portfolio Return % | `((End Value - Start Value) / Start Value) × 100` |
| P&L | `Current Value - Total Invested` |
| P&L % | `(P&L / Total Invested) × 100` |
| Allocation % | `(Holding Value / Total Portfolio Value) × 100` |
| Benchmark Return | API returns normalized values (first = 0, subsequent = cumulative %) |

### Price Update Strategy

1. **Automatic**: Prices refresh every 15 minutes for active portfolios
2. **Manual**: Users can trigger immediate refresh via `POST /investments/refresh-prices`
3. **Caching**: Historical prices stored in `AssetPriceHistory` table to minimize API calls
4. **Fallback**: Last known price used when current price unavailable

### Mobile Screens

```
app/investment/
├── index.tsx           # Portfolio overview (holdings list, summary)
├── analytics.tsx       # Performance charts, benchmark comparison
├── holding/
│   ├── [id].tsx        # Holding details with transactions
│   └── new.tsx         # Add new holding (asset search)
└── transaction/
    └── new.tsx         # Add buy/sell transaction
```

### Mobile Store

```typescript
// useInvestmentStore
{
  holdings: PortfolioHolding[],
  summary: PortfolioSummary | null,
  analytics: PortfolioPerformance | null,
  aiInsights: AIInsightChart[],
  insightsLoading: boolean,

  loadHoldings: () => Promise<void>,
  loadSummary: () => Promise<void>,
  loadAnalytics: (period, benchmark?) => Promise<void>,
  createHolding: (dto) => Promise<void>,
  createTransaction: (dto) => Promise<void>,
  refreshPrices: () => Promise<void>,
  loadInvestmentInsights: (language?) => Promise<void>,
  dismissInsight: (id: string) => void,
}
```

### AI Portfolio Insights

The investment module includes GPT-4-powered portfolio insights that analyze holdings and provide actionable recommendations.

**Insight Types:**

| Type | Description | Severity Triggers |
|------|-------------|-------------------|
| `concentration_risk` | Single asset dominates portfolio | Critical: >40%, Warning: >25% |
| `sector_imbalance` | Portfolio heavily weighted to one asset type | Critical: >70%, Warning: >50% |
| `underperformer` | Asset significantly lagging benchmark | Critical: <-30%, Warning: <-15% |
| `overperformer` | Asset significantly beating benchmark | Info: >+20% (rebalance opportunity) |
| `benchmark_deviation` | Portfolio straying from benchmark | Critical: >25%, Warning: >15% |
| `diversification_gap` | Missing asset types | Critical: <2 types, Warning: <3 types |
| `cost_basis_alert` | Tax-relevant unrealized gains/losses | Critical: >50% or <-30% |
| `fee_impact` | Transaction fees eating returns | Critical: >5%, Warning: >2% |

**Architecture:**
- **Caching**: Insights are cached for 24 hours per account
- **Subscription**: Requires Pro+ tier (2.5 AI credits per request)
- **Localization**: Supports all 8 app languages
- **Charts**: Each insight includes appropriate visualization (donut, bar, line)

## Security

### Authentication Flow

```
┌─────────────────┐                    ┌─────────────────┐
│     Client      │                    │     Server      │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │  POST /auth/login                    │
         │  { email, password }                 │
         │  ──────────────────────────────────► │
         │                                      │
         │  ◄────────────────────────────────── │
         │  { accessToken, refreshToken }       │
         │                                      │
         │  Store tokens securely               │
         │  (expo-secure-store)                 │
         │                                      │
         │  GET /expenses                       │
         │  Authorization: Bearer <token>       │
         │  X-Account-Id: <account-uuid>        │
         │  ──────────────────────────────────► │
         │                                      │
         │  Token expired? Refresh              │
         │  POST /auth/refresh                  │
         │  { refreshToken }                    │
         │  ──────────────────────────────────► │
         │                                      │
```

### Security Measures

- **JWT Tokens**: Short-lived access tokens (15min), long-lived refresh tokens (7d)
- **Secure Storage**: Tokens stored in device keychain/keystore
- **Biometric Auth**: Optional fingerprint/face unlock
- **API Key Proxy**: OpenAI key never exposed to client
- **Account Scoping**: All data access filtered by accountId + role check
- **CORS**: Configured origin restrictions
- **Input Validation**: Zod schemas and class-validator
- **Prompt Injection Protection**: All user-controlled strings are sanitized via `sanitizeForPrompt()` before being included in AI prompts; user context data is structurally isolated in a JSON data block separate from model instructions; `userPrompt` on the `/ai/scan-receipt` endpoint is validated (max 300 chars) and reframed as a passive note rather than instructions

## Performance Optimizations

### Client-Side

- **SQLite**: Local data for instant access
- **Optimistic Updates**: UI updates before server confirmation
- **Lazy Loading**: Screens load on demand (Expo Router)
- **Image Caching**: Receipt images cached locally
- **Query Caching**: React Query with stale-while-revalidate

### Server-Side

- **Turbo Caching**: Build outputs cached across runs
- **Redis Cache**: Frequently accessed data cached
- **Database Indexes**: Optimized queries on accountId, date, categoryId
- **Batch Operations**: Sync processes multiple changes at once; notifications sent in batches of 100
- **Connection Pooling**: Prisma manages DB connections; prod `DATABASE_URL` pins `connection_limit=10` to cap the pool

### Caching & Throttling Layer

- **`CacheService`** (`common/cache/cache.service.ts`): a `@Global()` ioredis wrapper. `delByPrefix` uses cursor-based `SCAN` (not the blocking `KEYS`) for safe prefix invalidation
- **`RedisThrottlerStorage`**: implements the `ThrottlerStorage` v5 interface (INCR + PEXPIRE NX + PTTL pipeline, `keyPrefix: 'throttle:'`), registered via `ThrottlerModule.forRootAsync` so rate limits survive API restarts
- **UserContext cache**: `UserContextBuilder.build()` caches its result under `uc:{accountId}` (TTL 60s); expense/income mutations call `CacheService.del('uc:{accountId}')` so the next AI request rebuilds promptly
- **Parallel sync batches**: `SyncService.pushChanges()` processes the `changes[]` array in parallel batches of 10, speeding large resyncs without unbounded contention
