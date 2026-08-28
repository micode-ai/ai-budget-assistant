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
│   │   ├── wallet.service.ts
│   │   └── wallet-currency.service.ts  # leaf-модуль: строка на каждую валюту счёта
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
│   │   ├── achievement-definitions.ts
│   │   └── tracking-gap-reminder.cron.ts  # Ежедневный cron — напоминание при отсутствии расходов 3+ дней
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
│   ├── price-history/          # Персональный индекс инфляции — индекс Ласпейреса по позициям чеков OCR
│   │   ├── price-history.module.ts
│   │   ├── price-history.controller.ts
│   │   └── price-history.service.ts
│   ├── shopping-list/          # Умный список покупок — общие offline-first списки + сравнение корзины (ABA-330)
│   │   ├── shopping-list.module.ts
│   │   ├── shopping-list.controller.ts
│   │   ├── shopping-list.service.ts
│   │   ├── restock-predictor.ts     # чистый predictRestock
│   │   ├── deal-detector.ts         # чистый detectDeals
│   │   └── shopping-reminder.cron.ts
│   ├── receipt-split/          # Разделение чека + публичные гостевые ссылки
│   │   ├── receipt-split.module.ts
│   │   ├── receipt-split.controller.ts   # эндпоинты плательщика /expenses/:id/receipt-split*
│   │   ├── guest.controller.ts           # публичные, без аутентификации /s/:token*
│   │   ├── receipt-split.service.ts
│   │   ├── split-calculator.ts           # чистые resolveItemSplit / resolveEqualSplit
│   │   └── helpers/                      # guest-page.ts, guest-page-i18n.ts
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
  id            String   @id @default(uuid())
  expenseId     String
  description   String
  canonicalName String?  // нормализованное название товара, установленное OCR-сервисом или пользовательским псевдонимом (миграция 20260702160001)
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
| Сканер чеков | Выбранная пользователем | Извлечение данных из изображений чеков (в т. ч. структурированного адреса магазина) |
| Геокодирование | — (OpenStreetMap/Nominatim) | Определение координат по адресу магазина с чека (структурированный запрос, кэш, fail-silent) |
| Чат ассистент | Выбранная пользователем | Финансовые советы и аналитика |
| AI Инсайты | Выбранная пользователем | Анализ паттернов, генерация карточек инсайтов |
| Генерация историй | Выбранная пользователем | Создание нарративных дашбордов о расходах |
| Инвестиционные инсайты | Выбранная пользователем | Анализ портфеля, риски концентрации, оповещения о производительности |
| Подсказки тегов | Выбранная пользователем | Подбор тегов по описанию расхода (сначала из истории, затем AI) |
| Подсказки проектов | Выбранная пользователем | Привязка расходов к проектам по датам и семантическому анализу |
| Авторазбивка чека по категориям | Выбранная пользователем | Отнесение каждой строки чека к категории (только названия, никогда суммы) — см. ниже |


### Авторазбивка чека по категориям

Раскладывает строки отсканированного чека по категориям расходов: поход в
супермаркет на 240 zł превращается в продукты + бытовую химию + алкоголь вместо
одной суммы. Считается один раз в момент сканирования, внутри OCR-воронки:
собственного эндпоинта нет, и ни на одном пути записи нет обращения к модели.
Поле `ReceiptExpense.categorySplits` присутствует **всегда** (пустой массив,
если разбивки нет), поэтому его получают все пути сканирования и все три бота.

**Цепочка классификации, от дешёвого к дорогому.** Сначала отвечают выученные
правила аккаунта — они бесплатны; к модели уходят только непокрытые ими строки.

- Правила лежат в `product_category_rules` и ключуются по **строке, напечатанной
  на самом чеке**, нормализованной до букв и цифр (пробелы, пунктуация, регистр
  и диакритика отбрасываются). Намеренно не по `canonicalName` от модели: та
  строка придумывается заново на каждом скане и нестабильна, из-за чего кэш не
  попадал, а противоречивые правила накапливались.
- Правила пишутся в момент **сохранения**, по той категории, с которой расход
  реально сохранился, — а не при сканировании, иначе брошенный скан обучал бы
  кэш.
- Ответ модели стоит одного обращения в счёт `AI_SPLIT_MAX_INFERENCES_PER_DAY`
  (по умолчанию 20 на аккаунт в сутки, счётчик в Redis, отдельно от месячной
  AI-квоты). Попадание в правило не стоит ничего.

**Модель никогда не выдаёт денег.** Она получает номер и название каждой строки
плюс **названия** категорий аккаунта, а возвращает только `{itemIndex,
categoryName}` — ни суммы, ни процента, ни итога в этом обмене нет. Ответ
проверяется по реальным названиям категорий и реальному диапазону номеров; всё
выдуманное отбрасывается, а не принимается на веру.

**Арифметика** — чистая функция `buildCategorySplits`, намеренно
продублированная пара (канонический экземпляр в
`apps/api/src/common/utils/receipt-category-split.ts`, зеркало в
`packages/shared-utils`, поскольку API не может импортировать этот пакет в
рантайме). Значения групп в копейках суммируются в итог чека точно, по
целочисленному построению.

**Гейт допуска** сравнивает `сумма строк − скидка + залог` с итогом и полностью
отказывается от разбивки, если расхождение больше 5%:

- *скидка* — корзинная: строки сохраняют полную цену, и только итог её
  учитывает. Распределяется по группам пропорционально их вкладу.
- *залог* — за возвратную тару (`kaucja`), печатается отдельным блоком, никогда
  не является позицией, но входит в сумму к оплате. Влияет только на гейт и
  остаётся в резидуале, а не приписывается наугад.

Отказ — это задуманный ответ, а не сбой: размазать необъяснённую разницу по
категориям пользователя хуже, чем оставить чек целым. Разбивка также требует
минимум двух различных категорий. Всё, что не покрыто размеченными строками
(неразмеченная позиция, округление), уходит в самую крупную группу.

