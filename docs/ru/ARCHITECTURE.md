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

### Ролевая модель доступа

Право на запись проверяется на нескольких слоях, чтобы `viewer` никогда не мог изменить данные аккаунта:

- **`AccountContextGuard`** определяет членство по заголовку `X-Account-Id` и устанавливает `req.accountId` + `req.accountRole`
- **`AccountRoleGuard` + `@RequireRole('owner'|'editor')`** — гард на основе DI (требует `AccountsModule`) для эндпоинтов, требующих конкретной роли
- **`ViewerBlockGuard`** — гард без зависимостей (без импорта `AccountsModule`), применяется как `@UseGuards(new ViewerBlockGuard())` на любом POST/PATCH/PUT/DELETE, изменяющем данные аккаунта; читает `req.accountRole`
- **AI-чат и боты**: write-действия для viewer блокируются в `chat.service.ts` до постановки действия в очередь; состояние пользователя Telegram/WhatsApp несёт `accountRole`, и обработчики записи проверяют его перед выполнением
- **Гейтинг в мобильном UI**: `useAccountStore(s => s.canEdit())` возвращает `false` для viewer; экраны справочных данных и действий записи скрывают кнопки `+`/карандаш/корзина и отключают отклик нажатия на строку (только UI — API всё равно блокирует на сервере)

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
│   ├── register.tsx
│   ├── verify-email.tsx
│   ├── forgot-password.tsx
│   └── reset-password.tsx
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
│   ├── set-balance.tsx    # Установка баланса
│   ├── transfer.tsx       # Перевод между аккаунтами
│   ├── transfers.tsx      # История переводов с фильтрами
│   ├── exchanges.tsx      # История обменов с фильтрами
│   └── [id].tsx           # Детали перевода
├── debts/
│   └── index.tsx          # Экран долгов и займов с FAB
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
| `useDebtStore` | Отслеживание долгов — выданные/полученные, возвраты, вычисление статуса |
| `useGoalStore` | Отслеживание целей накоплений |
| `useInvestmentStore` | Сводка инвестиционного портфеля |
| `useEncryptionStore` | Состояние клиентского шифрования |
| `useSubscriptionStore` | Тариф подписки, лимиты, paywall |

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
│   │   ├── ai.module.ts
│   │   ├── embedding.module.ts
│   │   ├── services/
│   │   │   ├── chat.service.ts                 # Оркестратор жизненного цикла вызова OpenAI (~415 строк)
│   │   │   ├── user-context-builder.service.ts # Сборка UserContext для промпта
│   │   │   ├── ai-tools.service.ts             # 11 схем функций + диспетчер executeAction
│   │   │   ├── prompt-builder.service.ts       # Системный промпт, определение языка, i18n действий
│   │   │   ├── whisper.service.ts              # Транскрипция голоса
│   │   │   ├── ocr.service.ts                  # OCR чеков
│   │   │   ├── categorization.service.ts
│   │   │   ├── tag-suggestion.service.ts
│   │   │   ├── project-suggestion.service.ts
│   │   │   ├── split-suggestion.service.ts
│   │   │   ├── goal-planner.service.ts
│   │   │   ├── embedding.service.ts
│   │   │   ├── model-resolver.ts
│   │   │   └── response-mode.helper.ts
│   │   └── utils/                              # Маппинг символов валют и др.
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
│   ├── referrals/               # Реферальная программа
│   │   ├── referrals.controller.ts
│   │   ├── referrals.service.ts
│   │   └── referral-qualification.cron.ts
│   ├── import-wise/             # Импорт выписок Wise (CSV)
│   │   ├── import-wise.controller.ts
│   │   ├── import-wise.service.ts
│   │   └── dto/index.ts
│   ├── import-bank/             # Импорт выписок польских банков (CSV/PDF, реестр стратегий)
│   │   ├── import-bank.controller.ts
│   │   ├── import-bank.service.ts
│   │   ├── parsers/            # парсеры по банкам (mbank, pko, revolut, ing, millennium, pekao, erste, alior, universal)
│   │   ├── merchants/         # merchants-pl.ts подсказки бренд→категория
│   │   ├── mapping/           # сохранённые маппинги колонок
│   │   └── utils/             # polish-amount, polish-date, encoding, fx-pairing, pdf-text
│   ├── import-batches/         # История импортов + откат
│   │   ├── import-batches.controller.ts
│   │   └── import-batches.service.ts
│   ├── account-transfers/      # Переводы между аккаунтами
│   ├── debts/                  # Долги и займы, возвраты, cron напоминаний
│   ├── encryption/             # Управление ключами клиентского E2EE-шифрования
│   ├── app-versions/           # Контроль версий приложения (запрос обновления)
│   ├── health/                 # Публичная проверка работоспособности (SELECT 1)
│   ├── anomaly/                # Правило-based детекция аномалий при записи → лента AnomalyAlert
│   ├── telegram/                # Интеграция с Telegram ботом
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
│   └── whatsapp/               # Бот WhatsApp Business Cloud
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

