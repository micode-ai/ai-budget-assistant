# Архитектура

## Обзор системы

AI Budget Assistant построен на монорепозитории с двумя основными приложениями и общими пакетами.

```
┌─────────────────────────────────────────────────────────────────┐
│                       Клиентский слой                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  Expo мобильное приложение                 │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │   Экраны    │  │  Хранилища  │  │  Локальная БД   │   │  │
│  │  │(Expo Router)│  │  (Zustand)  │  │ (SQLite/Drizzle)│   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS / REST API
                              │ Заголовок X-Account-Id
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Серверный слой                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      NestJS бэкенд                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ Контроллеры │  │   Сервисы   │  │      Гарды      │   │  │
│  │  │   (REST)    │  │  (Бизнес)   │  │ (JWT + Аккаунт) │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────┬───────┼───────┬──────────────┐
        ▼             ▼       ▼       ▼              ▼
┌────────────┐ ┌──────────┐ ┌──────┐ ┌───────────┐ ┌──────────┐
│ PostgreSQL │ │  Redis   │ │OpenAI│ │ Expo Push │ │ Telegram │
│  (Prisma)  │ │  (Кэш)   │ │ API  │ │    API    │ │   Бот    │
└────────────┘ └──────────┘ └──────┘ └───────────┘ └──────────┘
```

## Мультиаккаунтная система

Приложение поддерживает мультиаккаунтный доступ с ролевой моделью:

- **Типы аккаунтов**: `personal` (личный), `business` (бизнес), `shared` (общий), `investment` (инвестиции)
- **Роли**: `owner` (полный доступ), `editor` (создание/редактирование), `viewer` (только чтение)
- **Контекст аккаунта**: Все запросы данных включают заголовок `X-Account-Id`; `AccountContextGuard` проверяет членство и роль
- **Приглашения**: Пользователей можно приглашать в аккаунты по инвайт-кодам с истечением срока действия

## Мобильное приложение

### Технологический стек

- **Фреймворк**: Expo SDK 50 с React Native 0.73
- **Навигация**: Expo Router 3.4 (файловая маршрутизация)
- **Управление состоянием**: Zustand 4.5
- **Получение данных**: TanStack React Query 5.17
- **Локальная БД**: SQLite с Drizzle ORM 0.29
- **Аутентификация**: JWT с безопасным хранением

### Структура экранов

```
app/
├── (auth)/
│   ├── _layout.tsx
│   ├── login.tsx
│   └── register.tsx
├── (tabs)/
│   ├── _layout.tsx
│   ├── index.tsx          # Главная панель
│   ├── expenses.tsx       # Список расходов
│   ├── budgets.tsx        # Управление бюджетами
│   ├── analytics.tsx      # Графики и отчёты
│   └── chat.tsx           # AI ассистент
├── account/
│   ├── [id].tsx           # Детали аккаунта
│   ├── create.tsx         # Создание аккаунта
│   ├── list.tsx           # Список аккаунтов
│   ├── join.tsx           # Присоединиться по инвайт-коду
│   └── invite.tsx         # Пригласить участников
├── budget/
│   ├── [id].tsx           # Детали бюджета
│   └── new.tsx            # Создать бюджет
├── expense/
│   ├── [id].tsx           # Детали расхода
│   ├── new.tsx            # Добавить расход
│   ├── receipt.tsx        # Сканер чеков
│   └── voice.tsx          # Голосовой ввод
├── income/
│   ├── [id].tsx           # Детали дохода
│   └── new.tsx            # Добавить доход
├── tags/
│   └── index.tsx          # Управление тегами
├── projects/
│   ├── index.tsx          # Список проектов
│   ├── [id].tsx           # Детали проекта и аналитика
│   └── new.tsx            # Создать проект
├── wallet/
│   ├── index.tsx          # Балансы кошелька
│   ├── exchange.tsx       # Обмен валют
│   └── set-balance.tsx    # Установка баланса
├── analytics/
│   └── drill-down.tsx    # Детализация графиков
├── calendar/
│   └── index.tsx          # Полноэкранный календарь с вкладками категорий/счетов/транзакций
├── reports.tsx             # Экспорт и отчёты
├── achievements.tsx       # Достижения и геймификация
├── story.tsx              # AI история расходов
├── fat-finder.tsx         # AI аудит расходов — поиск возможностей для экономии
├── scenario-simulator.tsx # Симулятор «что если»: слайдеры для прогноза накоплений на 3/6/12 мес
├── admin.tsx              # Панель администратора
├── settings.tsx           # Настройки
└── _layout.tsx            # Корневой layout
```