**Перечитывание.** Извлечение невоспроизводимо: один и тот же чек с одним и тем
же промптом даёт разные суммы строк, а иногда и разное прочтение напечатанной
скидки. Когда описанная выше арифметика не сходится, тот же самый запрос
посылается **ещё один раз**, и остаётся то прочтение, которое сходится (ничья
или неизмеримое второе прочтение оставляют первое, поэтому перечитывание может
только спасти скан, но не ухудшить). Лишний вызов тратится лишь на скан, который
и так шёл к «без разбивки».

**Предложение категорий.** Если ни одна существующая категория не подходит к
группе строк, модель может предложить до трёх новых, названных на языке
владельца аккаунта. Ничего не создаётся, пока пользователь не сохранит:
брошенный скан оставляет справочник категорий нетронутым.

**Бюджеты эти разбивки намеренно игнорируют** и по-прежнему смотрят на
собственную категорию расхода — ровно так же, как для разбивок, сделанных
вручную. Их учитывает только аналитика по категориям.

Каждый скан пишет ровно одну строку `[CategorySplit]` с исходом (`few_lines`,
`no_categories`, `no_assignments`, `one_category`, `refused_by_arithmetic` или
`ok groups=N`).

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

- **Переключатель доступа**: `isShared` устанавливает **только создатель** — любой участник аккаунта может открыть/закрыть общий доступ к разговору, **который он создал** (через `PATCH /ai/chat/conversations/:id/shared` или `initialIsShared` в `chat()`). Эндпоинт проверяет `conversation.userId === вызывающий`, а не роль в аккаунте, поэтому изменить флаг чужого разговора нельзя (даже владельцу). Общие диалоги видны всем участникам; приватные остаются доступны только создателю
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
- `tracking_gap_reminder` — напоминание, когда расходы не записывались 3+ дней (отправляется на 3-й, 6-й, 9-й день…)

**Пользовательские настройки** (`GET/PATCH /users/me/notification-preferences`)
- `budgetAlerts` — управляет уведомлениями `budget_alert`
- `sharedActivity` — управляет уведомлениями `shared_expense` и `chat_mention`
- `debtReminders` — управляет уведомлениями `debt_reminder`
- `recurringExpenses` — управляет уведомлениями `recurring_expense`
- `subscriptionRenewals` — управляет уведомлениями `subscription_renewal`
- `anomalyAlerts` — управляет push-уведомлениями `spending_anomaly` от модуля аномалий (по умолчанию `true`)
- `trackingGap` — управляет уведомлениями `tracking_gap_reminder` (по умолчанию `true`)

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

## Безопасная сумма трат (Safe-to-Spend)

Модуль `insights` (ABA-293) рассчитывает единое число «сколько можно безопасно потратить сегодня», которое одновременно приводит в действие hero-число на главном экране и функцию `check_affordability` в AI-чате — одна формула, два потребителя.

### Принцип работы

1. **Формула**: `safeToSpendToday = max(0, (walletBalance + expectedIncome − obligations − buffer) / daysRemaining)`, где `buffer` в v1 равен `0`.
2. **Входные данные**: текущий баланс кошелька (`WalletService.getSummary`), предстоящие списания по подпискам (активные строки `UserSubscription`, спроецированные вперёд в пределах горизонта), предстоящие регулярные расходы (та же логика группировки, что у cron-задачи регулярных расходов — последняя строка на `recurringId`, следующая дата списания), взносы по целям, идущим по графику (линейный темп до дедлайна каждой цели), и предполагаемый ежемесячный доход (эвристика по циклу 25–35 дней на основе 90-дневной истории доходов — тот же детектор, что используется для аномалии `recurring_suggestion`).
3. **Горизонт**: `min(конец текущего календарного месяца, дата следующего ожидаемого дохода)`, но не менее 1 дня.
4. **Валюта**: все входные суммы конвертируются в валюту отображения аккаунта через `getRatesSafe`/`convertAmount`, с флагом `fxApproximate`, если курс устарел или отсутствует.
5. **Переиспользование**: чистая функция-формула (`computeSafeToSpend`) — это **намеренно продублированная пара**, по той же схеме, что `financial-month.ts` и `receipt-category-split.ts`: сервис импортирует собственную каноническую копию из `apps/api/src/modules/insights/safe-to-spend.util.ts`, а зеркало в `packages/shared-utils`, которое поддерживается вручную, импортирует офлайн-фолбэк мобильного приложения (`useSafeToSpend.ts`). Это **не** одна общая функция: у API нет шага сборки для workspace-пакетов, поэтому runtime-импорт `@budget/shared-utils` из `apps/api/src` роняет прод в цикл перезапусков с `ERR_UNSUPPORTED_DIR_IMPORT` — именно поэтому `scripts/check-no-shared-utils-runtime-import.sh` валит деплой на таком импорте. Меняешь одну копию — меняй и вторую.

### Кеширование

Результат кешируется в Redis под ключом `sts:{accountId}:{baseCurrency}`, TTL 300 с. Миграция базы данных не требуется — всё вычисляется из уже существующих таблиц (кошелёк, подписки, регулярные расходы, цели, история доходов).

### Интеграция с AI-чатом

`check_affordability(amount, currencyCode?, description?)` — это **функция чтения** в AI-чате (без подтверждения), возвращающая детерминированный вердикт `AffordabilityVerdict` — `affordable: boolean` плюс `reasonCode` (`within_safe`, `within_available_tight`, `over_available`, `delays_goal`, `wait_until_income`). Модель дословно озвучивает вердикт, а не формирует собственное суждение.

### Интеграция с мобильным приложением

- **Хук `useSafeToSpend`** + кешируемый в MMKV `insightsStore.loadSafeToSpend()` — мгновенная отрисовка из кеша.
- **Hero-число на главном экране**: нажатие открывает bottom sheet с разбивкой по каждой входной величине, участвующей в расчёте.
- **Виджет `safeToSpend`** на главном экране (`WidgetKey`).
- Результат `check_affordability` в чате отображается как чип «да/нет» с `reasonCode`.

### API эндпоинты

`GET /insights/safe-to-spend` — под `JwtAuthGuard + AccountContextGuard`. `SubscriptionTierGuard` не используется — доступно на бесплатном тарифе.

## Financial Wrapped (итоги года)

