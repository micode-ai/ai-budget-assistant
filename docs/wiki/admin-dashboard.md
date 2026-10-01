# Admin Dashboard (Next.js)

*Related: [admin-revenue-metrics](features/admin-revenue-metrics.md),
[app-version-gate](features/app-version-gate.md),
[last-active-tracking](features/last-active-tracking.md), [web-telemetry](features/web-telemetry.md)*

## What this is
An internal web dashboard for operators — user management, AI usage monitoring, subscription and revenue oversight, push/email communications, and app-version releases. A separate Next.js app (`apps/admin`, port 3001) over an admin-only API module (`apps/api/src/modules/admin/`).

## Entry points
- `apps/admin/src/app/` — Next.js 16 App Router pages, one folder per page; the nav list lives in `apps/admin/src/components/layout/`
- `apps/admin/src/hooks/use-*.ts` — one React Query hook module per page
- `apps/admin/src/lib/api-client.ts` — ky-based HTTP client; auto-injects Bearer token, 401 → logout; base URL from `NEXT_PUBLIC_API_URL`
- `apps/admin/src/lib/auth.ts` — login via `POST /auth/login`; tokens stored in localStorage (`admin_token`, `admin_refresh_token`)
- `apps/admin/src/lib/socket.ts` + `src/hooks/use-realtime.ts` — Socket.io client on namespace `/admin` (`NEXT_PUBLIC_SOCKET_URL`)
- API: `apps/api/src/modules/admin/admin.controller.ts`, `admin.guard.ts`, `admin.gateway.ts`, and the four services below

## Key concepts

### API side — the admin module (ABA-175)
Four focused services, each injected directly into `AdminController` (no facade layer):
- `AdminService` — user management, audit log (`logAction`), system health. Injects `PrismaService`, `CacheService`.
- `AdminAnalyticsService` — dashboard KPIs, analytics overview, AI-usage trends, subscription stats. Injects `PrismaService`. Exports `estimateCost()` and the per-feature cost constants, imported by `AdminService.getUserDetail` and by the investor-metrics AI-COGS margin.
- `AdminNotificationService` — push, email and broadcast delivery, the scheduled-notification cron (every minute), notification history. Injects `PrismaService`, `MailService`, `NotificationsService`.
- `AdminInvestorMetricsService` — the investor-metrics endpoint (see [admin-revenue-metrics](features/admin-revenue-metrics.md)).

`AdminController` also injects `ReferralsService` for the referrals page. `AdminGateway` injects `AdminService` + `AdminAnalyticsService`.

**Who is an admin.** `AdminGuard` (HTTP) and `AdminGateway.handleConnection` (socket) both check the caller's email against the `ADMIN_EMAILS` env list — there is no admin role column.

### Pages
Dashboard (`/`), Login (`/login`), Investor Metrics (`/metrics`), Acquisition (`/acquisition`), Users (`/users`, `/users/[id]`), AI Usage (`/ai-usage`), Subscriptions (`/subscriptions`), Communications (`/communications`), App Versions (`/app-versions`), Referrals (`/referrals`), Telemetry (`/telemetry`), Audit Log (`/audit-log`), Settings (`/settings`). `ls apps/admin/src/app` for the current set.

- **Dashboard** — `KpiCards`, `SubscriptionPieChart`, `LiveActivityFeed`, `RegistrationsChart`, `AiCostChart` (all in `src/components/dashboard/`) plus a Top AI Spenders table inline in `app/page.tsx`.
- **Users** — search (debounced 300 ms) and tier / billing / status filters over a paginated table. `SortableHead` makes Name, Email, Registered (`createdAt`) and Last Active (`lastSyncAt`) sortable: clicking toggles asc/desc, switching column resets to asc, and both reset to page 1. `sortBy`/`order` flow through `useUsers` to `GET admin/users`, where `AdminService` allow-lists exactly those four fields (anything else falls back to `createdAt`). Tier, status and AI requests are not sortable — they are relation or computed fields.
- **User detail** — `app/users/[id]/page.tsx` is a thin composition (`useUserDetail`, `useUserNotificationHistory`, profile/subscription/actions cards, accounts table, AI usage chart, recent expenses, notification history). Each user action is its own component under `src/components/users/`, owning its own state and mutation hook: `ChangeTierDialog`, `AiLimitCard` (inline, non-modal), `SendPushDialog`, `SendEmailDialog`, `DeactivateDeleteDialog` (deactivate + delete confirmation, the "danger zone").
- **App Versions** — per-platform tabs (Android / iOS); the newest release per platform carries a "Current" badge; a "New release" `Dialog` with semver inputs and one release-notes textarea per app locale (`LOCALES`, EN required). Clicking a release row opens a read-only detail `Dialog` (versions, store URL, notes per locale); the trash button is separate, with a `Dialog` confirm (there is no `AlertDialog` primitive). Hooks: `src/hooks/use-app-versions.ts`. What the rows mean: [app-version-gate](features/app-version-gate.md).
- **Communications (ABA-420)** — `app/communications/page.tsx` is a thin `Tabs` shell; each tab is its own component under `src/components/communications/` — `SendPushTab`, `SendEmailTab`, `BroadcastTab`, `ScheduledTab`, `HistoryTab` — so each tab's form, filter and pagination state is local to that tab. History has summary stat cards, a type filter (push/email/broadcast), expandable rows with recipient details, body preview, broadcast filters, a delivery-success bar and relative dates.

### Real-time
`AdminGateway` (namespace `/admin`, one admin room) emits `admin:new-user`, `admin:ai-request`, `admin:subscription-change`, `admin:error` and, every 30 s, `admin:stats`. `use-realtime.ts` listens to the first four and feeds the live activity feed.

### Client
React Query 5 for all server state; shadcn/ui components; Recharts for charts.

## Invariants
- **A new per-page action or tab gets its own component**, under `components/users/` or `components/communications/`, not another inline dialog or tab body in the page. Both pages were split precisely because one component tracking every tab's or dialog's state had become the bottleneck.
- **The users sort field is allow-listed server-side.** The value comes from the query string and goes into a Prisma `orderBy`; anything outside the list must fall back, never pass through.
- **The column is "Last Active", not "Last Login"** — `lastSyncAt` is stamped on every authenticated request ([last-active-tracking](features/last-active-tracking.md)).

## Known gaps
- `emitSubscriptionChange` and `emitError` have no callers outside the gateway, so those two live-feed event types never fire; only `admin:new-user` (auth) and `admin:ai-request` (`AiUsageGuard`) do.
- `admin:stats` is emitted every 30 s but `use-realtime.ts` does not listen to it — the cron runs `getSystemHealth` + `getAnalyticsOverview` for nobody.

## Cross-references
- Talks to: `api` — all data comes through the NestJS API; admin-only endpoints are behind `JwtAuthGuard` + `AdminGuard`
- Uses: `shared-types` indirectly via API response shapes

## Where to look first
Start at `apps/admin/src/app/<page>/page.tsx` for any page-level change, and `apps/admin/src/lib/api-client.ts` for auth or HTTP issues.

## History
ABA-175 (admin service split) · ABA-202 (sortable users table, app-version detail dialog) · ABA-389 ("Last Active") · ABA-420 (communications tab split).