### Управление состоянием

Zustand хранилища управляют состоянием приложения:

| Хранилище | Назначение |
|-----------|------------|
| `useAuthStore` | Состояние аутентификации, токены, профиль |
| `useExpenseStore` | CRUD операции с расходами, фильтры |
| `useIncomeStore` | CRUD операции с доходами, помесячные итоги по валютам |
| `useBudgetStore` | Управление бюджетами, отслеживание прогресса |
| `useAccountStore` | Мультиаккаунтное управление, переключение |
| `useChatStore` | AI чат-диалоги |
| `useWalletStore` | Балансы кошелька, обмен валют, расчёт чистого капитала |
| `useExchangeRateStore` | Актуальные курсы обмена, базовая валюта, `convertedIncomeTotal`, `convertedExpenseTotal` |
| `useThemeStore` | Настройки темы, тёмный режим |
| `useWidgetVisibilityStore` | Управление видимостью виджетов главного экрана, сохраняется через MMKV |
| `useInsightsStore` | Загрузка AI инсайтов, кеширование, скрытие |
| `useTagStore` | CRUD тегов, привязка к расходам/доходам, AI-подсказки |
| `useProjectStore` | CRUD проектов, привязка расходов/доходов, архивирование |
| `useCategoryStore` | Управление категориями, загрузка из БД |
| `useGamificationStore` | Достижения, серии, XP/уровни, модалка нового значка |
| `useReportStore` | Генерация отчётов, дайджесты, резервные копии, email-настройки |

### Схема локальной базы данных