Модуль `insights` (ABA-336) собирает годовой обзор в стиле Spotify Wrapped полностью из уже существующих данных — без новых таблиц и без затрат на LLM для самих цифр.

### Принцип работы

1. **Сборка**: чистая, покрытая unit-тестами функция `assembleWrapped` (`wrapped.util.ts`, по образцу `safe-to-spend.util.ts`) строит упорядоченный список карточек `WrappedCard` (discriminated union) — `intro`, `total_tracked`, `top_merchant` (по числу визитов, при равенстве — по сумме трат), `biggest_month`, `top_category`, `category_mix`, `receipts_scanned` (расходы из OCR/уведомлений), `savings` (чистая сумма + норма сбережений + сравнение год-к-году), `personal_inflation` (переиспользует скользящий 12-месячный индекс Персонального индекса инфляции, только для текущего/предыдущего года) и `streak` (из `StreakService` модуля геймификации). В результат попадают только карточки, подкреплённые реальными данными.
2. **Порог данных**: `hasEnoughData: false` (с пустым списком карточек), если за год у аккаунта меньше 5 отслеживаемых строк, либо если аккаунт использует полное сквозное шифрование (tier-2).
3. **Валюта**: каждая сумма конвертируется в валюту отображения пользователя через `getRatesSafe`/`convertAmount`, с флагом `fxApproximate`, если курс недоступен (в этом случае сумма исключается из соответствующей суммы, а не показывается неверно).
4. **`wrapped.service.ts`** — тонкая IO-обёртка вокруг `assembleWrapped`: она получает сырые строки из базы и передаёт их в чистую функцию, благодаря чему основная логика тестируется unit-тестами без базы данных.

### Кеширование

Результат кешируется в Redis под ключом `wrapped:{accountId}:{baseCurrency}:{year}`, TTL 3600 с. Параметр запроса `year` ограничивается диапазоном `[2000, текущий год]`.

### Интеграция с мобильным приложением

- **Хук `useWrapped`** + `api.getWrapped(year)`.
- **`app/wrapped/index.tsx`**: полноэкранная свайпаемая колода карточек с градиентом — реализована без единого нового нативного модуля (постраничный `ScrollView` + `expo-linear-gradient`), с индикаторами прогресса и переключателем скрытия сумм.
- **Шеринг**: текстовый шеринг (`Share.share`), собранный из i18n-строк `wrapped.share*`, а также **шеринг-изображение** — `WrappedShareCard.tsx` рендерит скрытый `react-native-webview` с самодостаточным HTML/canvas story-изображением (1080×1920), экспортирует его в PNG через `canvas.toDataURL` и делится через `expo-sharing`; на вебе и при любой ошибке — откат на текстовый шеринг.
- **Точка входа**: баннер на вкладке Аналитика.

### API эндпоинты

`GET /insights/wrapped?year=YYYY` — под `JwtAuthGuard + AccountContextGuard`. `SubscriptionTierGuard` не используется — бесплатно, ради возможности шеринга (тот же прецедент, что у Safe-to-Spend).

## Персональный индекс инфляции

Модуль `price-history` (ABA-307) рассчитывает индекс цен Ласпейреса по позициям чеков аккаунта, позволяя пользователям отслеживать изменение цен в собственной «продуктовой корзине» без каких-либо затрат на AI.

### Принцип работы

1. **Захват данных**: OCR-сервис (`ocr.service.ts`) устанавливает поле `ReceiptItem.canonicalName` для каждой позиции отсканированного чека с помощью эвристики `buildCanonicalNameFallback(description)`. Пользовательские псевдонимы (таблица `product_aliases`, `@@unique([accountId, rawName])`) могут переопределять необработанные имена OCR в чистое каноническое представление.
2. **Хранение**: `ExpenseItem.canonicalName` (миграция `20260702160001_add_expense_item_canonical_name`) сохраняет разрешённое каноническое имя рядом с исходным полем `description`.
3. **Расчёт индекса**: `PriceHistoryService.getInflationIndex(accountId, period)` извлекает самые ранние и последние цены за единицу по каждому каноническому товару за период, рассчитывает индекс Ласпейреса (`Σ(p₁ × q₀) / Σ(p₀ × q₀)`) и кеширует результат в Redis (`ph:{accountId}:{period}`, TTL 300 с).
4. **Управление товарами**: Пользователи могут просматривать историю цен по товарам, создавать/обновлять псевдонимы rawName→canonicalName и объединять дублирующиеся варианты товаров (5 эндпоинтов, все на бесплатном тарифе, операции записи защищены `ViewerBlockGuard`).

### Таблицы базы данных

- `expense_items.canonical_name TEXT` — nullable-колонка, добавленная в существующую таблицу `expense_items` (миграция `20260702160001`)
- `product_aliases` — новая таблица: `id`, `accountId`, `rawName`, `canonicalName`, `createdAt`, `updatedAt`; `@@unique([accountId, rawName])` (миграция `20260702160002_add_product_aliases`)

### Интеграция с мобильным приложением

- **`priceHistoryStore.ts`**: server-only хранилище Zustand (без кеша SQLite — цены требуют консистентности между устройствами)
- **`priceHistory.api.ts`**: методы API-клиента для всех 5 эндпоинтов
- **`InflationIndexSection`**: компонент на вкладке Аналитика, отображающий текущее значение индекса и изменения цен по товарам
- **`app/settings/products.tsx`**: экран управления псевдонимами товаров; доступен из хаба справочных данных

### API эндпоинты

`GET /price-history`, `GET /price-history/products`, `PATCH /price-history/products/alias`, `DELETE /price-history/products/alias/:rawName`, `POST /price-history/products/merge` — все под `JwtAuthGuard + AccountContextGuard`; операции записи защищены `ViewerBlockGuard`. `SubscriptionTierGuard` не используется — доступно на бесплатном тарифе.

## Inflation Shield (щит от инфляции)

Модуль `insights` (ABA-346) строится поверх рядов цен по товарам из Персонального индекса инфляции, прогнозирует, какие отслеживаемые товары скоро подорожают, и рекомендует закупить их впрок **прямо сейчас**, а также отслеживает, сколько денег эта рекомендация реально сэкономила. Полностью детерминированный расчёт — без затрат на AI.