### Массовые операции с расходами

`PATCH /expenses/bulk` (`BulkUpdateExpensesDto`) обеспечивает работу мобильного режима множественного выбора — массовое **удаление / смену категории / добавление тегов** одним запросом. Поскольку мобильный клиент может отправлять ещё не синхронизированные строки, и `ids` расходов, и `tagIds` разрешаются как по серверным PK, так и по локальным `clientId` через `OR: [{ id }, { clientId }]` (`Expense.clientId`, `Tag.clientId`), поэтому синхронизированные и несинхронизированные строки сопоставляются одинаково. При `isDeleted: true` выполняется мягкое удаление; иначе применяются `categoryId` и/или `tagIds` (теги добавляются).

## Импорт банковских выписок

### Импорт из банков (реестр стратегий)

Модуль `import-bank` импортирует выписки CSV/PDF через **реестр стратегий** парсеров по банкам. Каждый парсер в `parsers/*.parser.ts` реализует `BankParser { id, displayName, format?: 'csv'|'pdf', detect(), parse() }` и регистрируется в `registry.ts`.

- **Банки**: `mbank`, `pko`, `revolut`, `ing`, `millennium`, `pekao` (CSV) + `erste`, `alior` (PDF) + резервный `universal` маппинг колонок (`detect()` всегда возвращает `false`)
- **Видимые и скрытые** (список `BANKS` в мобильном): показываются Wise, mBank, PKO, Revolut, Erste (PDF), Alior (PDF), Other; ING / Millennium / Pekao есть в реестре, но скрыты до проверки на реальных выписках
- **Revolut** (`parsers/revolut.parser.ts`): CSV-экспорт `Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance`. Берутся только строки `State = COMPLETED`; `Amount` со знаком (отрицательное — расход), `Fee` уже включён; строки `EXCHANGE` объединяются в FX через `pairFxRows`
- **Поток** (`ImportBankService`): `decodeCsvBuffer` (авто-определение UTF-8 / Windows-1250 через `iconv-lite`) → выбор парсера (mappingId → bankId → сохранённый fingerprint → авто-определение) → нормализованные строки → `pairFxRows` (та же дата, противоположный знак, другая валюта) → `buildExternalRef` → дедупликация. PDF-выписки определяются по заголовку `%PDF`, текст извлекается через `pdf-parse` и направляется в PDF-парсеры (шаги CSV-заголовка/маппинга/fingerprint пропускаются)
- **Два слоя дедупликации** в `buildPreviewResponse`: (1) точное совпадение `externalRef` (повторный импорт того же файла); (2) совпадение по содержимому `(date, signedAmountCents, currency)` со всеми Expense/Income аккаунта независимо от источника (жадное 1-к-1, FX исключаются). Совпавшие строки помечаются `alreadyImported` и автоматически снимаются в предпросмотре
- **Ключ дедупликации**: `bank:<bankId>:<isoDate>:<signedAmountCents>:<sha256(normalize(desc)).slice(0,8)>`
- **Сохранённые маппинги**: таблица `csv_import_mappings` (`@@unique([accountId, headerFingerprint])`) хранит маппинг колонок, чтобы распознанный формат применялся автоматически при следующем импорте
- **Запрос банка**: `POST /import/bank/request-bank` пересылает опциональный файл-образец + название банка в **ops-чат Telegram** (`TELEGRAM_CHAT_ID`), но никогда пользователю