```typescript
// таблица expenses (расходы)
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

// таблица categories (категории)
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

// таблица budgets (бюджеты)
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

// таблица incomes (доходы)
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

// таблица tags (теги)
{
  id: text (PK),
  serverId: text (nullable),
  accountId: text,
  name: text,
  color: text (nullable),
  icon: text (nullable),
  usageCount: integer (по умолч. 0),
  isDeleted: integer (boolean),
  syncStatus: text (pending|synced|conflict),
  syncVersion: integer,
  createdAt: integer,
  updatedAt: integer
}

// таблица expense_tags (теги расходов)
{
  id: text (PK),
  expenseId: text,
  tagId: text,
  isDeleted: integer (boolean),
  syncVersion: integer,
  createdAt: integer,
  updatedAt: integer
}

// таблица income_tags (теги доходов)
{
  id: text (PK),
  incomeId: text,
  tagId: text,
  isDeleted: integer (boolean),
  syncVersion: integer,
  createdAt: integer,
  updatedAt: integer
}

// таблица projects (проекты)
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

// таблица project_expenses (расходы проекта)
{
  id: text (PK),
  projectId: text,
  expenseId: text,
  isDeleted: integer (boolean),
  syncVersion: integer,
  createdAt: integer,
  updatedAt: integer
}

// таблица expense_category_splits (разделение расходов по категориям)
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

// таблица sync_queue (очередь синхронизации)
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

## Бэкенд API

### Технологический стек

- **Фреймворк**: NestJS 10.3
- **База данных**: PostgreSQL с Prisma ORM 5.8
- **Кэш**: Redis с ioredis 5.3
- **Аутентификация**: Passport JWT
- **Валидация**: class-validator, Zod
- **AI интеграция**: OpenAI SDK 4.24
- **Push-уведомления**: Expo Push API

### Структура модулей

```
src/
├── modules/
│   ├── auth/                    # Аутентификация (JWT)
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── jwt.strategy.ts
│   │   └── guards/
│   │       └── jwt-auth.guard.ts
│   ├── users/                   # Управление пользователями
│   │   ├── users.controller.ts
│   │   └── users.service.ts
│   ├── accounts/                # Мультиаккаунтная система
│   │   ├── accounts.controller.ts
│   │   ├── accounts.service.ts
│   │   └── dto/
│   ├── expenses/                # Учёт расходов
│   │   ├── expenses.controller.ts
│   │   ├── expenses.service.ts
│   │   └── dto/
│   ├── incomes/                 # Учёт доходов
│   │   ├── incomes.controller.ts
│   │   ├── incomes.service.ts
│   │   └── dto/
│   ├── budgets/                 # Управление бюджетами
│   │   ├── budgets.controller.ts
│   │   ├── budgets.service.ts
│   │   ├── budget-alert.service.ts
│   │   └── dto/
│   ├── categories/              # Управление категориями
│   │   ├── categories.controller.ts
│   │   └── categories.service.ts
│   ├── tags/                     # Управление тегами
│   │   ├── tags.controller.ts
│   │   ├── tags.service.ts
│   │   └── tags.module.ts
│   ├── projects/                 # Управление проектами
│   │   ├── projects.controller.ts
│   │   ├── projects.service.ts
│   │   └── projects.module.ts
│   ├── ai/                      # AI сервисы
│   │   ├── ai.controller.ts
│   │   └── services/
│   │       ├── transcription.service.ts
│   │       ├── categorization.service.ts
│   │       ├── chat.service.ts
│   │       ├── receipt-scanner.service.ts
│   │       ├── tag-suggestion.service.ts
│   │       ├── project-suggestion.service.ts
│   │       └── split-suggestion.service.ts
│   ├── analytics/               # Аналитика расходов
│   │   ├── analytics.controller.ts
│   │   └── analytics.service.ts
│   ├── insights/                # AI инсайты, истории, аномалии
│   │   ├── insights.controller.ts
│   │   ├── insights.service.ts
│   │   ├── ai-insights.service.ts    # Генерация инсайтов через GPT-4
│   │   └── story.service.ts          # Генерация нарративных историй
│   ├── subscriptions/           # Подписки и AI использование
│   │   ├── subscriptions.service.ts
│   │   ├── guards/
│   │   │   ├── subscription-tier.guard.ts
│   │   │   └── ai-usage.guard.ts
│   │   └── decorators/
│   │       ├── require-tier.decorator.ts
│   │       └── track-ai-usage.decorator.ts
│   ├── admin/                   # Панель администратора
│   │   ├── admin.controller.ts
│   │   └── admin.service.ts
│   ├── wallet/                  # Мультивалютные кошельки
│   │   ├── wallet.controller.ts
│   │   └── wallet.service.ts
│   ├── currency-exchange/       # Отслеживание обмена валют
│   │   ├── currency-exchange.controller.ts
│   │   ├── currency-exchange.service.ts
│   │   └── exchange-rate.service.ts
│   ├── sync/                    # Синхронизация данных
│   │   ├── sync.controller.ts
│   │   └── sync.service.ts
│   ├── gamification/              # Достижения и серии
│   │   ├── gamification.module.ts
│   │   ├── gamification.controller.ts
│   │   ├── gamification.service.ts
│   │   ├── streak.service.ts
│   │   └── achievement-definitions.ts
│   ├── notifications/           # Push-уведомления (Expo)
│   │   ├── notifications.service.ts
│   │   └── shared-activity.service.ts
│   ├── reports/                   # Отчёты и дайджесты
│   │   ├── reports.module.ts
│   │   ├── reports.controller.ts
│   │   ├── reports.service.ts
│   │   ├── digest.service.ts
│   │   ├── report-scheduler.service.ts
│   │   ├── dto/index.ts
│   │   └── generators/
│   │       ├── csv-generator.ts
│   │       ├── pdf-generator.ts
│   │       └── excel-generator.ts
│   ├── backups/                   # Резервное копирование
│   │   ├── backups.module.ts
│   │   ├── backups.controller.ts
│   │   ├── backups.service.ts
│   │   └── dto/index.ts
│   ├── mail/                    # Email инфраструктура
│   │   └── mail.service.ts
│   └── telegram/                # Интеграция с Telegram ботом
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

### Схема базы данных (PostgreSQL)

```prisma
// Перечисления
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
  tier             SubscriptionTier @default(free) // free, pro, business
  status           String   @default("active")
  aiRequestsUsed   Int      @default(0)
  aiCostUnitsUsed  Float    @default(0)
  periodStart      DateTime
  periodEnd        DateTime
  trialEndsAt      DateTime?
}

model GeneratedInsight {
  id               String   @id @default(uuid())
  accountId        String
  insightType      String   // anomaly_spike, category_comparison, trend_change, budget_burndown, savings_opportunity
  title            String
  description      String
  severity         String   // info, warning, critical
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
  blocks      Json     // StoryBlock[]
  summary     String
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  @@unique([accountId, periodStart, periodEnd])
}
```

## Синхронизация

### Стратегия

Приложение использует оптимистичную синхронизацию на основе версий с разрешением конфликтов по принципу «последняя запись побеждает».

### Поток синхронизации

