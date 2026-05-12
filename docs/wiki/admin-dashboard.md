# Admin Dashboard (Next.js)

## What this is
An internal web dashboard for operators — user management, AI usage monitoring, subscription oversight, push/email communications, and app-version releases. Runs on port 3001.

## Entry points
- `apps/admin/src/app/` — Next.js 16 App Router pages
- `apps/admin/src/lib/api-client.ts` — ky-based HTTP client; auto-injects Bearer token, 401 → logout; base URL from `NEXT_PUBLIC_API_URL`
- `apps/admin/src/lib/auth.ts` — login via `POST /auth/login`; tokens stored in localStorage (`admin_token`, `admin_refresh_token`)
- `apps/admin/src/lib/socket.ts` — Socket.io client on namespace `/admin`; events: `new_user`, `ai_request`, `error`, `subscription_change`

## Key concepts
- **Pages** — Dashboard (`/`), Login (`/login`), Users (`/users`, `/users/[id]`), AI Usage (`/ai-usage`), Subscriptions (`/subscriptions`), Communications (`/communications`), App Versions (`/app-versions`), Audit Log (`/audit-log`), Settings (`/settings`)
- **Data fetching** — React Query 5 for all server state; no custom fetch wrappers beyond `api-client.ts`
- **Real-time** — Socket.io client streams live activity to the dashboard feed and KPI cards
- **App Versions page** — per-platform tabs (Android / iOS); "New release" dialog with semver inputs and 8-locale release-notes textareas; EN release notes are required; delete via `Dialog` (no `AlertDialog` primitive)
- **Communications page** — 5 tabs: Send Push, Send Email, Broadcast, Scheduled, History; History shows expandable rows with delivery success bar
- **Charts** — Recharts; subscription distribution pie, registration trends, AI cost by feature
- **UI components** — shadcn/ui component library

## Cross-references
- Talks to: `api` — all data comes through the NestJS API; admin-only endpoints are behind `AdminGuard`
- Uses: `shared-types` indirectly via API response shapes

## Where to look first
Start at `apps/admin/src/app/<page>/page.tsx` for any page-level change, and `apps/admin/src/lib/api-client.ts` for auth or HTTP issues.
