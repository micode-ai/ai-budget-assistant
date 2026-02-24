# Admin Panel — AI Budget Assistant

[English](../en/README.md) | [Русский](README.md)

Веб-приложение для администрирования платформы AI Budget Assistant. Предоставляет инструменты управления пользователями, аналитику, мониторинг системы и коммуникации.

---

## Содержание

1. [Стек технологий](#стек-технологий)
2. [Структура проекта](#структура-проекта)
3. [Запуск и разработка](#запуск-и-разработка)
4. [Конфигурация](#конфигурация)
5. [Аутентификация](#аутентификация)
6. [Маршруты и страницы](#маршруты-и-страницы)
7. [Компоненты](#компоненты)
8. [Хуки и слой данных](#хуки-и-слой-данных)
9. [HTTP-клиент и API](#http-клиент-и-api)
10. [Real-time обновления](#real-time-обновления)
11. [Типы данных](#типы-данных)
12. [Стили и UI-система](#стили-и-ui-система)

---

## Стек технологий

| Категория | Технология | Версия |
|---|---|---|
| Фреймворк | Next.js (App Router) | 16.x |
| UI-библиотека | React | 19.x |
| Стили | Tailwind CSS | 4.x |
| Компоненты | shadcn/ui (New York) + Radix UI | — |
| Иконки | Lucide React | 0.575 |
| Серверный стейт | TanStack React Query | 5.x |
| Таблицы | TanStack React Table | 8.x |
| HTTP-клиент | Ky | 1.x |
| Формы | React Hook Form + Zod | 7.x / 3.x |
| Графики | Recharts | 3.x |
| Real-time | Socket.IO Client | 4.x |
| Даты | date-fns + react-day-picker | 4.x / 9.x |
| Тосты | Sonner | 2.x |
| Темы | next-themes | 0.4 |

---

## Структура проекта

```
apps/admin/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Корневой layout с провайдерами
│   │   ├── page.tsx                  # Дашборд (/)
│   │   ├── login/
│   │   │   └── page.tsx              # Страница входа
│   │   ├── users/
│   │   │   ├── page.tsx              # Список пользователей
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Детальная карточка пользователя
│   │   ├── ai-usage/
│   │   │   └── page.tsx              # Аналитика AI
│   │   ├── subscriptions/
│   │   │   └── page.tsx              # Аналитика подписок
│   │   ├── communications/
│   │   │   └── page.tsx              # Уведомления и рассылки
│   │   ├── audit-log/
│   │   │   └── page.tsx              # Журнал действий администраторов
│   │   ├── settings/
│   │   │   └── page.tsx              # Системные настройки и здоровье системы
│   │   └── globals.css
│   ├── components/
│   │   ├── layout/                   # Структурные компоненты
│   │   │   ├── app-shell.tsx
│   │   │   ├── app-sidebar.tsx
│   │   │   └── header.tsx
│   │   ├── dashboard/                # Компоненты дашборда
│   │   │   ├── kpi-cards.tsx
│   │   │   ├── subscription-pie-chart.tsx
│   │   │   ├── registrations-chart.tsx
│   │   │   ├── ai-cost-chart.tsx
│   │   │   └── live-activity-feed.tsx
│   │   ├── common/                   # Переиспользуемые компоненты
│   │   │   ├── status-badge.tsx
│   │   │   ├── tier-badge.tsx
│   │   │   ├── loading-skeleton.tsx
│   │   │   └── date-range-picker.tsx
│   │   └── ui/                       # shadcn/ui компоненты (45+)
│   ├── hooks/                        # Кастомные хуки (React Query)
│   │   ├── use-dashboard.ts
│   │   ├── use-users.ts
│   │   ├── use-subscriptions.ts
│   │   ├── use-ai-usage.ts
│   │   ├── use-audit-log.ts
│   │   ├── use-communications.ts
│   │   └── use-realtime.ts
│   ├── providers/
│   │   ├── auth-provider.tsx         # Контекст аутентификации
│   │   └── query-provider.tsx        # Конфигурация React Query
│   ├── lib/
│   │   ├── api-client.ts             # Ky HTTP-клиент с интерсепторами
│   │   ├── auth.ts                   # Логика входа/выхода
│   │   ├── socket.ts                 # Socket.IO клиент
│   │   └── utils.ts                  # Форматирование (валюта, даты, числа)
│   └── types/
│       └── index.ts                  # TypeScript-интерфейсы домена
├── public/
├── .env.local.example
├── components.json                   # Конфигурация shadcn
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## Запуск и разработка

### Требования

- Node.js 20+
- Запущенный `apps/api` (по умолчанию на порту 3000)

### Установка зависимостей

```bash
# из корня монорепо
npm install
```

### Переменные окружения

Скопировать и заполнить:

```bash
cp apps/admin/.env.local.example apps/admin/.env.local
```

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```

### Запуск

```bash
# Из корня монорепо — запуск всех сервисов
npm run dev

# Только admin (из apps/admin)
npm run dev        # → http://localhost:3001

# Production-сборка
npm run build
npm run start
```

### Прочие команды

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
```

---

## Конфигурация

### `next.config.ts`

```ts
{
  devIndicators: false,
  transpilePackages: ["@budget/shared-types", "@budget/shared-utils"],
  typescript: {
    ignoreBuildErrors: true,  // Обход конфликта @types/react в монорепо
  },
}
```

Пакеты монорепо `@budget/shared-types` и `@budget/shared-utils` транспилируются Next.js на лету — отдельная сборка не требуется.

### `components.json` (shadcn/ui)

```json
{
  "style": "new-york",
  "rsc": true,
  "tailwind": { "baseColor": "neutral", "cssVariables": true },
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

---

## Аутентификация

### Поток входа

```
1. Форма /login → POST /auth/login { email, password }
2. API возвращает { accessToken, refreshToken, user }
3. Сохранение в localStorage: admin_token, admin_refresh_token, admin_user
4. Верификация прав: GET /admin/system/health
   ├── 200 OK → redirect /
   └── 401/403 → очистка токенов, ошибка "Admin privileges required"
```

### Провайдер `AuthProvider`

```ts
interface AuthContextValue {
  user: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
```

- Инициализируется из localStorage при загрузке страницы
- `AppShell` редиректит на `/login`, если пользователь не аутентифицирован

### Защита маршрутов

`AppShell` проверяет `isAuthenticated()` перед рендером. Если токен отсутствует — немедленный редирект на `/login`.

Токен автоматически подставляется в каждый HTTP-запрос через интерсептор Ky. При получении `401` — токены удаляются, пользователь перенаправляется на страницу входа.

---

## Маршруты и страницы

### `/` — Дашборд

Главная страница с обзором платформы в реальном времени.

**Компоненты:**
- `KpiCards` — 6 метрик: пользователи, активность, расходы, MRR, изменение MRR, стоимость AI
- `SubscriptionPieChart` — распределение пользователей по тарифам (Free / Pro / Business / Trialing)
- `RegistrationsChart` — гистограмма ежедневных регистраций
- `AiCostChart` — график стоимости AI-запросов по дням
- `LiveActivityFeed` — живая лента событий через Socket.IO

**Данные:** `useDashboard()` → `GET /admin/dashboard` + `GET /admin/analytics/overview`

---

### `/login` — Вход

Форма аутентификации. Не требует предварительной авторизации.

---

### `/users` — Управление пользователями

Таблица всех пользователей с фильтрацией и пагинацией.

**Фильтры:**
- Поиск по имени/email (debounce 300 мс)
- Фильтр по тарифу: All / Free / Pro / Business
- Фильтр по статусу: All / Active / Inactive

**Колонки таблицы:** имя, email, тариф, статус, дата регистрации, последняя синхронизация, действия

**Данные:** `useUsers({ page, limit, search, tier, status })` → `GET /admin/users`

---

### `/users/[id]` — Карточка пользователя

Детальная информация о пользователе с возможностью управления.

**Секции:**
- Профиль: контакты, настройки, push-токен
- Подписка: тариф, статус, лимиты AI, Stripe ID — с возможностью смены тарифа
- AI-использование: количество запросов и стоимость за период
- Аккаунты: список финансовых аккаунтов пользователя
- Последние расходы / доходы
- История уведомлений
- Действия: отправить push, отправить email, деактивировать пользователя

**Данные:** `useUserDetail(id)` → `GET /admin/users/:id`

---

### `/ai-usage` — Аналитика AI

Анализ использования и стоимости AI-функций.

**Возможности:**
- Выбор периода через `DateRangePicker`
- Сводные карточки: всего запросов, суммарная стоимость, уникальные пользователи
- Donut-chart распределения по фичам
- Area-chart динамики стоимости по дням
- Таблица топ-пользователей по AI-расходам
- Экспорт в CSV (генерация на клиенте)

**Данные:** `useAiUsage({ from, to })` → `GET /admin/analytics/ai-usage`

---

### `/subscriptions` — Аналитика подписок

Статистика по подпискам и монетизации.

**Метрики:** MRR, churn rate, trial conversion, изменения тарифов

**Визуализация:**
- Pie-chart распределения по тарифам
- Таблица последних смен тарифа

**Данные:** `useSubscriptions()` → `GET /admin/analytics/subscriptions`

---

### `/communications` — Уведомления и рассылки

Инструмент для коммуникации с пользователями. 5 вкладок:

| Вкладка | Действие |
|---|---|
| Send Push | Push-уведомление конкретным пользователям по ID |
| Send Email | Email конкретным пользователям по ID |
| Broadcast | Массовая рассылка с фильтрами (тариф, язык) |
| Scheduled | Список запланированных уведомлений с отменой |
| History | Журнал отправленных уведомлений с пагинацией |

**Данные:** `useCommunications()` → `POST/GET /admin/notifications/*`

---

### `/audit-log` — Журнал аудита

История всех административных действий.

**Фильтры:** поиск по action, тип цели (user / subscription / notification / settings)

**Колонки:** администратор, действие, цель, детали, IP-адрес, дата

**Данные:** `useAuditLog({ page, action, targetType })` → `GET /admin/audit-log`

---

### `/settings` — Настройки системы

**Секции:**
- System Health: статус API, PostgreSQL, Redis, uptime, memory
- AI Cost Rates: ставки стоимости по моделям
- Admin Access: информация о текущем администраторе

**Данные:** `GET /admin/system/health`

---

## Компоненты

### Layout

#### `AppShell`

Главная обёртка приложения. Проверяет аутентификацию, рендерит `AppSidebar` + `Header` + `main` с контентом. При загрузке — `LoadingSkeleton`.

#### `AppSidebar`

Коллапсируемый sidebar с навигацией. 7 пунктов меню:

| Иконка | Пункт | Маршрут |
|---|---|---|
| LayoutDashboard | Dashboard | `/` |
| Users | Users | `/users` |
| Bot | AI Usage | `/ai-usage` |
| CreditCard | Subscriptions | `/subscriptions` |
| MessageSquare | Communications | `/communications` |
| ClipboardList | Audit Log | `/audit-log` |
| Settings | Settings | `/settings` |

В свёрнутом состоянии иконки отображаются с Tooltip.

#### `Header`

Верхняя панель с:
- Индикатором подключения Socket.IO (зелёная точка — online)
- Именем текущего администратора
- Dropdown-меню с выходом

### Dashboard

| Компонент | Описание |
|---|---|
| `KpiCards` | 6 карточек KPI с иконками и динамикой |
| `SubscriptionPieChart` | Donut-chart по тарифам через Recharts |
| `RegistrationsChart` | Bar-chart регистраций через Recharts |
| `AiCostChart` | Area-chart стоимости AI через Recharts |
| `LiveActivityFeed` | Лента событий из Socket.IO, максимум 50 записей |

### Common

| Компонент | Пропсы | Описание |
|---|---|---|
| `StatusBadge` | `status: 'active' \| 'inactive'` | Цветной бейдж статуса |
| `TierBadge` | `tier: SubscriptionTier` | Цветной бейдж тарифа |
| `LoadingSkeleton` | — | Skeleton-заглушка при загрузке страниц |
| `DateRangePicker` | `value`, `onChange` | Выбор диапазона дат (react-day-picker) |

---

## Хуки и слой данных

Все хуки построены на **TanStack React Query**. Конфигурация:

```ts
// src/providers/query-provider.tsx
{
  staleTime: 30_000,       // данные актуальны 30 секунд
  retry: 1,                // 1 повтор при ошибке
  refetchOnWindowFocus: false,
}
```

### `useDashboard()`

```ts
GET /admin/dashboard           → DashboardStats
GET /admin/analytics/overview  → AnalyticsOverview
GET /admin/analytics/ai-usage  → AiUsageTrend[]
```

### `useUsers(params)`

```ts
GET /admin/users?page&limit&search&tier&status  → PaginatedResponse<AdminUserListItem>
PATCH /admin/users/:id          → обновление пользователя
PATCH /admin/users/:id/subscription → смена тарифа
DELETE /admin/users/:id         → деактивация
```

### `useUserDetail(id)`

```ts
GET /admin/users/:id  → AdminUserDetail
// Refetch каждые 30 секунд
```

### `useAiUsage(params)`

```ts
GET /admin/analytics/ai-usage?from&to  → { trends, summary, topUsers }
```

### `useSubscriptions()`

```ts
GET /admin/analytics/subscriptions  → SubscriptionStats
```

### `useCommunications()`

```ts
POST /admin/notifications/push        → отправка push
POST /admin/notifications/email       → отправка email
POST /admin/notifications/broadcast   → массовая рассылка
POST /admin/notifications/schedule    → планирование
DELETE /admin/notifications/scheduled/:id → отмена
GET /admin/notifications/history      → PaginatedResponse<NotificationLogItem>
GET /admin/notifications/scheduled    → ScheduledNotificationItem[]
```

### `useAuditLog(params)`

```ts
GET /admin/audit-log?page&limit&action&targetType  → PaginatedResponse<AuditLogItem>
```

### `useRealtime()`

Хук для подключения к Socket.IO и получения live-событий. Возвращает `{ events, isConnected }`.

---

## HTTP-клиент и API

### `src/lib/api-client.ts`

Обёртка над [Ky](https://github.com/sindresorhus/ky):

```ts
const apiClient = ky.create({
  prefixUrl: process.env.NEXT_PUBLIC_API_URL, // default: http://localhost:3000/api/v1
  hooks: {
    beforeRequest: [
      (request) => {
        const token = localStorage.getItem('admin_token');
        if (token) request.headers.set('Authorization', `Bearer ${token}`);
      },
    ],
    afterResponse: [
      async (request, options, response) => {
        if (response.status === 401) {
          // Очистка токенов + редирект на /login
        }
      },
    ],
  },
});
```

### `src/lib/auth.ts`

```ts
login(email, password)    // POST /auth/login + верификация через /admin/system/health
logout()                  // Очистка localStorage + redirect /login
isAuthenticated()         // Проверка наличия токена
getToken()                // Чтение из localStorage
```

---

## Real-time обновления

### `src/lib/socket.ts`

```ts
// Namespace: /admin
// URL: NEXT_PUBLIC_SOCKET_URL (default: http://localhost:3000)
// Auth: { token } в опциях подключения
// Transport: websocket → polling fallback
```

### События Socket.IO

| Событие (входящее) | Тип | Описание |
|---|---|---|
| `admin:new-user` | `new_user` | Зарегистрировался новый пользователь |
| `admin:ai-request` | `ai_request` | Выполнен AI-запрос |
| `admin:error` | `error` | Системная ошибка |
| `admin:subscription-change` | `subscription_change` | Изменение тарифа пользователя |

| Событие (исходящее) | Описание |
|---|---|
| `admin:subscribe` | Сигнал подписки на admin-события после подключения |

Лента событий хранит максимум **50 записей** (кольцевой буфер). Индикатор подключения отображается в `Header`.

---

## Типы данных

Все типы определены в `src/types/index.ts`.

### Пользователи

```ts
interface AdminUserListItem {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  currencyCode: string;
  language: string;
  createdAt: string;
  lastSyncAt: string | null;
  subscription: {
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    aiRequestsUsed: number;
  } | null;
}

interface AdminUserDetail extends AdminUserListItem {
  timezone: string;
  pushToken: string | null;
  weeklyEmailEnabled: boolean;
  monthlyDigestEnabled: boolean;
  aiResponseMode: string;
  aiModel: string;
  subscription: { /* + trialEndsAt, stripeCustomerId, stripePriceId */ };
  accounts: Array<{ id; name; type; role; currencyCode }>;
  aiUsage: AdminUserUsageItem;
  recentExpenses: Array<{ id; amount; currency; description; category; date; source }>;
  recentIncomes: Array<{ id; amount; currency; description; date }>;
}
```

### Дашборд и аналитика

```ts
interface DashboardStats {
  totalUsers: number;
  activeToday: number;
  totalExpenses: number;
  totalIncome: number;
  mrr: number;
  mrrChange: number;
  subscriptions: { free; pro; business; trialing };
  aiUsage: { periodStart; periodEnd; totalCostUnits; totalEstimatedCostUsd; totalRequests; users };
}

interface AnalyticsOverview {
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  activeUsersToday: number;
  activeUsersThisWeek: number;
  mrr: number;
  mrrChange: number;
  totalRevenue: number;
  dailyRegistrations: Array<{ date: string; count: number }>;
}

interface AiUsageTrend {
  date: string;
  totalCost: number;
  totalRequests: number;
  byFeature: Record<string, { cost: number; count: number }>;
}
```

### Уведомления и аудит

```ts
interface NotificationLogItem {
  id: string;
  adminId: string;
  adminName: string;
  type: 'push' | 'email' | 'broadcast';
  recipientCount: number;
  successCount: number;
  failCount: number;
  subject: string | null;
  body: string;
  filters: Record<string, unknown> | null;
  createdAt: string;
}

interface ScheduledNotificationItem {
  id: string;
  type: 'push' | 'email' | 'broadcast';
  title: string | null;
  subject: string | null;
  body: string;
  scheduledAt: string;
  executedAt: string | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
}

interface AuditLogItem {
  id: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}
```

### Система

```ts
interface SystemHealth {
  api: 'ok' | 'error';
  database: 'ok' | 'error';
  redis: 'ok' | 'error';
  uptime: number;
  memoryUsage: number;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

---

## Стили и UI-система

### Tailwind CSS 4

Используется новая интеграция `@tailwindcss/postcss`. CSS-переменные включены для поддержки тем. Базовая цветовая схема — **neutral**.

### shadcn/ui

Стиль **New York**. Компоненты расположены в `src/components/ui/`. Добавление нового компонента:

```bash
npx shadcn@latest add <component-name>
```

### Утилиты форматирования (`src/lib/utils.ts`)

```ts
cn(...classes)                    // Merge Tailwind-классов (clsx + tailwind-merge)
formatCurrency(amount, currency)  // Intl.NumberFormat → "1 234,56 $"
formatDate(date)                  // "Feb 24, 2026"
formatDateTime(date)              // "Feb 24, 2026 14:30"
formatRelative(date)              // "2 hours ago"
formatNumber(n)                   // Локализованное число
formatPercent(value)              // "+1.5%"
```

### Темизация

Поддержка тёмной/светлой темы через `next-themes`. Переключатель можно добавить в `Header`.

---

## Связь с монорепо

Admin-панель — часть Turborepo-монорепо. Зависимости:

- `@budget/shared-types` — TypeScript-интерфейсы сущностей и DTO
- `@budget/shared-utils` — Zod-схемы и утилиты форматирования

Оба пакета транспилируются Next.js через `transpilePackages` — собирать их отдельно не нужно.

При изменении shared-пакетов (добавление полей, новые типы) пересборка admin запускается автоматически через Turbo.