```
┌─────────────────┐                    ┌─────────────────┐
│ Мобильный клиент│                    │     Сервер      │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │  1. Пользователь создаёт расход      │
         │     в офлайн режиме                  │
         │  ┌───────────────────────────┐       │
         │  │ Сохранить в SQLite        │       │
         │  │ Добавить в sync_queue     │       │
         │  │ syncStatus = "pending"    │       │
         │  └───────────────────────────┘       │
         │                                      │
         │  2. Сеть доступна                    │
         │  ──────────────────────────────────► │
         │  POST /sync/push                     │
         │  X-Account-Id: <account-uuid>        │
         │  { changes: [...] }                  │
         │                                      │
         │                                      │  3. Обработка изменений
         │                                      │  ┌─────────────────────┐
         │                                      │  │ Проверка версий     │
         │                                      │  │ Применение изменений│
         │                                      │  │ Увеличение версий   │
         │                                      │  └─────────────────────┘
         │                                      │
         │  ◄────────────────────────────────── │
         │  { processed: [...], conflicts: [] } │
         │                                      │
         │  4. Обновление локального состояния  │
         │  ┌───────────────────────────┐       │
         │  │ Обновить serverId         │       │
         │  │ syncStatus = "synced"     │       │
         │  │ Удалить из очереди        │       │
         │  └───────────────────────────┘       │
         │                                      │
         │  5. Получение изменений с сервера    │
         │  ──────────────────────────────────► │
         │  GET /sync/pull?since=timestamp      │
         │                                      │
         │  ◄────────────────────────────────── │
         │  { expenses: [...], budgets: [...] } │
         │                                      │
         │  6. Слияние изменений с сервера      │
         │  ┌───────────────────────────┐       │
         │  │ Upsert по serverId        │       │
         │  │ Обработка конфликтов      │       │
         │  └───────────────────────────┘       │
         │                                      │
```

### Разрешение конфликтов

1. **Сравнение версий**: Каждая сущность имеет поле `syncVersion`
2. **Последняя запись побеждает**: По умолчанию побеждает последнее изменение
3. **Обнаружение конфликтов**: Если локальная и серверная версии расходятся, помечается как конфликт
4. **Стратегия разрешения**: Сохраняется в SyncLog для аудита
5. **Ручное разрешение**: Пользователь может выбрать версию (планируется)

## Интеграция с AI

### Выбор модели ИИ

Пользователь выбирает предпочтительную модель ИИ в Настройках → **Модель ИИ**. Настройка применяется глобально ко всем текстовым и vision-функциям ИИ (транскрипция Whisper исключена):

| Настройка | Модель | Max токенов | Множитель стоимости |
|-----------|--------|------------|---------------------|
| `fast` | `gpt-4o-mini` | 1500 | ×0.75 |
| `balanced` (по умолчанию) | `gpt-4o` | 2000 | ×1.0 |
| `quality` | `gpt-4.1` | 3000 | ×1.5 |

Множитель стоимости масштабирует расход AI-квоты. Например, при тарифе Free (5 запросов/месяц) запрос в режиме «quality» стоит 1.5 единицы, а в «fast» — 0.75 единицы.

**Реализация:** `apps/api/src/modules/ai/services/model-resolver.ts` — экспортирует `resolveAiModel(pref?)` и `getAiCostMultiplier(pref?)`. `AiUsageGuard` применяет множитель централизованно перед записью использования квоты.

### Сервисы

| Сервис | Модель OpenAI | Назначение |
|--------|---------------|------------|
| Транскрипция | `whisper-1` (фиксировано) | Преобразование аудио в текст |
| Парсинг расходов | Выбранная пользователем | Извлечение данных о расходе из текста |
| Категоризация | Выбранная пользователем | Предложение категорий для расходов |
| Сканер чеков | Выбранная пользователем | Извлечение данных из изображений чеков |
| Чат ассистент | Выбранная пользователем | Финансовые советы и аналитика |
| AI Инсайты | Выбранная пользователем | Анализ паттернов, генерация карточек инсайтов |
| Генерация историй | Выбранная пользователем | Создание нарративных дашбордов о расходах |
| Инвестиционные инсайты | Выбранная пользователем | Анализ портфеля, риски концентрации, оповещения о производительности |
| Подсказки тегов | Выбранная пользователем | Подбор тегов по описанию расхода (сначала из истории, затем AI) |
| Подсказки проектов | Выбранная пользователем | Привязка расходов к проектам по датам и семантическому анализу |
| Подсказки разделения | Выбранная пользователем | Предложение разделения расходов по категориям |

