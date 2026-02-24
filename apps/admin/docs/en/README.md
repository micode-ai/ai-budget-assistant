# Admin Panel — AI Budget Assistant

[English](README.md) | [Русский](../ru/README.md)

Web application for administering the AI Budget Assistant platform. Provides user management tools, analytics, system monitoring, and communications.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Running & Development](#running--development)
4. [Configuration](#configuration)
5. [Authentication](#authentication)
6. [Routes & Pages](#routes--pages)
7. [Components](#components)
8. [Hooks & Data Layer](#hooks--data-layer)
9. [HTTP Client & API](#http-client--api)
10. [Real-time Updates](#real-time-updates)
11. [Data Types](#data-types)
12. [Styles & UI System](#styles--ui-system)

---

## Tech Stack

| Category | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.x |
| UI Library | React | 19.x |
| Styles | Tailwind CSS | 4.x |
| Components | shadcn/ui (New York) + Radix UI | — |
| Icons | Lucide React | 0.575 |
| Server State | TanStack React Query | 5.x |
| Tables | TanStack React Table | 8.x |
| HTTP Client | Ky | 1.x |
| Forms | React Hook Form + Zod | 7.x / 3.x |
| Charts | Recharts | 3.x |
| Real-time | Socket.IO Client | 4.x |
| Dates | date-fns + react-day-picker | 4.x / 9.x |
| Toasts | Sonner | 2.x |
| Themes | next-themes | 0.4 |

---

## Project Structure

```
apps/admin/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout with providers
│   │   ├── page.tsx                  # Dashboard (/)
│   │   ├── login/
│   │   │   └── page.tsx              # Login page
│   │   ├── users/
│   │   │   ├── page.tsx              # Users list
│   │   │   └── [id]/
│   │   │       └── page.tsx          # User detail page
│   │   ├── ai-usage/
│   │   │   └── page.tsx              # AI analytics
│   │   ├── subscriptions/
│   │   │   └── page.tsx              # Subscription analytics
│   │   ├── communications/
│   │   │   └── page.tsx              # Notifications & broadcasts
│   │   ├── audit-log/
│   │   │   └── page.tsx              # Admin action audit log
│   │   ├── settings/
│   │   │   └── page.tsx              # System settings & health
│   │   └── globals.css
│   ├── components/
│   │   ├── layout/                   # Structural components
│   │   │   ├── app-shell.tsx
│   │   │   ├── app-sidebar.tsx
│   │   │   └── header.tsx
│   │   ├── dashboard/                # Dashboard components
│   │   │   ├── kpi-cards.tsx
│   │   │   ├── subscription-pie-chart.tsx
│   │   │   ├── registrations-chart.tsx
│   │   │   ├── ai-cost-chart.tsx
│   │   │   └── live-activity-feed.tsx
│   │   ├── common/                   # Reusable components
│   │   │   ├── status-badge.tsx
│   │   │   ├── tier-badge.tsx
│   │   │   ├── loading-skeleton.tsx
│   │   │   └── date-range-picker.tsx
│   │   └── ui/                       # shadcn/ui components (45+)
│   ├── hooks/                        # Custom hooks (React Query)
│   │   ├── use-dashboard.ts
│   │   ├── use-users.ts
│   │   ├── use-subscriptions.ts
│   │   ├── use-ai-usage.ts
│   │   ├── use-audit-log.ts
│   │   ├── use-communications.ts
│   │   └── use-realtime.ts
│   ├── providers/
│   │   ├── auth-provider.tsx         # Auth context
│   │   └── query-provider.tsx        # React Query config
│   ├── lib/
│   │   ├── api-client.ts             # Ky HTTP client with interceptors
│   │   ├── auth.ts                   # Login/logout logic
│   │   ├── socket.ts                 # Socket.IO client
│   │   └── utils.ts                  # Formatting utilities
│   └── types/
│       └── index.ts                  # Domain TypeScript interfaces
├── public/
├── .env.local.example
├── components.json                   # shadcn config
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## Running & Development

### Requirements

- Node.js 20+
- Running `apps/api` (default port 3000)

### Install Dependencies

```bash
# from monorepo root
npm install
```

### Environment Variables

Copy and fill in:

```bash
cp apps/admin/.env.local.example apps/admin/.env.local
```

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```

### Start

```bash
# From monorepo root — start all services
npm run dev

# Admin only (from apps/admin)
npm run dev        # → http://localhost:3001

# Production build
npm run build
npm run start
```

### Other Commands

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
```

---

## Configuration

### `next.config.ts`

```ts
{
  devIndicators: false,
  transpilePackages: ["@budget/shared-types", "@budget/shared-utils"],
  typescript: {
    ignoreBuildErrors: true,  // Workaround for @types/react conflict in monorepo
  },
}
```

Monorepo packages `@budget/shared-types` and `@budget/shared-utils` are transpiled by Next.js on the fly — no separate build step required.

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

## Authentication

### Login Flow

```
1. /login form → POST /auth/login { email, password }
2. API returns { accessToken, refreshToken, user }
3. Stored in localStorage: admin_token, admin_refresh_token, admin_user
4. Verification: GET /admin/system/health
   ├── 200 OK → redirect /
   └── 401/403 → clear tokens, throw "Admin privileges required"
```

### `AuthProvider`

```ts
interface AuthContextValue {
  user: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
```

- Initialized from localStorage on page load
- `AppShell` redirects to `/login` if the user is not authenticated

### Route Protection

`AppShell` checks `isAuthenticated()` before rendering. If no token is found — immediate redirect to `/login`.

The token is automatically injected into every HTTP request via the Ky interceptor. On `401` — tokens are cleared and the user is redirected to the login page.

---

## Routes & Pages

### `/` — Dashboard

Main page with a real-time platform overview.

**Components:**
- `KpiCards` — 6 metrics: users, activity, expenses, MRR, MRR change, AI cost
- `SubscriptionPieChart` — user distribution by tier (Free / Pro / Business / Trialing)
- `RegistrationsChart` — bar chart of daily registrations
- `AiCostChart` — area chart of AI request costs over time
- `LiveActivityFeed` — live event feed via Socket.IO

**Data:** `useDashboard()` → `GET /admin/dashboard` + `GET /admin/analytics/overview`

---

### `/login` — Login

Authentication form. No authorization required.

---

### `/users` — User Management

User table with filtering and pagination.

**Filters:**
- Search by name/email (300ms debounce)
- Tier filter: All / Free / Pro / Business
- Status filter: All / Active / Inactive

**Table columns:** name, email, tier, status, registered, last sync, actions

**Data:** `useUsers({ page, limit, search, tier, status })` → `GET /admin/users`

---

### `/users/[id]` — User Detail

Detailed user information with management actions.

**Sections:**
- Profile: contacts, settings, push token
- Subscription: tier, status, AI limits, Stripe ID — with tier change
- AI usage: request count and cost for the period
- Accounts: list of the user's financial accounts
- Recent expenses / income
- Notification history
- Actions: send push, send email, deactivate user

**Data:** `useUserDetail(id)` → `GET /admin/users/:id`

---

### `/ai-usage` — AI Analytics

Analysis of AI feature usage and costs.

**Features:**
- Period selection via `DateRangePicker`
- Summary cards: total requests, total cost, unique users
- Donut chart of distribution by feature
- Area chart of daily cost trend
- Top users by AI spend table
- CSV export (client-side generation)

**Data:** `useAiUsage({ from, to })` → `GET /admin/analytics/ai-usage`

---

### `/subscriptions` — Subscription Analytics

Subscription and monetization statistics.

**Metrics:** MRR, churn rate, trial conversion, tier changes

**Visualizations:**
- Pie chart of tier distribution
- Recent tier changes table

**Data:** `useSubscriptions()` → `GET /admin/analytics/subscriptions`

---

### `/communications` — Notifications & Broadcasts

Communication tool for reaching users. 5 tabs:

| Tab | Action |
|---|---|
| Send Push | Push notification to specific users by ID |
| Send Email | Email to specific users by ID |
| Broadcast | Mass send with filters (tier, language) |
| Scheduled | List of scheduled notifications with cancel |
| History | Paginated sent notification log |

**Data:** `useCommunications()` → `POST/GET /admin/notifications/*`

---

### `/audit-log` — Audit Log

History of all administrative actions.

**Filters:** search by action, target type (user / subscription / notification / settings)

**Columns:** admin, action, target, details, IP address, date

**Data:** `useAuditLog({ page, action, targetType })` → `GET /admin/audit-log`

---

### `/settings` — System Settings

**Sections:**
- System Health: API, PostgreSQL, Redis status, uptime, memory
- AI Cost Rates: cost rates by model
- Admin Access: current administrator info

**Data:** `GET /admin/system/health`

---

## Components

### Layout

#### `AppShell`

Main application wrapper. Checks authentication, renders `AppSidebar` + `Header` + `main` with content. Shows `LoadingSkeleton` while loading.

#### `AppSidebar`

Collapsible sidebar with navigation. 7 menu items:

| Icon | Item | Route |
|---|---|---|
| LayoutDashboard | Dashboard | `/` |
| Users | Users | `/users` |
| Bot | AI Usage | `/ai-usage` |
| CreditCard | Subscriptions | `/subscriptions` |
| MessageSquare | Communications | `/communications` |
| ClipboardList | Audit Log | `/audit-log` |
| Settings | Settings | `/settings` |

In collapsed state, icons are shown with Tooltips.

#### `Header`

Top bar with:
- Socket.IO connection indicator (green dot — online)
- Current administrator name
- Dropdown menu with logout

### Dashboard

| Component | Description |
|---|---|
| `KpiCards` | 6 KPI cards with icons and trends |
| `SubscriptionPieChart` | Donut chart by tier via Recharts |
| `RegistrationsChart` | Bar chart of registrations via Recharts |
| `AiCostChart` | Area chart of AI costs via Recharts |
| `LiveActivityFeed` | Socket.IO event feed, max 50 entries |

### Common

| Component | Props | Description |
|---|---|---|
| `StatusBadge` | `status: 'active' \| 'inactive'` | Color-coded status badge |
| `TierBadge` | `tier: SubscriptionTier` | Color-coded tier badge |
| `LoadingSkeleton` | — | Skeleton placeholder while pages load |
| `DateRangePicker` | `value`, `onChange` | Date range selector (react-day-picker) |

---

## Hooks & Data Layer

All hooks are built on **TanStack React Query**. Configuration:

```ts
// src/providers/query-provider.tsx
{
  staleTime: 30_000,        // data is fresh for 30 seconds
  retry: 1,                 // 1 retry on failure
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
PATCH /admin/users/:id                          → update user
PATCH /admin/users/:id/subscription             → change tier
DELETE /admin/users/:id                         → deactivate
```

### `useUserDetail(id)`

```ts
GET /admin/users/:id  → AdminUserDetail
// Refetches every 30 seconds
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
POST /admin/notifications/push              → send push
POST /admin/notifications/email             → send email
POST /admin/notifications/broadcast         → mass send
POST /admin/notifications/schedule          → schedule notification
DELETE /admin/notifications/scheduled/:id   → cancel scheduled
GET /admin/notifications/history            → PaginatedResponse<NotificationLogItem>
GET /admin/notifications/scheduled          → ScheduledNotificationItem[]
```

### `useAuditLog(params)`

```ts
GET /admin/audit-log?page&limit&action&targetType  → PaginatedResponse<AuditLogItem>
```

### `useRealtime()`

Hook for connecting to Socket.IO and receiving live events. Returns `{ events, isConnected }`.

---

## HTTP Client & API

### `src/lib/api-client.ts`

Wrapper around [Ky](https://github.com/sindresorhus/ky):

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
          // Clear tokens + redirect to /login
        }
      },
    ],
  },
});
```

### `src/lib/auth.ts`

```ts
login(email, password)   // POST /auth/login + verify via /admin/system/health
logout()                 // Clear localStorage + redirect /login
isAuthenticated()        // Check token presence
getToken()               // Read from localStorage
```

---

## Real-time Updates

### `src/lib/socket.ts`

```ts
// Namespace: /admin
// URL: NEXT_PUBLIC_SOCKET_URL (default: http://localhost:3000)
// Auth: { token } in connection options
// Transport: websocket → polling fallback
```

### Socket.IO Events

| Event (incoming) | Type | Description |
|---|---|---|
| `admin:new-user` | `new_user` | A new user registered |
| `admin:ai-request` | `ai_request` | An AI request was made |
| `admin:error` | `error` | System error occurred |
| `admin:subscription-change` | `subscription_change` | User tier changed |

| Event (outgoing) | Description |
|---|---|
| `admin:subscribe` | Subscribe signal sent after connecting |

The event feed holds a maximum of **50 entries** (ring buffer). Connection status is shown in `Header`.

---

## Data Types

All types are defined in `src/types/index.ts`.

### Users

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

### Dashboard & Analytics

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

### Notifications & Audit

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

### System

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

## Styles & UI System

### Tailwind CSS 4

Uses the new `@tailwindcss/postcss` integration. CSS variables are enabled for theming. Base color scheme — **neutral**.

### shadcn/ui

Style: **New York**. Components are in `src/components/ui/`. To add a new component:

```bash
npx shadcn@latest add <component-name>
```

### Formatting Utilities (`src/lib/utils.ts`)

```ts
cn(...classes)                    // Merge Tailwind classes (clsx + tailwind-merge)
formatCurrency(amount, currency)  // Intl.NumberFormat → "$1,234.56"
formatDate(date)                  // "Feb 24, 2026"
formatDateTime(date)              // "Feb 24, 2026 14:30"
formatRelative(date)              // "2 hours ago"
formatNumber(n)                   // Localized number
formatPercent(value)              // "+1.5%"
```

### Theming

Dark/light mode support via `next-themes`. Theme toggle can be added to `Header`.

---

## Monorepo Integration

The admin panel is part of a Turborepo monorepo. Dependencies:

- `@budget/shared-types` — TypeScript entity and DTO interfaces
- `@budget/shared-utils` — Zod schemas and formatting utilities

Both packages are transpiled by Next.js via `transpilePackages` — no separate build step needed.

When shared packages change (new fields, new types), the admin rebuild is triggered automatically by Turbo.
