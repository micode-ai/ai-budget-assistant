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
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Серверный слой                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      NestJS бэкенд                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ Контроллеры │  │   Сервисы   │  │      Гарды      │   │  │
│  │  │   (REST)    │  │  (Бизнес)   │  │  (JWT Auth)     │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   PostgreSQL    │ │      Redis      │ │    OpenAI API   │
│   (Prisma ORM)  │ │      (Кэш)      │ │  (GPT/Whisper)  │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

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
│   ├── login.tsx
│   └── register.tsx
├── (tabs)/
│   ├── index.tsx        # Главная панель
│   ├── expenses.tsx     # Список расходов
│   ├── budgets.tsx      # Управление бюджетами
│   ├── analytics.tsx    # Графики и отчёты
│   └── settings.tsx     # Настройки
├── expense/
│   ├── [id].tsx         # Детали расхода
│   └── new.tsx          # Добавить расход
├── budget/
│   └── [id].tsx         # Детали бюджета
├── chat.tsx             # AI ассистент
└── _layout.tsx          # Корневой layout
```

### Управление состоянием

Zustand хранилища управляют состоянием приложения:

| Хранилище | Назначение |
|-----------|------------|
| `useAuthStore` | Состояние аутентификации, токены, профиль |
| `useExpenseStore` | CRUD операции с расходами, фильтры |
| `useBudgetStore` | Управление бюджетами, отслеживание прогресса |
| `useCategoryStore` | Управление категориями |
| `useSyncStore` | Состояние синхронизации, очередь |
| `useSettingsStore` | Настройки приложения, предпочтения |

### Схема локальной базы данных

```typescript
// таблица expenses (расходы)
{
  localId: integer (PK, autoincrement),
  serverId: text (nullable),
  clientId: text (unique),
  categoryId: text,
  amount: real,
  currencyCode: text,
  description: text,
  date: text (ISO),
  location: text (nullable),
  notes: text (nullable),
  receiptUrl: text (nullable),
  isRecurring: integer (boolean),
  recurringPattern: text (nullable),
  source: text (manual|voice|ocr|import),
  syncStatus: text (pending|synced|conflict),
  syncVersion: integer,
  createdAt: text,
  updatedAt: text
}

// таблица categories (категории)
{
  localId: integer (PK),
  serverId: text (nullable),
  name: text,
  icon: text,
  color: text,
  type: text (expense|income),
  isSystem: integer (boolean),
  parentId: text (nullable),
  syncStatus: text,
  syncVersion: integer
}

// таблица budgets (бюджеты)
{
  localId: integer (PK),
  serverId: text (nullable),
  clientId: text (unique),
  name: text,
  amount: real,
  currencyCode: text,
  period: text (daily|weekly|monthly|yearly|custom),
  startDate: text,
  endDate: text (nullable),
  categoryId: text (nullable),
  alertThreshold: integer (0-100),
  isActive: integer (boolean),
  syncStatus: text,
  syncVersion: integer
}