### Поток данных

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Клиент    │────►│   Бэкенд     │────►│   OpenAI     │
│              │     │   (Прокси)   │     │    API       │
│              │◄────│              │◄────│              │
└──────────────┘     └──────────────┘     └──────────────┘

1. Клиент отправляет запрос на бэкенд
2. Бэкенд добавляет API ключ и контекст
3. Бэкенд вызывает OpenAI API
4. Ответ обрабатывается и возвращается
```

### Инъекция контекста

Чат ассистент получает контекст пользователя для персонализированных ответов:

```typescript
const context = {
  monthlySpending: number,        // Расходы за месяц
  budgetLimits: {                 // Лимиты бюджетов
    category: string,
    limit: number,
    spent: number
  }[],
  topCategories: {                // Топ категорий
    category: string,
    amount: number
  }[],
  recentExpenses: {               // Последние расходы
    description: string,
    amount: number,
    date: string
  }[]
};
```

Все пользовательские строковые поля (описания расходов, названия проектов, тегов, категорий, целей) санируются перед включением в промпт функцией `sanitizeForPrompt()` из `@budget/shared-utils`. Это защищает от атак типа prompt injection, при которых вредоносный текст, сохранённый в данных пользователя, мог бы перезаписать инструкции модели.

Контекст пользователя передаётся модели в виде структурно изолированного JSON-блока, ограниченного маркерами `--- USER FINANCIAL DATA ---` / `--- END USER FINANCIAL DATA ---`, что заставляет модель воспринимать его как данные, а не как инструкции.

## Уведомления

### Push-уведомления (Expo Push API)

Приложение использует Expo Push API для отправки push-уведомлений. Настройка Firebase не требуется.

**Типы уведомлений:**
- `budget_alert` — при превышении порога бюджета
- `spending_anomaly` — при увеличении расходов в категории >30% от среднего за 3 месяца
- `shared_expense` — при создании расхода участником в общем аккаунте

**Пользовательские настройки:**
- `notifyBudgetAlerts` — управляет уведомлениями budget_alert и spending_anomaly
- `notifySharedActivity` — управляет уведомлениями shared_expense

**Пакетная обработка:** Уведомления отправляются батчами по 100 сообщений.

### Интеграция с Telegram

Модуль Telegram предоставляет два сервиса:

1. **TelegramService** — уведомления для администраторов о системных событиях (регистрация пользователей, новые подписки)
2. **TelegramBotService** — полнофункциональный пользовательский бот с ИИ-чатом, командами расходов/доходов, транскрипцией голоса и OCR чеков

**Архитектура бота:**
- **Middleware**: Разрешает `TelegramLink` → устанавливает `ctx.userState` (userId, accountId, conversationId) перед каждым обработчиком
- **Обработчики**: 6 специализированных — `ChatHandler` (ИИ-чат), `CommandHandler` (/start, /link, /account, /unlink, /newchat, /help), `ExpenseHandler`, `IncomeHandler`, `VoiceHandler` (транскрипция через Whisper), `PhotoHandler` (OCR сканирование чеков)
- **Привязка аккаунтов**: 6-символьные коды с TTL 10 минут, хранятся в таблице `TelegramLinkCode`. Связь один-к-одному: Telegram пользователь ↔ Пользователь приложения
- **Автоматическое определение счёта**: хелпер `resolve-account.ts` определяет названия счетов в сообщениях пользователя и подменяет `accountId` для данного запроса (без постоянного переключения). Это позволяет пользователям запрашивать данные разных счетов, упоминая название (например, «Покажи расходы в Family»)
- **Webhook/Polling**: Использует webhook при установленном `TELEGRAM_WEBHOOK_URL`, иначе — long polling для разработки

### Email (Почта)

Модуль почты предоставляет инфраструктуру для отправки транзакционных email:
- **Шаблоны**: Приглашения, еженедельные отчёты, ежемесячные дайджесты
- **Планировщик** (`@nestjs/schedule`):
  - `processWeeklyEmails` — ежедневно в 08:00, отправляет еженедельные сводки пользователям Business-тарифа
  - `processMonthlyDigests` — 1-го числа каждого месяца, отправляет ежемесячные дайджесты пользователям Pro+
  - `cleanupExpiredReports` — ежедневно в 03:00, удаляет истёкшие отчёты

## Аналитика и обнаружение аномалий

Модуль Insights предоставляет:

1. **Аномалии расходов**: Сравнивает расходы текущего месяца по категориям со средним за 3 месяца. Категории с увеличением >30% помечаются.
2. **Прогнозы бюджетов**: Прогнозирует даты исчерпания бюджетов на основе ежедневного темпа расходов и проецирует итоговые суммы на конец периода.

## Система подписок

Приложение использует трёхуровневую систему подписок для управления доступом к AI-функциям:

- **Три уровня**: free, pro, business
- **Отслеживание AI-использования**: Каждый AI-запрос учитывается с единицами стоимости (дробными)
- **Множитель стоимости модели**: Применяется `AiUsageGuard` перед записью использования — fast=0.75×, balanced=1.0×, quality=1.5×
- **Пробные периоды**: Уменьшенные лимиты для пробного периода (free: 5, pro: 15, business: 100)
- **Активные лимиты**: free: 5 запросов, pro: 200 запросов, business: безлимит
- **Гарды**:
  - `SubscriptionTierGuard` — проверяет, что уровень подписки пользователя соответствует требуемому
  - `AiUsageGuard` — проверяет, что пользователь не превысил лимит AI-запросов; применяет множитель стоимости модели
- **Требования**: AI-функции (инсайты, истории) требуют подписку Pro или Business

## Виджеты дашборда (внутри приложения)

Главный экран (`app/(tabs)/index.tsx`) отображает два виджета финансового обзора из `src/components/widgets/`:

### Виджет «Чистая прибыль» (`NetProfitWidget`)
- **Данные**: Параллельные запросы `GET /analytics/summary` за каждый из последних 6 месяцев через `Promise.all`
- **Сторы**: `useAccountStore` (контекст аккаунта), `useAuthStore` (базовая валюта)
- **График**: `InteractiveLineChart` с цветом линии зелёный (положительная) или красный (отрицательная)
- **Обновление**: Принимает `refreshKey: number`; инкрементируется при pull-to-refresh для повторного запроса
- **Формула**: `netSavings = totalIncome - totalExpenses` — вычисляется на сервере в `analytics.service.ts`

### Виджет «Чистый капитал» (`NetCapitalWidget`)
- **Данные**: Читает `walletStore.walletSummary` (уже загружен) — дополнительных API-запросов нет
- **Вычисление**: `totalNetCapital = Σ convertAmount(s.currentBalance, s.currencyCode, baseCurrency, rates)` с помощью `convertAmount()` из `exchangeRateStore`
- **Отображение**: Общая сумма в базовой валюте + разбивка по каждой валюте
- **Пустое состояние**: Показывается, когда `walletSummary.length === 0` (балансы кошелька ещё не настроены)

### Виджет «Календарь» (`CalendarWidget`)
- **Хук**: Использует общий хук `useCalendarData()` из `src/hooks/useCalendarData.ts`
- **Данные**: Читает `expenseStore`, `incomeStore`, `categoryStore`, `exchangeRateStore` — без API-запросов, всё локально
- **Отображение**: Месячная сетка календаря с цветными точками (зелёная = доход, красная = расход), навигация по месяцам, сводка доходов/расходов/чистой прибыли
- **Навигация**: При нажатии на виджет открывается полноэкранная страница `app/calendar/index.tsx` с тремя вкладками:
  - **Категории** — разбивка доходов/расходов по категориям с иконками, процентами, суммами
  - **Кошельки** — балансы кошельков из `walletStore.walletSummary` с процентом от общей суммы
  - **Транзакции** — объединённый список расходов/доходов, фильтруемый нажатием на конкретный день
- **Мультивалютность**: Все суммы конвертируются через `convertAmount()` из `exchangeRateStore`
- **Начало недели**: Понедельник (соответствует соглашению `getStartOfWeek()` в shared-utils)

## Виджеты домашнего экрана

Приложение поддерживает Android-виджеты для быстрого доступа к финансовой информации:

- **Технология**: `react-native-android-widget` для нативного рендеринга виджетов Android
- **4 виджета**:
  - **Маленький** (110×40 dp, `BudgetWidgetSmall`): итог расходов за сегодня с дельтой к вчера
  - **Средний** (250×110 dp, `BudgetWidgetMedium`): недельный график расходов + итог дня
  - **Большой** (250×180 dp, `BudgetWidgetLarge`): прогресс бюджетов + топ категорий расходов
  - **Быстрое добавление** (250×60 dp, `QuickActionWidget`): три кнопки deep link — 🎤 Голос, 📷 Скан, ✏️ Добавить
- **Мост данных**: `widgetData.ts` сериализует данные из ответов API и локального SQLite в формат для виджетов
- **Фоновое обновление**: `expo-background-fetch` обновляет виджеты с данными каждые 30 минут; «Быстрое добавление» статично (`updatePeriodMillis: 0`)
- **Deep links**: «Быстрое добавление» использует `clickAction="OPEN_URI"` со схемой `budget:///` для прямого открытия экранов
- **Регистрация**: Обработчик задач виджета регистрируется в `index.js`
- **Документация для разработчиков**: см. [`docs/ru/WIDGETS.md`](./WIDGETS.md)

