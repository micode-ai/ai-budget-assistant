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

- **Account types**: `personal`, `business`, `shared`
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
├── achievements.tsx       # Achievements & gamification
├── story.tsx              # AI spending story dashboard
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
| `useWalletStore` | Wallet balances, currency exchange |
| `useThemeStore` | Theme preferences, dark mode |
| `useInsightsStore` | AI insights loading, caching, dismissal |
| `useTagStore` | Tag CRUD, expense/income tag associations, AI suggestions |
| `useProjectStore` | Project CRUD, expense/income assignment, archiving |
| `useCategoryStore` | Category management, loading from DB |
| `useGamificationStore` | Achievements, streaks, XP/levels, new badge modal |

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
│       └── telegram.service.ts
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

### Services

| Service | OpenAI Model | Purpose |
|---------|--------------|---------|
| Transcription | Whisper | Convert audio to text |
| Expense Parsing | GPT-4 | Extract expense data from text |
| Categorization | GPT-4 | Suggest expense categories |
| Receipt Scanner | GPT-4 Vision | Extract data from receipt images |
| Chat Assistant | GPT-4 | Financial advice and insights |
| AI Insights | GPT-4 | Analyze patterns, generate insight cards |
| Story Generation | GPT-4 | Create narrative spending dashboards |
| Tag Suggestions | GPT-4 | Suggest tags based on expense description (history-first, AI fallback) |
| Project Suggestions | GPT-4 | Match expenses to active projects by date range and semantic analysis |
| Split Suggestions | GPT-4 | Suggest category splits for multi-category expenses |

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

Telegram bot sends notifications for system events (e.g., new user registration).

### Email (Mail)

Mail module provides email sending infrastructure for transactional emails.

## Subscription System

The application uses a tiered subscription model to manage access to AI-powered features:

- **Three tiers**: free, pro, business
- **AI usage tracking**: Each AI request is tracked per user with cost units
- **Trial periods**: New users receive trial access with reduced limits
  - Trial limits: free = 5, pro = 15, business = 100
  - Active limits: free = 5, pro = 200, business = unlimited
- **Guards**:
  - `SubscriptionTierGuard` checks that the user's subscription tier meets the minimum required tier for the endpoint
  - `AiUsageGuard` checks that the user has not exceeded their AI usage limit for the current billing period
- **AI features** (insights, story) require Pro or Business tier

## Home Screen Widgets

Android home screen widgets provide quick access to financial data without opening the app:

- **Technology**: `react-native-android-widget` for native Android widget rendering
- **3 sizes**:
  - **Small** (2x1): Today's spending total
  - **Medium** (4x2): Weekly spending bar chart
  - **Large** (4x4): Budget progress bars + top spending categories
- **Data bridge**: `widgetData.ts` service serializes data from API responses and local SQLite storage into a format suitable for widget rendering
- **Background refresh**: `expo-background-fetch` triggers data updates every 30 minutes
- **Widget task handler**: Registered in `index.js` to handle widget update requests from the Android system

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