Эндпоинты защищены `JwtAuthGuard + AccountContextGuard`. Импорт Wise (`import-wise`) следует той же модели preview/commit + дедупликации по `externalRef`, эмитируя внутрикошельковые FX-строки как `CurrencyExchange`.

### История импортов и откат

Каждый commit Wise и банка создаёт строку `ImportBatch` (таблица `import_batches`) в той же транзакции и проставляет каждой созданной записи `importBatchId`.

- `GET /import/batches` возвращает последние 20 батчей; у каждого есть `canRollback` (`status === 'committed'` и в пределах 30-дневного окна)
- `DELETE /import/batches/:id` откатывает: устанавливает `isDeleted = true` и **очищает `externalRef`** у связанных строк (чтобы тот же файл можно было импортировать снова) и помечает батч `rolled_back`

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

### Общий AI-чат

Диалоги поддерживают опциональный групповой режим для общих аккаунтов (per-conversation opt-in). `ChatConversation` несёт `accountId` + `isShared`; история чата ограничена аккаунтом (`accountId = X-Account-Id AND (isShared OR userId = me)`).

- **Переключатель доступа**: `isShared` устанавливает **только владелец** (через `PATCH /ai/chat/conversations/:id/shared` или `initialIsShared` в `chat()`, при условии `accountRole === 'owner'`). Общие диалоги видны всем участникам; приватные остаются доступны только создателю
- **Упоминания**: сообщение с `@упоминанием` участника (`{userId}[]`, валидируется, себя исключает) **отключает AI** и отправляет push `chat_mention` (с учётом `notifySharedActivity`) каждому упомянутому участнику, который сейчас отсутствует; сообщение без упоминания получает обычный ответ AI
- **Присутствие**: отслеживается в Redis по ключу `chat:presence:{conversationId}:{userId}` (TTL 45с); мобильный опрашивает `…/poll?since=` каждые 4с, пока общий диалог в фокусе, и обновляет свой ключ присутствия
- **История для AI**: сообщение каждого участника предваряется санированным `[Name]: `, чтобы модель различала участников
- **Deep-link**: нажатие на push `chat_mention` переключает `accountId` и открывает диалог

## Уведомления

### Push-уведомления (Expo Push API)

Приложение использует Expo Push API для отправки push-уведомлений. Настройка Firebase не требуется.

**Типы уведомлений:**
- `budget_alert` — при превышении порога бюджета
- `spending_anomaly` — генерируется модулем `anomaly` (category spike, price increase, duplicate charge, recurring suggestion); ограничен 3 пушами на аккаунт в сутки
- `shared_expense` — при создании расхода участником в общем аккаунте
- `debt_reminder` — напоминание о предстоящем или просроченном долге
- `recurring_expense` — уведомление об авто-созданном рекуррентном расходе
- `subscription_renewal` — напоминание о продлении подписки или уведомление об авто-списании
- `chat_mention` — пользователь упомянут через @ в общем AI-разговоре

**Пользовательские настройки** (`GET/PATCH /users/me/notification-preferences`)
- `budgetAlerts` — управляет уведомлениями `budget_alert`
- `sharedActivity` — управляет уведомлениями `shared_expense` и `chat_mention`
- `debtReminders` — управляет уведомлениями `debt_reminder`
- `recurringExpenses` — управляет уведомлениями `recurring_expense`
- `subscriptionRenewals` — управляет уведомлениями `subscription_renewal`
- `anomalyAlerts` — управляет push-уведомлениями `spending_anomaly` от модуля аномалий (по умолчанию `true`)

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