## Геймификация

Система геймификации мотивирует пользователей регулярно вести финансы через достижения, серии и прогрессию XP.

### Компоненты

- **Определения достижений**: 14 статических достижений, определённых в коде (не в БД), по категориям: milestone, budget, streak, savings
- **Система XP**: 100 XP за уровень, XP за достижения от 10 (обычное) до 500 (легендарное)
- **Ежедневная серия**: Отслеживает последовательные дни активности по часовому поясу пользователя
- **Уровни редкости**: common, rare, epic, legendary — с различным визуальным оформлением

### Архитектура

- **Вычисления на сервере**: Достижения проверяются на API через Prisma-запросы, затем синхронизируются в мобильный SQLite-кеш
- **Fire-and-forget триггеры**: `GamificationService.checkAchievements()` вызывается после создания расходов/доходов/бюджетов, обёрнут в try/catch чтобы не блокировать основные операции
- **Интеграция модулей**: `GamificationModule` импортируется в `ExpensesModule`, `IncomesModule` и `BudgetsModule`

### Мобильные компоненты

| Компонент | Назначение |
|-----------|------------|
| `AchievementBadge` | Отображение значка с цветами редкости и прогресс-баром |
| `StreakWidget` | Счётчик серии с эмодзи огня и рекордом |
| `LevelProgress` | Прогресс-бар XP с индикатором уровня |
| `NewBadgeModal` | Модальное окно празднования при разблокировке достижения |

