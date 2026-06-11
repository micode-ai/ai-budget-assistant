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
│   │   └── wallet.service.ts
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
│   │   └── achievement-definitions.ts
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
  id          String   @id @default(uuid())
  expenseId   String
  description String
  quantity    Decimal  @default(1) @db.Decimal(10, 3)
  unitPrice   Decimal  @default(0) @db.Decimal(12, 2)
  totalPrice  Decimal  @db.Decimal(12, 2)
  sortOrder   Int      @default(0)
  isDeleted   Boolean  @default(false)
  syncVersion Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  expense Expense
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
| Receipt Scanner | User-selected model | Extract data from receipt images |
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

- **Sharing toggle**: `isShared` is **owner-only** to set (via `PATCH /ai/chat/conversations/:id/shared` or `chat()`'s `initialIsShared`, gated on `accountRole === 'owner'`). Shared conversations are visible to all members; private ones stay creator-only
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

**User preferences** (`GET/PATCH /users/me/notification-preferences`)
- `budgetAlerts` — controls `budget_alert` notifications
- `sharedActivity` — controls `shared_expense` and `chat_mention` notifications
- `debtReminders` — controls `debt_reminder` notifications
- `recurringExpenses` — controls `recurring_expense` notifications
- `subscriptionRenewals` — controls `subscription_renewal` notifications
- `anomalyAlerts` — controls `spending_anomaly` push notifications from the anomaly module (default `true`)

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