### Интеграция с WhatsApp

Модуль WhatsApp — это `@Global()` бот на **Meta Business Cloud API**, работающий параллельно Telegram и переиспользующий те же общие сервисы (`ChatService`, `WhisperService`, `OcrService`, `ExpensesService`, `IncomesService`, `CategoriesService`, `SubscriptionsService`). Предоставляет тот же набор функций: AI-чат, транскрипция голоса и OCR чеков.

Ключевые отличия от Telegram:

- **Только webhook**: `POST /whatsapp/webhook` (исключён из глобального префикса `/api/v1` в `main.ts`). Режима polling нет
- **Проверка подписи**: HMAC-SHA256 по `req.rawBody` (ключ = `WHATSAPP_APP_SECRET`) на каждом входящем запросе
- **Состояние в Redis** (не в памяти): `wa:msg:{id}` (идемпотентность, 24ч), `wa:pa:{shortId}` (ожидающие действия, 1800с), `wa:receipt:{shortId}` + `wa:awaiting_date:{phone}`, `wa:cat:{shortId}`
- **ID колбэков используют разделитель `--`** (UUID содержат одиночный `-`)
- **Интерактивный UI**: `WhatsAppClientService.sendButtons` (макс. 3 × 20 симв.) / `sendList` (макс. 10 строк); markdown WhatsApp (`*bold*`, `_italic_`) через `markdownToWhatsApp`
- **Привязка аккаунта**: 6-символьный hex-код — мобильное показывает QR + deep link `wa.me/{phone}?text=link%20{code}`; `CommandHandler.handleLink` — единственная команда, принимаемая от непривязанного номера
- **Локализация**: `helpers/i18n.ts` портирует ключи Telegram на 8 языков

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

### Проактивные оповещения об аномалиях (модуль `anomaly`)

Модуль `anomaly` (37-й API-модуль) запускает **rule-based детекцию при записи** и сохраняет результаты в таблицу `anomaly_alerts`. В отличие от пассивного эндпоинта Insights, оповещения доставляются пользователям в момент возникновения события.

**4 детектора:**

| Детектор | Условие срабатывания |
|----------|---------------------|
| `category_spike` | Сумма по категории расхода за текущий календарный месяц (в разрезе валюты) на ≥30% выше среднего за предыдущие ≥2 месяца. Бюджет не требуется. |
| `price_increase` | Активная отслеживаемая подписка (`UserSubscription`, по нормализованному имени) или серия `recurringId` списывает **более чем на 10%** больше, чем раньше, в той же валюте. |
| `duplicate_charge` | Тот же **плательщик** (мерчант, либо описание, если мерчанта нет) + сумма + валюта в пределах **±1 календарного дня**; пары из одного импорта исключаются. |
| `recurring_suggestion` | 3+ списания одинаковой суммы у **неотслеживаемого** мерчанта с регулярным интервалом (месяц 25–35 дней / неделя 6–8 дней); срабатывает один раз на мерчанта. |

**Дедупликация:** каждое оповещение имеет детерминированный `dedupKey` с ограничением `@@unique([accountId, dedupKey])` — одно и то же событие не может создать дублирующиеся строки ни при повторной попытке, ни при гонке.

**Лимит push-уведомлений:** не более 3 `spending_anomaly` пушей на аккаунт в сутки; дополнительные оповещения записываются в ленту, но не отправляются. Управляется настройкой уведомлений `anomalyAlerts` (`user.notifyAnomalyAlerts`, по умолчанию `true`).

**Хуки:** `ExpensesService.create` вызывает `AnomalyService.analyzeExpense(expense)` синхронно после фиксации строки расхода. Коммит импорта (`import-wise`, `import-bank`) вызывает `AnomalyService.analyzeExpenseBatch(expenses)` асинхронно (fire-and-forget), чтобы не снижать пропускную способность импорта.