### Принцип работы

1. **Движок прогнозирования** (`inflation-shield.util.ts`, чистые unit-тестированные функции): `forecastProductTrend` выполняет регрессию методом наименьших квадратов по окну `SHIELD_FORECAST_LOOKBACK_WEEKS` (12 недель), с проверкой минимального временного охвата (`minSpanDays`, 14 дней) и флагом `hasSignal` для товаров с недостаточной историей. `estimateCadenceDays` вычисляет типичную периодичность покупки товара. `isStockpileable` консервативно исключает скоропортящиеся товары с коротким циклом покупки (например, молоко) ниже `SHIELD_MIN_CADENCE_DAYS` (14 дней) и молчит при неизвестной периодичности, а не гадает.
2. **Рекомендация**: `recommendStockUp` рассчитывает количество для закупки впрок как недельное потребление × `min(горизонт, SHIELD_MAX_STOCK_WEEKS)` (8 недель), с ограничением `SHIELD_MAX_UNITS` (12 единиц). `projectedSaving` намеренно **уменьшена вдвое** — используется модель «наполовину пройденной линейной рампы» избежанных затрат `(projectedPrice − currentPrice) / 2 × quantity`, а не полный разрыв цены на конец горизонта, поскольку пользователь не будет держать каждую единицу товара до момента полного роста цены.
3. **Сборка результата**: `assembleShield` оставляет только товары, дорожающие как минимум на `SHIELD_MIN_MONTHLY_RISE_PCT` (5%) в месяц, пригодные для запаса впрок и имеющие ≥3 ценовые точки (`SHIELD_MIN_POINTS`). Все суммы конвертируются в валюту отображения аккаунта (с флагом `fxApproximate`), а общий прогнозный процент по корзине взвешивается только по товарам с `hasSignal: true`. Все пороги настраиваются через переменные окружения `SHIELD_*`, значения по умолчанию — в `SHIELD_DEFAULTS`.
4. **Источники данных**: `PriceHistoryService.getProductTrends(accountId)` отдаёт ряд цен по каждому товару (переиспользуя приватную выборку строк Персонального индекса инфляции); `SafeToSpendService.compute` отдаёт флаг `affordableToday` для каждой позиции (стоимость закупки впрок ≤ прогнозируемый доступный остаток «безопасно потратить»).
5. **Охват**: Plan 1 — **только персональные данные**. Движок принимает необязательные community-поля `store`/`currentBestPrice`, но интеграция community-буста (подбор самого дешёвого магазина через `CommunityPriceService`) отложена до валидации анти-Sybil-защиты Community Price Map и включения её read kill-switch.

### Отслеживание реализованной экономии

Отдельный листовой модуль `InflationShieldTrackingService` работает только через Prisma (без сервисных зависимостей) и импортируется одновременно `InsightsModule` и `ExpensesModule`, оставаясь свободным от циклических зависимостей:

- **`recordRecommendations`**: делает снимок текущего набора рекомендаций один раз за `(accountId, canonicalName, periodMonth)` — идемпотентно, через create + перехват `P2002` вне какой-либо транзакции, поэтому побеждает первый снимок месяца.
- **`reconcilePurchase`**: запускается из пост-создающего хука `ExpensesService.create` (инъекция `@Optional()`, тот же паттерн fire-and-forget, что и у `familyFeed`/`communityPrices`) при создании нового расхода. Сопоставляет рекомендацию со статусом `active` по точному `canonicalName`, количеству ≥ половины рекомендованного и календарному дню (`expense.date >= floor(recommendedAt)`) — но никогда не сравнивает цены между разными валютами. При совпадении рекомендация помечается `acted`, и в `savedSoFar` зачисляется пропорциональная доля `projectedSaving`.
- **`getShield`** запускает `recordRecommendations` в фоне перед заполнением кеша Redis и возвращает реальный, просуммированный с конвертацией валют `savedSoFar` (с флагом `fxApproximate`, если хоть одна засчитанная рекомендация потребовала конвертации).
- **Инвалидация кеша**: новый расход сбрасывает и ключи `shield:{accountId}:*`, и ключ кеша AI-инструмента `chat:get_inflation_shield:*`, чтобы щит никогда не отдавал устаревшие данные сразу после закупки впрок.

### Таблицы базы данных

- `inflation_shield_recommendations` — снимок рекомендаций по `(accountId, canonicalName, periodMonth)`, с enum `ShieldStatus` (`active` | `acted` | `expired`).

### Интеграция с AI-чатом

`get_inflation_shield` — это **функция чтения** в AI-чате (не входит в `isWriteAction` — выполняется немедленно через кешируемый/озвучиваемый путь чтения, как `get_expenses`/`get_budget_status`). Параметров не принимает. Промпт указывает модели передавать числа дословно, подавать экономию как **оценку** и всегда использовать `baseCurrency` из ответа, а не `currencyOriginal` отдельной позиции.

### Интеграция с мобильным приложением

- **`inflationShieldStore`**: server-only Zustand-хранилище с кешем в MMKV — мгновенная отрисовка из кеша, сохранение последнего известного состояния при ошибке запроса, без гейта апгрейда (функция бесплатная).
- **Хук `useInflationShield`** + `api.getInflationShield()`.
- **`InflationShieldWidget`**: виджет на главном экране (`WidgetKey: 'inflationShield'`, идёт после `safeToSpend`); скрывается при отсутствии данных.
- **`app/inflation-shield/index.tsx`**: полноэкранный экран — hero-блок «сэкономлено на данный момент», прогноз по корзине, карточки «закупить впрок» с бейджем доступности, pull-to-refresh, пустое состояние.
- **Карточка для шеринга**: `InflationShieldShareCard.tsx` повторяет архитектуру шеринг-карточки Financial Wrapped (закадровый WebView рендерит HTML/canvas story-изображение, экспортируется в PNG через `expo-sharing`) с отдельным зелёным градиентом; на вебе и при любой ошибке — текстовый fallback через `Share.share`.

### API эндпоинты

`GET /insights/inflation-shield` — под `JwtAuthGuard + AccountContextGuard`. `SubscriptionTierGuard` не используется — доступно на бесплатном тарифе (тот же прецедент, что у Safe-to-Spend и Financial Wrapped).

