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
│   └── register.tsx
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
│   └── set-balance.tsx    # Set wallet balance
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
  categoryId: text (nullable),
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
│   │   └── services/
│   │       ├── transcription.service.ts
│   │       ├── categorization.service.ts
│   │       ├── chat.service.ts
│   │       ├── receipt-scanner.service.ts
│   │       ├── tag-suggestion.service.ts
│   │       ├── project-suggestion.service.ts
│   │       └── split-suggestion.service.ts
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
│   ├── notifications/           # Push notifications (Expo)
│   │   ├── notifications.service.ts
│   │   └── shared-activity.service.ts
│   ├── mail/                    # Email infrastructure
│   │   └── mail.service.ts
│   └── telegram/                # Telegram bot integration
│       ├── telegram.service.ts
│       ├── telegram-bot.service.ts
│       ├── telegram-bot.controller.ts
│       ├── telegram-link.service.ts
│       ├── types.ts
│       ├── handlers/
│       │   ├── chat.handler.ts
│       │   ├── command.handler.ts
│       │   ├── expense.handler.ts
│       │   ├── income.handler.ts
│       │   ├── voice.handler.ts
│       │   └── photo.handler.ts
│       └── helpers/
│           ├── format-telegram.ts
│           ├── parse-amount.ts
│           └── resolve-account.ts
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
  categoryId     String?
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

## Notifications

### Push Notifications (Expo Push API)

The application uses Expo Push API for sending push notifications. No Firebase configuration is required.

**Notification types:**
- `budget_alert` — triggered when spending exceeds budget threshold
- `spending_anomaly` — triggered when category spending increases >30% from 3-month average
- `shared_expense` — triggered when a member creates an expense in a shared account

**User preferences:**
- `notifyBudgetAlerts` — controls budget_alert and spending_anomaly notifications
- `notifySharedActivity` — controls shared_expense notifications

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

### Email (Mail)

Mail module provides email sending infrastructure for transactional emails.

## Subscription System

The application uses a tiered subscription model to manage access to AI-powered features:

- **Three tiers**: free, pro, business
- **AI usage tracking**: Each AI request is tracked per user with cost units (fractional)
- **Model cost multiplier**: Applied by `AiUsageGuard` before recording usage — fast=0.75×, balanced=1.0×, quality=1.5×
- **Trial periods**: New users receive trial access with reduced limits
  - Trial limits: free = 5, pro = 15, business = 100
  - Active limits: free = 5, pro = 200, business = unlimited
- **Guards**:
  - `SubscriptionTierGuard` checks that the user's subscription tier meets the minimum required tier for the endpoint
  - `AiUsageGuard` checks that the user has not exceeded their AI usage limit for the current billing period; applies model cost multiplier
- **AI features** (insights, story) require Pro or Business tier

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
- **Connection Pooling**: Prisma manages DB connections