**API:** `GET /alerts`, `PATCH /alerts/read-all`, `PATCH /alerts/:id/read`, `DELETE /alerts/:id` — все под `JwtAuthGuard + AccountContextGuard`; эндпоинты записи защищены `ViewerBlockGuard`.

## Учёт мерчантов (продавцов)

`Expense.merchant` — это свободное текстовое поле (Prisma `merchant String?` + `@@index([accountId, merchant])`; в мобильном SQLite `merchant TEXT`). У доходов поля мерчанта нет.

- **Авто-заполнение**: заполняется из OCR чеков (мобильное + photo-обработчики Telegram/WhatsApp) и при commit импорта из банка/Wise; редактируется вручную через общий компонент `MerchantInput` (свободный текст + автодополнение из `getDistinctMerchants()`)
- **Шифрование**: шифруется на клиенте **как `description`** — поле входит в `ENCRYPTION_FIELDS.expense.tier1`, поэтому пути записи прогоняют его через `maybeEncrypt`, а слияние при загрузке читает `decrypted.merchant`
- **Управление**: экран Настройки → **Мерчанты** перечисляет уникальных мерчантов с количеством и поддерживает переименование / объединение / удаление (`renameMerchant(from, to|null)` → обновление в памяти + один SQL `UPDATE` `bulkRenameMerchant` в рамках аккаунта → ре-синхронизация с повторным шифрованием для E2EE)
- **Сверка при захвате**: OCR и голос предзаполняют мерчанта через `resolveExistingMerchant()` (точное совпадение без учёта регистра привязывает к каноническому значению)
- **Фильтрация только на клиенте** (без параметра API `?merchant=`): `ExpenseFilters.merchants: string[]` — мультивыбор; поле поиска на вкладке расходов также сопоставляет подстроку мерчанта

## Система подписок

Приложение использует трёхуровневую систему подписок для управления доступом к AI-функциям:

- **Три уровня**: free, pro, business
- **Отслеживание AI-использования**: Каждый AI-запрос учитывается с единицами стоимости (дробными)
- **Множитель стоимости модели**: Применяется `AiUsageGuard` перед записью использования — fast=0.75×, balanced=1.0×, quality=1.5×
- **Пробные периоды**: Уменьшенные лимиты для пробного периода (free: 50, pro: 15, business: 100)
- **Активные лимиты**: free: 50 запросов, pro: 300 запросов, business: безлимит
- **Гарды**:
  - `SubscriptionTierGuard` — проверяет, что уровень подписки пользователя соответствует требуемому
  - `AiUsageGuard` — проверяет, что пользователь не превысил лимит AI-запросов; применяет множитель стоимости модели
- **Требования**: AI-функции (инсайты, истории, fat finder) доступны на всех уровнях подписки — различаются только лимиты AI-запросов

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
- **Пул соединений**: Prisma управляет соединениями с БД; в проде `DATABASE_URL` фиксирует `connection_limit=10` для ограничения пула

### Слой кэширования и троттлинга

- **`CacheService`** (`common/cache/cache.service.ts`): `@Global()` обёртка над ioredis. `delByPrefix` использует курсорный `SCAN` (а не блокирующий `KEYS`) для безопасной инвалидации по префиксу
- **`RedisThrottlerStorage`**: реализует интерфейс `ThrottlerStorage` v5 (пайплайн INCR + PEXPIRE NX + PTTL, `keyPrefix: 'throttle:'`), регистрируется через `ThrottlerModule.forRootAsync`, так что лимиты переживают перезапуск API
- **Кэш UserContext**: `UserContextBuilder.build()` кэширует результат по ключу `uc:{accountId}` (TTL 60с); мутации расходов/доходов вызывают `CacheService.del('uc:{accountId}')`, чтобы следующий AI-запрос быстро пересобрал контекст
- **Параллельные батчи синхронизации**: `SyncService.pushChanges()` обрабатывает массив `changes[]` параллельными батчами по 10, ускоряя крупные ре-синхронизации без неограниченной конкуренции