## Проверка цен по чеку

ABA-373. Проверка, выполняемая в момент сканирования чека, — сравнивает каждую позицию с собственной **медианной** ценой пользователя за этот же товар в этом же магазине и показывает позиции, которые стоят заметно дороже, — пока пользователь ещё стоит у кассы. Полностью детерминированная (без затрат на LLM), миграция базы данных не потребовалась — используется тот же корпус `expense_items.canonical_name`, который уже наполняет Персональный индекс инфляции.

### Принцип работы

Всё сравнение живёт в одном чистом, покрытом unit-тестами модуле: `modules/price-history/receipt-check.util.ts`, экспортирующем `checkReceiptPrices(input)`.

1. **Группировка**: `groupReceiptLines` схлопывает позиции чека по нормализованному имени товара во взвешенную по количеству среднюю цену за единицу, поэтому один товар даёт не более одной находки, даже если чек указывает его на нескольких строках.
2. **Базовая цена**: для каждой сгруппированной строки `PriceHistoryService.getProductTrendsFor(accountId, canonicalNames, merchantNormalized, since, currencyCode, excludeExpenseId?)` получает собственные предыдущие строки `ExpenseItem` этого аккаунта для этого же товара **у этого же продавца**, в той же валюте, в пределах окна `RECEIPT_CHECK_LOOKBACK_WEEKS` (по умолчанию 12 недель). Базовая цена — это **медиана** этих предыдущих цен за единицу; именно медиана, а не среднее, чтобы одна аномальная покупка не искажала сравнение.
3. **Порог**: позиция сообщается, только если она стоит как минимум на `RECEIPT_CHECK_MIN_RISE_PCT` (по умолчанию 15%) дороже базовой цены **и** абсолютная переплата превышает `RECEIPT_CHECK_MIN_AMOUNT` (по умолчанию 1.0, в валюте самого чека) — рост на 20% для товара за 10 центов не стоит показывать. Рост выше `RECEIPT_CHECK_MAX_RISE_PCT` (по умолчанию 100%) отбрасывается, а не сообщается: огромный скачок гораздо вероятнее означает другой товар (или неверно распознанную OCR-строку), чем реальное изменение цены, а его показ подорвал бы доверие ко всем остальным находкам.
4. **Уверенность**: товару нужно как минимум `RECEIPT_CHECK_MIN_POINTS` (по умолчанию 2) предыдущих покупок в этом магазине, прежде чем проверка вообще что-то о нём скажет. `confidence: 'low'`, когда база опирается ровно на минимальные 2 точки; `'high'` — от 3 и более. Мобильная карточка показывает предупреждение «на основе только двух предыдущих покупок» именно для находок с `'low'`.
5. **Строгость охвата**: сравнение всегда происходит **для того же товара, в том же магазине, в той же валюте** — `getProductTrendsFor` фильтрует и продавца, и валюту в JS ещё до того, как цена попадёт в расчёт медианы, а товар с историей в другой валюте, чем текущий чек, просто пропускается, а не конвертируется. Разные объёмы упаковки уже являются разными товарами, поскольку присвоенное OCR `canonicalName` сохраняет объём в строке (например, «Mleko Łaciate 3,2% 1L» против варианта 0,5 л) — отдельный фильтр по размеру упаковки не нужен.
6. **Ограничение вывода**: с одного чека возвращается не более `RECEIPT_CHECK_MAX_FINDINGS` (по умолчанию 5) находок, отсортированных по убыванию `overpaidAmount`.
7. **Строгость формулировок**: `ReceiptCheckFinding` (`packages/shared-types/src/dto/receipt-check.ts`) и любой его потребитель намеренно сформулированы как «это стоит дороже обычного — стоит проверить чек», а не как утверждение, что пользователя обманули или что скидку намеренно не применили, — чек не может доказать ни то, ни другое, а самая частая реальная причина — это молча не сработавшая акция. Итоговая сумма в ответе называется `overpaidAmount`/«найдено», а не «сэкономлено».
8. **Community-база (зарезервирована, не используется)**: движок принимает необязательный вход `community: CommunityBaseline[]` как запасной вариант на случай слишком скудной личной истории, но пока ни один вызывающий код его не передаёт — сегодня у каждой находки `source: 'personal'`. Это тот же принцип «отложено до валидации», что и у community-буста Inflation Shield и анти-Sybil-защиты Community Price Map.

### Две точки вызова

Один и тот же детерминированный движок вызывается ровно из двух мест — по двум разным причинам:

1. **В момент сканирования** — `OcrService.finalizeReceipt()` (единая точка, через которую проходят все четыре пути сканирования — камера/галерея/PDF в мобильном приложении и все три чат-бота — прежде чем вернуть `ReceiptExpense`) вызывает приватный метод `runPriceCheck(accountId, receipt)` и устанавливает `receipt.priceFindings`. Это происходит **до того, как расход вообще существует**, поэтому нет ещё никакого id расхода, из которого можно было бы построить ключ дедупликации или к которому можно было бы привязать находку, — результат возвращается прямо в ответе на скан и отображается немедленно, не касаясь базы данных.
2. **После создания** — `AnomalyService.detectPriceOvercharge(accountId, userId, expense)`, вызывается из `checkExpense()` наряду с другими детекторами аномалий, уже после того как расход (и его строки `ExpenseItem`) зафиксированы. Этот проход сохраняет одну строку ленты `price_overcharge` на чек (см. **Лента и сводка** ниже), поэтому находка переживает закрытие экрана сканирования и участвует в годовом итоге на вкладке Аналитика.

Оба места вызывают одну и ту же функцию `checkReceiptPrices()`, поэтому они принципиально не могут разойтись в том, что считать находкой, — разница только в том, что каждый из них делает с результатом (отрисовать или сохранить). **Проход после создания обязан исключить проверяемый чек из своей же базовой цены**: к моменту запуска `detectPriceOvercharge` сервис `ExpensesService.create` уже зафиксировал строки `ExpenseItem` нового расхода, поэтому без `excludeExpenseId: expense.id` в вызове `getProductTrendsFor` проверяемый чек засчитался бы как одна из своих же предыдущих покупок — завышая (а при единственной предыдущей покупке — попросту выдумывая) собственную базовую цену и молча расходясь с результатом, полученным в момент сканирования того же чека.