### Таблицы базы данных

- `UserAchievement` — отслеживает прогресс и завершение достижений пользователя (уникальный по `[userId, accountId, achievementId]`)
- `UserStreak` — отслеживает серию ежедневного отслеживания (уникальный по `[userId, accountId, streakType]`)

## Инвестиционный портфель

Отслеживание инвестиционного портфеля позволяет пользователям мониторить акции, ETF, криптовалюты, облигации и товары с данными рынка в реальном времени.

### Технологии

- **Данные о ценах**: Twelve Data API для актуальных и исторических цен
- **Тип аккаунта**: Требуется аккаунт типа `investment`
- **Поддержка активов**: Акции, ETF, криптовалюты, облигации, товары

### Архитектура

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Мобильный клиент│────►│  NestJS бэкенд  │────►│  Twelve Data    │
│  (Аналитика)    │     │  (investments/) │     │  API            │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   PostgreSQL    │
                        │  (Кэш цен)      │
                        └─────────────────┘
```

### Структура модуля

```
src/modules/investments/
├── investments.module.ts
├── investments.controller.ts
├── investments.service.ts
├── investment-insights.service.ts  # Генерация AI-инсайтов портфеля через GPT-4
├── twelve-data.service.ts          # Интеграция с внешним API
└── dto/
    └── index.ts                    # CreateHolding, CreateTransaction, Analytics DTO
```

### Модель данных

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
  type         String   // buy (покупка), sell (продажа)
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

### Расчёты аналитики

| Метрика | Формула |
|---------|---------|
| Доходность портфеля % | `((Конечная стоимость - Начальная стоимость) / Начальная стоимость) × 100` |
| Прибыль/убыток | `Текущая стоимость - Сумма инвестиций` |
| Прибыль/убыток % | `(П/У / Сумма инвестиций) × 100` |
| Доля в портфеле % | `(Стоимость позиции / Общая стоимость портфеля) × 100` |
| Доходность бенчмарка | API возвращает нормализованные значения (первое = 0, последующие = накопленный %) |

### Стратегия обновления цен

1. **Автоматическое**: Цены обновляются каждые 15 минут для активных портфелей
2. **Ручное**: Пользователи могут запустить немедленное обновление через `POST /investments/refresh-prices`
3. **Кэширование**: Исторические цены хранятся в таблице `AssetPriceHistory` для минимизации API-запросов
4. **Резервный вариант**: При недоступности текущей цены используется последняя известная

### Мобильные экраны

```
app/investment/
├── index.tsx           # Обзор портфеля (список позиций, сводка)
├── analytics.tsx       # Графики производительности, сравнение с бенчмарком
├── holding/
│   ├── [id].tsx        # Детали позиции с транзакциями
│   └── new.tsx         # Добавление позиции (поиск актива)
└── transaction/
    └── new.tsx         # Добавление покупки/продажи