// таблица sync_queue (очередь синхронизации)
{
  id: integer (PK),
  entityType: text (expense|category|budget),
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

### Структура модулей

```
src/
├── modules/
│   ├── auth/                  # Аутентификация
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── jwt.strategy.ts
│   │   └── jwt-auth.guard.ts
│   ├── users/                 # Пользователи
│   │   ├── users.controller.ts
│   │   └── users.service.ts
│   ├── expenses/              # Расходы
│   │   ├── expenses.controller.ts
│   │   ├── expenses.service.ts
│   │   └── dto/
│   ├── budgets/               # Бюджеты
│   │   ├── budgets.controller.ts
│   │   ├── budgets.service.ts
│   │   └── dto/
│   ├── categories/            # Категории
│   │   ├── categories.controller.ts
│   │   └── categories.service.ts
│   ├── ai/                    # AI сервисы
│   │   ├── ai.controller.ts
│   │   └── services/
│   │       ├── transcription.service.ts
│   │       ├── categorization.service.ts
│   │       ├── chat.service.ts
│   │       └── receipt-scanner.service.ts
│   ├── analytics/             # Аналитика
│   │   ├── analytics.controller.ts
│   │   └── analytics.service.ts
│   └── sync/                  # Синхронизация
│       ├── sync.controller.ts
│       └── sync.service.ts
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   └── interceptors/
└── prisma/
    └── prisma.service.ts
```

### Схема базы данных (PostgreSQL)

```prisma
model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String
  name         String?
  currencyCode String    @default("USD")
  timezone     String    @default("UTC")
  pushToken    String?
  lastSyncAt   DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  expenses      Expense[]
  budgets       Budget[]
  categories    Category[]
  conversations ChatConversation[]
  budgetAlerts  BudgetAlert[]
  syncLogs      SyncLog[]
}

model Expense {
  id               String   @id @default(uuid())
  userId           String
  clientId         String
  categoryId       String?
  amount           Decimal  @db.Decimal(12, 2)
  currencyCode     String   @default("USD")
  description      String
  date             DateTime
  location         String?
  notes            String?
  receiptUrl       String?
  isRecurring      Boolean  @default(false)
  recurringPattern String?
  source           String   @default("manual")
  syncVersion      Int      @default(1)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  deletedAt        DateTime?

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  category Category? @relation(fields: [categoryId], references: [id])

  @@unique([userId, clientId])
  @@index([userId, date])
}

model Category {
  id          String    @id @default(uuid())
  userId      String?
  name        String
  icon        String
  color       String
  type        String    @default("expense")
  isSystem    Boolean   @default(false)
  parentId    String?
  syncVersion Int       @default(1)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  user     User?      @relation(fields: [userId], references: [id], onDelete: Cascade)
  parent   Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children Category[] @relation("CategoryHierarchy")
  expenses Expense[]
  budgets  Budget[]

  @@unique([userId, name, type])
}

model Budget {
  id             String    @id @default(uuid())
  userId         String
  clientId       String
  name           String
  amount         Decimal   @db.Decimal(12, 2)
  currencyCode   String    @default("USD")
  period         String    @default("monthly")
  startDate      DateTime
  endDate        DateTime?
  categoryId     String?
  alertThreshold Int       @default(80)
  isActive       Boolean   @default(true)
  syncVersion    Int       @default(1)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?

  user     User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  category Category?     @relation(fields: [categoryId], references: [id])
  alerts   BudgetAlert[]

  @@unique([userId, clientId])
}

model BudgetAlert {
  id                  String   @id @default(uuid())
  budgetId            String
  userId              String
  thresholdPercentage Int
  triggeredAt         DateTime @default(now())
  currentSpent        Decimal  @db.Decimal(12, 2)

  budget Budget @relation(fields: [budgetId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model ChatConversation {
  id        String   @id @default(uuid())
  userId    String
  title     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user     User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages ChatMessage[]
}

model ChatMessage {
  id             String   @id @default(uuid())
  conversationId String
  role           String   // user, assistant, system
  content        String
  tokensUsed     Int?
  createdAt      DateTime @default(now())

  conversation ChatConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
}

model SyncLog {
  id               String    @id @default(uuid())
  userId           String
  entityType       String    // expense, category, budget
  entityId         String
  operation        String    // create, update, delete
  clientVersion    Int
  serverVersion    Int
  conflictResolved Boolean   @default(false)
  createdAt        DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
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
4. **Ручное разрешение**: Пользователь может выбрать версию (планируется)

## Интеграция с AI

### Сервисы

| Сервис | Модель OpenAI | Назначение |
|--------|---------------|------------|
| Транскрипция | Whisper | Преобразование аудио в текст |
| Парсинг расходов | GPT-4 | Извлечение данных о расходе из текста |
| Категоризация | GPT-4 | Предложение категорий для расходов |
| Сканер чеков | GPT-4 Vision | Извлечение данных из изображений чеков |
| Чат ассистент | GPT-4 | Финансовые советы и аналитика |

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
- **CORS**: Настроенные ограничения по источникам
- **Валидация ввода**: Zod схемы и class-validator

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
- **Индексы БД**: Оптимизированные запросы по userId, date
- **Пакетные операции**: Синхронизация обрабатывает несколько изменений сразу
- **Пул соединений**: Prisma управляет соединениями с БД