### Лента и сводка

- **Тип оповещения**: `price_overcharge` записывается через тот же метод `AnomalyService.createAlert()`, что и любой другой тип аномалии, но с `skipPush: true` — оно живёт только в ленте и никогда не отправляется как push, поскольку push, пришедший уже после того, как пользователь ушёл из магазина, бесполезен. `params` хранит `{ merchant, currencyCode, totalAmount, findings }`.
- **Гейт релиза**: `AnomalyService.receiptCheckAlertsEnabled()` читает `RECEIPT_CHECK_ALERTS_ENABLED` (по умолчанию выключен). Этот гейт закрывает **только запись**: пока он выключен, `detectPriceOvercharge` вычисляет находки, логирует их и завершается, не создавая строку оповещения; инлайн-карточка в момент сканирования и сводная строка бота этим гейтом не затронуты, поскольку ни та, ни другая через него не проходят. Гейт нужен потому, что UI ленты оповещений для `price_overcharge` появляется в мобильном релизе, который должен выкатиться первым, — включи запись раньше, и уже установленные приложения покажут карточку с заголовком в виде сырой строки типа `price_overcharge` и пустым телом.
- **Эндпоинт сводки**: `GET /alerts/price-check-summary` (`AnomalyController`, объявлен до маршрутов `:id` — то же правило порядка, что и у `bulk`/`read-all` в других местах этой кодовой базы) суммирует `overpaidAmount` по всем неотклонённым оповещениям `price_overcharge`, созданным с начала текущего календарного года по UTC, **в разрезе валюты** (никогда не смешивая — эта функция ничего не конвертирует). Приводит в действие строку «Найдено X сверх ваших обычных цен в этом году» на вкладке Аналитика, которая сама выбирает одну валюту для показа (`pickFoundTotal`: собственная валюта отображения пользователя, если в ней что-то нашлось, иначе — наибольший итог), но никогда не складывает суммы между валютами.

### Конфигурация

Все пороги настраиваются через переменные окружения через `resolveReceiptCheckConfig(env)`, значения по умолчанию — в `RECEIPT_CHECK_DEFAULTS`:

| Переменная окружения | По умолчанию | Значение |
|---|---|---|
| `RECEIPT_CHECK_LOOKBACK_WEEKS` | 12 | Насколько далеко назад берутся предыдущие покупки для базовой цены |
| `RECEIPT_CHECK_MIN_POINTS` | 2 | Минимум предыдущих покупок в этом магазине, прежде чем сообщается хоть одна находка |
| `RECEIPT_CHECK_MIN_RISE_PCT` | 15 | Минимальный % выше медианной базовой цены, чтобы считаться находкой |
| `RECEIPT_CHECK_MAX_RISE_PCT` | 100 | Рост выше этого значения отбрасывается как «вероятно, другой товар», а не сообщается |
| `RECEIPT_CHECK_MIN_AMOUNT` | 1.0 | Минимальная абсолютная переплата (в валюте самого чека), чтобы её вообще сообщать |
| `RECEIPT_CHECK_MAX_FINDINGS` | 5 | Ограничение числа находок с одного чека |
| `RECEIPT_CHECK_ALERTS_ENABLED` | выключен | Гейт релиза — см. **Лента и сводка** выше; отрицательное или некорректное значение переопределения всегда обнуляется, а не инвертируется |

### Интеграция с мобильным приложением и ботами

- **Экран подтверждения скана**: `PriceFindingsCard.tsx` рендерит свёрнутую карточку («N позиций дороже обычного · примерно на X больше»), которая разворачивается в строки по каждому товару (обычная цена, уплаченная цена, разница и предупреждение о низкой уверенности, где уместно). Это чисто информационная карточка — она никогда не блокирует сохранение чека и никогда не меняет ни одну сумму.
- **Чат-боты** (Telegram, WhatsApp, Slack): `photo.handler.ts` каждого бота вызывает общий хелпер `buildPriceCheckLine(receipt, lang)`, который добавляет одну дополнительную строку к сообщению-подтверждению чека, если `receipt.priceFindings` не пуст, сформулированную так же честно, как и мобильная карточка, локализованную через собственный `helpers/i18n.ts` каждого бота (ключ `priceCheckSummary`, 9 языков).
- **Лента оповещений**: `app/alerts/index.tsx` рендерит оповещения `price_overcharge` с заголовком/телом из `alerts.priceCheckTitle`/`alerts.priceCheckBody` — целиком зависит от `RECEIPT_CHECK_ALERTS_ENABLED`, поскольку таких строк оповещений просто не существует, пока гейт выключен.
- **Вкладка Аналитика**: `InflationIndexSection.tsx` вызывает `GET /alerts/price-check-summary` и показывает годовой итог «найдено» через `pickFoundTotal`, только когда хотя бы одна валюта имеет положительный итог.

### API эндпоинты