```

### Мобильное хранилище

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

### AI-инсайты портфеля

Модуль инвестиций включает AI-инсайты на базе GPT-4, которые анализируют портфель и предоставляют рекомендации.

**Типы инсайтов:**

| Тип | Описание | Пороги серьёзности |
|-----|----------|-------------------|
| `concentration_risk` | Один актив доминирует в портфеле | Критический: >40%, Предупреждение: >25% |
| `sector_imbalance` | Перевес в одном типе активов | Критический: >70%, Предупреждение: >50% |
| `underperformer` | Актив значительно отстаёт от бенчмарка | Критический: <-30%, Предупреждение: <-15% |
| `overperformer` | Актив значительно обгоняет бенчмарк | Инфо: >+20% (возможность ребалансировки) |
| `benchmark_deviation` | Портфель отклоняется от бенчмарка | Критический: >25%, Предупреждение: >15% |
| `diversification_gap` | Отсутствуют типы активов | Критический: <2 типов, Предупреждение: <3 типов |
| `cost_basis_alert` | Налогово-значимые нереализованные прибыли/убытки | Критический: >50% или <-30% |
| `fee_impact` | Комиссии съедают доходность | Критический: >5%, Предупреждение: >2% |

**Архитектура:**
- **Кэширование**: Инсайты кэшируются на 24 часа для каждого аккаунта
- **Подписка**: Требуется уровень Pro+ (2.5 AI-кредитов за запрос)
- **Локализация**: Поддерживает все 8 языков приложения
- **Графики**: Каждый инсайт включает соответствующую визуализацию (donut, bar, line)

## Безопасность

### Поток аутентификации

```
┌─────────────────┐                    ┌─────────────────┐
│     Клиент      │                    │     Сервер      │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │  POST /auth/login                    │
         │  { email, password }                 │
         │  ──────────────────────────────────► │
         │                                      │
         │  ◄────────────────────────────────── │
         │  { accessToken, refreshToken }       │
         │                                      │
         │  Безопасное хранение токенов         │
         │  (expo-secure-store)                 │
         │                                      │
         │  GET /expenses                       │
         │  Authorization: Bearer <token>       │
         │  X-Account-Id: <account-uuid>        │
         │  ──────────────────────────────────► │
         │                                      │
         │  Токен истёк? Обновление             │
         │  POST /auth/refresh                  │
         │  { refreshToken }                    │
         │  ──────────────────────────────────► │
         │                                      │
```

### Меры безопасности

- **JWT токены**: Короткоживущие access токены (15мин), долгоживущие refresh токены (7д)
- **Безопасное хранение**: Токены хранятся в keychain/keystore устройства
- **Биометрическая аутентификация**: Опциональная разблокировка по отпечатку/лицу
- **Прокси API ключа**: Ключ OpenAI никогда не передаётся клиенту
- **Контекст аккаунта**: Весь доступ к данным фильтруется по accountId + проверка роли
- **CORS**: Настроенные ограничения по источникам
- **Валидация ввода**: Zod схемы и class-validator
- **Защита от prompt injection**: Все пользовательские строки санируются через `sanitizeForPrompt()` перед включением в AI-промпты; контекст пользователя структурно изолирован в JSON-блоке отдельно от инструкций модели; параметр `userPrompt` эндпоинта `/ai/scan-receipt` валидируется (макс. 300 символов) и интерпретируется как пассивная заметка, а не как инструкция

## Оптимизации производительности

### На стороне клиента

- **SQLite**: Локальные данные для мгновенного доступа
- **Оптимистичные обновления**: UI обновляется до подтверждения сервера
- **Ленивая загрузка**: Экраны загружаются по требованию (Expo Router)
- **Кэширование изображений**: Изображения чеков кэшируются локально
- **Кэширование запросов**: React Query со стратегией stale-while-revalidate

### На стороне сервера

- **Кэширование Turbo**: Результаты сборки кэшируются между запусками
- **Redis кэш**: Часто запрашиваемые данные кэшируются
- **Индексы БД**: Оптимизированные запросы по accountId, date, categoryId
- **Пакетные операции**: Синхронизация обрабатывает несколько изменений сразу; уведомления отправляются батчами по 100
- **Пул соединений**: Prisma управляет соединениями с БД