`GET /alerts/price-check-summary` — под `JwtAuthGuard + AccountContextGuard`, без `ViewerBlockGuard` (чтение сводки ничего не изменяет). См. [API.md](./API.md#сводка-проверки-цен).

## Умный список покупок

Модуль `shopping-list` (ABA-330) предоставляет общие offline-first списки покупок и Pro-функцию сравнения стоимости корзины, построенные на корпусе истории цен по чекам.

### Offline-first синхронизация

В отличие от большинства сущностей, списки покупок **не** используют общий механизм `/sync/push|pull`. Мобильное приложение держит собственную зеркальную копию в SQLite (`shopping_lists` / `shopping_list_items`, каждая строка со своим `sync_status`) и сверяется напрямую через REST CRUD эндпоинты:

1. Загрузить локальные строки → мгновенно отрисовать экран.
2. Отправить ожидающие строки через `POST/PATCH/DELETE /shopping-list…` (сначала create, затем update, чтобы offline-переименование/архивация не откатывались).
3. Забрать полное состояние сервера через `GET /shopping-list`, слить upsert-ом и удалить отсутствующие (tombstone-by-absence).

`id` локальной строки навсегда равен её `clientId` (она никогда не перенимает серверный PK), а синхронизированной строка помечается только по подтверждению сервера. Серверный CRUD разрешает каждый список/позицию по `OR: [{ id }, { clientId }]`, а прямые POST-создания идемпотентны по `clientId`, поэтому повторное или дублированное создание возвращает существующую строку, а не создаёт дубликат. `getLists` также возвращает архивированные списки, поэтому архивацию с другого устройства никогда не путают с удалением.

### Чистые калькуляторы

Три чистые, покрытые unit-тестами функции обеспечивают всю логику (без затрат на AI):

- **`computeBasket`** (`price-history/basket-calculator.ts`) — оценивает стоимость корзины по каждому магазину, беря последнюю цену за единицу товара, выставляет бейдж «самый дешёвый» с учётом покрытия (полное покрытие, иначе лучший магазин с покрытием ≥80%), помечает устаревшие цены и (при переданной точке) добавляет `distanceKm` / `nearby` по каждому магазину через формулу гаверсинусов. Обслуживает Pro-эндпоинт `POST /price-history/basket`.
- **`predictRestock`** (`shopping-list/restock-predictor.ts`) — медианный интервал между покупками канонического товара (≥3 точек) → бесплатный `GET /shopping-list/suggestions`.
- **`detectDeals`** (`shopping-list/deal-detector.ts`) — недавняя цена за единицу товара в магазине на ≥15% ниже 90-дневного среднего в окне 14 дней → бесплатный `GET /shopping-list/deals`.

Ежедневный cron (`shopping-reminder.cron.ts`, `0 10 * * *`) отправляет push с самым срочным напоминанием о покупке (`shopping_reminder`) и с наибольшим падением цены (`shopping_deal`) по каждому аккаунту, каждый с учётом своей настройки (`notifyShoppingReminders` / `notifyShoppingDeals`).

### Таблицы базы данных

- `shopping_lists` / `shopping_list_items` — `@@unique([accountId, clientId])`, мягкое удаление + `sync_version`, каскадные FK (миграция `20260707173751_add_shopping_lists`)

### API эндпоинты

`GET/POST /shopping-list`, `PATCH/DELETE /shopping-list/:id`, `POST /shopping-list/:id/items`, `PATCH/DELETE /shopping-list/items/:itemId`, `POST /shopping-list/:id/clear-checked`, `GET /shopping-list/suggestions`, `GET /shopping-list/deals` — все под `JwtAuthGuard + AccountContextGuard`. Запись позиций коллаборативна (**не** защищена `ViewerBlockGuard`); только `DELETE /shopping-list/:id` требует роль editor или owner. Сравнение корзины `POST /price-history/basket` дополнительно защищено `SubscriptionTierGuard` + `@RequireTier('pro')`.

## Разделение чека

Модуль `receipt-split` позволяет плательщику общего счёта разделить его между людьми, у которых нет приложения, через публичную токенизированную гостевую ссылку — без аккаунта, без JWT, без `X-Account-Id`.

### Как это работает

1. Плательщик назначает позиции отсканированного чека именованным участникам либо делит весь счёт поровну, если позиций нет, через `POST /expenses/:id/receipt-split`. Математика разделения (чистые `resolveItemSplit`/`resolveEqualSplit` из `split-calculator.ts`) работает в целых центах и всегда оставляет остаток округления плательщику.
2. Эта запись создаёт одну строку `receipt_split_participants` **и** один расход `isDebt: true, isSplitReceivable: true` на каждого участника — дебиторскую задолженность — рядом с исходным расходом-чеком (реальным оттоком денег), всё в одной транзакции.
3. Каждый участник получает свой 128-битный случайный токен и публичный URL: `GUEST_LINK_BASE + /s/<token>?lang=<user.language плательщика>`. `GUEST_LINK_BASE` — это `APP_PUBLIC_URL`, если задан, иначе `https://api.ai-budget.pl` (который уже обслуживает этот маршрут) — красивая форма на apex-домене требует nginx-блока `location /s/`, который не поставляется вместе с кодом (см. `docs/ops/receipt-split-rollout.md`).
4. Гость открывает `GET /s/:token` и видит только своё имя, сумму, назначенные позиции, имя плательщика и платёжную ссылку/инструкции — никогда данные другого участника, изображение чека или какой-либо идентификатор аккаунта. Неизвестный, истёкший и отменённый токен дают идентичные по байтам ответы.
5. `POST /s/:token/paid` гостя переводит его статус в `claimed` и отправляет push `split_payment_claimed` плательщику. Плательщик просматривает список статусов по каждому участнику (`sent → opened → claimed → settled`) и вызывает `PATCH /expenses/:id/receipt-split/:participantId/confirm`, который проводит долг ровно тем же путём `DebtsService.recordRepayment`, что и обычный ручной возврат, под атомарным захватом `settledAt IS NULL`.

### Корректность учёта

Разделение счёта на 200 между тремя гостями создаёт расход-чек на 200 **плюс** три расхода `isSplitReceivable` по 50. Учёт обоих дал бы 350 расходов за один ужин. `common/utils/expense-filters.ts` экспортирует `EXCLUDE_SPLIT_RECEIVABLE = { isSplitReceivable: false }` — единый общий предикат, подмешиваемый в каждый пользовательский итог в `analytics.service.ts`, `budget-alert.service.ts`, `safe-to-spend.service.ts` и `wallet.service.ts`. Фильтр намеренно построен на `isSplitReceivable`, никогда на `isDebt` — для обычного денежного займа сама строка долга И ЕСТЬ отток денег, поэтому фильтрация по `isDebt` незаметно исказила бы цифры у каждого пользователя, который уже отслеживает долги. Мобильное приложение зеркалит это через `filterConsumption()` (`apps/mobile/src/utils/consumption.ts`), которую используют семь клиентских поверхностей (`NetProfitWidget`, `useFilteredTransactions`, `useSafeToSpend`, `useScenarioProjection`, `useCalendarData`, `widgetData`, `budgetStore`).

### Таблицы базы данных

- `receipt_split_participants` — `id`, `accountId`, `expenseId` (FK `onDelete: Cascade`, который срабатывает только при настоящем жёстком удалении — приложение мягко удаляет расходы, поэтому `ExpensesService.remove` явно делает недействительным разделение удалённого расхода), `seq`, `name`, `token` (`@unique`), `amount`, `currencyCode`, `itemIds` (`Json?`), `debtExpenseId`, `openedAt`/`claimedAt`/`settledAt`/`cancelledAt`/`expiresAt` (миграции `20260726120000_add_receipt_split`, `20260726130000_add_receipt_split_cancelled_at`).
- Частичный уникальный индекс `receipt_split_live_slot` на `(expense_id, seq) WHERE cancelled_at IS NULL` (миграция `20260727120000_add_receipt_split_participant_seq`) — обеспечивает не более одного **живого** разделения на расход: параллельное двойное создание сталкивается на нём (перехватывается вне `$transaction`), а повторное разделение после отмены свободно переиспользует `seq 0`, поскольку отменённые строки выпали из индекса.
- `expenses.is_split_receivable` (`Boolean @default(false)`) — помечает расход-дебиторку участника, чтобы его можно было исключить из итогов (см. «Корректность учёта» выше).
- `users.payment_method` / `users.payment_handle` (`SettleMethod?` / `String?`) — добавлены в той же первой миграции; платёжная ссылка гостевой страницы сначала разрешается через платёжные данные плательщика на уровне пользователя, откатываясь к его платёжным данным уровня `AccountMember` из trip wallet, если что-то из этого не задано на уровне пользователя.

### API эндпоинты

`POST/GET/PATCH/DELETE /expenses/:id/receipt-split*` — все под `JwtAuthGuard + AccountContextGuard` (на уровне класса) плюс `ViewerBlockGuard` + `TripArchivedGuard` (на маршруте), включая `GET`. `GET /s/:token` и `POST /s/:token/paid` — единственная неаутентифицированная поверхность в приложении: оба исключены из префикса `/api/v1` в `main.ts`, с ограничением частоты 20/60с и 10/60с по IP соответственно. См. [API.md](./API.md#разделение-чека).

## Геолокация расходов и карта

У расхода может быть локация (`{ lat, lng, name? }`), и любой отфильтрованный набор расходов можно показать на карте. Добавлено в ABA-310 (функция) с ABA-311 (структурированное геокодирование).

### Как это работает

1. **Источники координат** (приоритет: ручная точка > адрес с чека > GPS устройства):
   - **Адрес с чека** — при `POST /ai/scan-receipt` `OcrService` извлекает структурированный адрес магазина (`merchantStreet`/`merchantCity`/`merchantPostalCode`/`merchantCountry`, намеренно игнорируя юридический адрес продавца), а `GeocodingService` его геокодирует. Разрешение устройства не требуется.
   - **GPS устройства** — только по согласию (по умолчанию выключено; переключатель в Настройки → Данные и отчёты). Прикрепляется в момент создания к расходам, добавленным вручную, голосом или через захват банковских уведомлений. Требует разрешение на геолокацию.
   - **Ручная точка** — пользователь ставит/двигает точку на экране локации расхода; отправка `location: null` очищает её.
2. **Геокодирование** (`modules/ai/services/geocoding.service.ts`): использует **структурированный** эндпоинт OpenStreetMap/Nominatim (отдельные параметры `street`/`city`/`postalcode`/`country` — намного надёжнее свободного текста для польских чеков, где рядом с адресом магазина печатается юридический адрес продавца), убирает префикс типа улицы (`ul.`, `al.`, кириллические `вул.`/`ул.`…), который структурированный параметр `street` не принимает, и откатывается к центроиду города/индекса, если точное здание не найдено. Результаты, включая «не найдено» (негативные), кэшируются в `geocode_cache`; идентифицирующий User-Agent, интервал между запросами ≥1.1 с, таймаут 5 с, fail-silent (сбой поиска никогда не блокирует сканирование чека).
3. **Отрисовка карты** — только на клиенте, без гео-запросов на сервере. `ExpenseMapView` рисует тайлы OpenStreetMap и кластеризованные точки внутри WebView (нативно) / iframe (веб) на встроенном бандле Leaflet — без нативного модуля карты и без API-ключа. Точки строятся из локального списка расходов.

### Таблицы БД

- `expenses.location_lat` / `location_lng` (`Decimal`) + `location_name` (`TEXT`) — колонки локации в существующей таблице `expenses` (`lat`/`lng` существовали неиспользуемыми с раннего этапа схемы; `location_name` добавлена миграцией `20260703161013_add_expense_location_name_and_geocode_cache`). `location_lat`/`location_lng` входят в набор полей E2EE **tier-2**, `location_name` — в **tier-1**.
- `geocode_cache` — глобальный (не привязанный к аккаунту) кэш «адрес → координаты»: `id`, `queryNormalized` (`@unique`), `lat`/`lng` (`Decimal?`, NULL = негативная запись «не найдено»), `displayName`, `createdAt` (та же миграция).

### Мобильная интеграция

- **`locationCapture.ts`** + **`locationSettingsStore.ts`** (MMKV, по умолчанию выключено): опциональный захват GPS (`expo-location`), таймаут 4 с, никогда не блокирует сохранение.
- **`ExpenseMapView`** (`src/components/map/`): карта Leaflet в WebView/iframe. HTML — закоммиченный самодостаточный ассет, сгенерированный `scripts/build-map-html.js` (`npm run generate:map-html`), с Leaflet, markercluster и иконками маркеров, встроенными как base64 data-URI — `mapHtml.generated.ts` руками не редактировать.
- **Точки входа**: переключатель Список/Карта на вкладке «Расходы» (наследует фильтры по периоду/категории/продавцу), мини-карта и редактор точки на экране расхода, вход «Карта поездки» на счетах-поездках.

### API-эндпоинты

Новых REST-эндпоинтов нет — карта рисуется целиком на клиенте из данных расходов. Локация проходит через существующие эндпоинты создания/обновления/списка расходов (поле запроса `location`; поля ответа `locationLat`/`locationLng`/`locationName`) и поле ответа `location` в `POST /ai/scan-receipt`.

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
