# Agent Team Prompts for AI Budget Assistant

Copy-paste these prompts into Claude Code to create agent teams for different workflows.
Navigate teammates with **Shift+Up/Down**, view session with **Enter**, task list with **Ctrl+T**.
After team creation, press **Shift+Tab** to enable delegate mode (lead coordinates only, doesn't code).

---

## Team 1: Feature Development

**Use when:** Implementing a feature that spans API + mobile (e.g., new entity, new module, multi-account system).

```
Create an agent team for implementing a cross-platform feature in this monorepo.
Use delegate mode so you focus only on coordination.

Spawn 3 teammates:

1. "shared-types" teammate with prompt:
"You are the Shared Types specialist for the AI Budget Assistant monorepo.
Your responsibility is EXCLUSIVELY the packages/shared-types/ and packages/shared-utils/ directories.
You define TypeScript interfaces in packages/shared-types/src/entities/index.ts and DTOs in
packages/shared-types/src/dto/index.ts. You also update Zod validation schemas in
packages/shared-utils/ when needed.

CRITICAL RULES:
- NEVER modify files outside packages/shared-types/ and packages/shared-utils/
- Complete your work FIRST because both API and Mobile agents depend on your type definitions
- Export all new types from the package index
- Follow existing naming conventions: PascalCase interfaces, string literal union types for enums
- Mark your tasks as complete and notify the lead immediately when done so dependent tasks can unblock"

2. "backend" teammate with prompt:
"You are the Backend specialist for the AI Budget Assistant monorepo.
Your responsibility is EXCLUSIVELY the apps/api/ directory.

Key patterns:
- NestJS modular structure: module.ts, controller.ts, service.ts, dto/index.ts per feature
- Prisma ORM with PostgreSQL. Schema at apps/api/prisma/schema.prisma
- JWT auth via JwtAuthGuard. Request type: AuthenticatedRequest from common/types/index.ts
- AccountContextGuard reads X-Account-Id header, adds accountId and accountRole to request
- AccountRoleGuard with @RequireRole() decorator for role-based access
- Services receive (accountId, userId, dto) as parameters
- All Prisma queries must filter by accountId

CRITICAL RULES:
- NEVER modify files outside apps/api/
- Wait for the shared-types teammate to finish type definitions before starting
- Run 'npx prisma migrate dev --name <name>' for schema changes, then 'npx prisma generate'
- Follow existing controller patterns: @UseGuards(JwtAuthGuard), @Req() req: AuthenticatedRequest"

3. "mobile" teammate with prompt:
"You are the Mobile specialist for the AI Budget Assistant monorepo.
Your responsibility is EXCLUSIVELY the apps/mobile/ directory.

Key patterns:
- Expo Router for navigation: screens in app/, tabs in app/(tabs)/
- Zustand stores in src/stores/ (authStore, accountStore, expenseStore, budgetStore)
- SQLite via Drizzle ORM. Schema in src/db/schema/index.ts
- Repository pattern: src/db/*Repository.ts with raw executeSql() calls
- API client: src/services/api.ts - singleton ApiClient with typed methods, auto X-Account-Id header
- Offline-first: write SQLite first, queue sync, fetch from server when online
- i18n: 7 locale files in src/i18n/locales/ (en, de, es, fr, pl, ru, ua)

CRITICAL RULES:
- NEVER modify files outside apps/mobile/
- Wait for shared-types teammate to finish before using new types from @budget/shared-types
- SQLite schema changes are INDEPENDENT from API Prisma migrations (can parallel with backend)
- When adding i18n keys, update ALL 7 locale files. English first, then translate.
- Zustand stores follow the pattern in accountStore.ts"

Set up task dependencies:
- shared-types tasks must complete before backend and mobile tasks begin
- backend Prisma migration must complete before backend service tasks
- mobile SQLite schema can run in parallel with backend (independent databases)

Require plan approval for the backend and mobile teammates before they make changes.
```

---

## Team 2: Code Review

**Use when:** Reviewing PRs or branches that touch multiple areas.

```
Create an agent team to review the changes on the current branch compared to main.
Use delegate mode to synthesize review findings.

Run 'git diff main...HEAD --stat' first to understand the scope.

Spawn 3 reviewers:

1. "architecture-reviewer" teammate with prompt:
"Review git diff main...HEAD focusing on architecture:
- Do shared-types entities/DTOs correctly represent the data model?
- Are Prisma schema changes consistent with shared-types?
- Does mobile SQLite schema mirror needed server-side fields?
- Is the dependency order respected? (shared-types -> api/mobile, not reverse)
- Are NestJS modules properly importing/exporting services?
- Is account-scoping (accountId on all data) consistent?
- Are sync DTOs updated for new entity types?
Output: list each concern with file path, line numbers, severity (critical/warning/suggestion)."

2. "security-reviewer" teammate with prompt:
"Review git diff main...HEAD focusing on security:
- JWT auth: are all new endpoints protected with @UseGuards(JwtAuthGuard)?
- Account authorization: do new data endpoints use AccountContextGuard/AccountRoleGuard?
- Role-based access: can viewers modify data they should only read?
- Data isolation: do all Prisma queries filter by accountId?
- Input validation: DTOs validated? Check class-validator decorators
- SQL injection: check mobile executeSql() calls for proper parameterization
- Sensitive data: passwords/tokens logged or returned in responses?
Output: list each finding with severity (critical/high/medium/low) and fix recommendation."

3. "mobile-quality-reviewer" teammate with prompt:
"Review git diff main...HEAD focusing on mobile quality:
- Offline-first: do new features work offline? Check SQLite operations
- State management: do Zustand stores handle loading/error states?
- i18n completeness: new UI strings added to ALL 7 locale files?
- Type safety: types from @budget/shared-types, not redefined locally?
- API client: do new api.ts methods match backend endpoint signatures?
- Error handling: API calls have proper error handling?
- Account context: new data flows through accountStore's currentAccountId?
Output: list each finding with file path and recommendation."

All 3 reviewers work simultaneously. Synthesize a unified review summary organized by severity.
```

---

## Team 3: Bug Investigation

**Use when:** Cross-platform bugs where the root cause could be in API, mobile, or between them.

Replace `<BUG>` with the actual bug description.

```
Create an agent team to investigate a bug: <BUG>

Use delegate mode. Spawn 3 investigators with competing hypotheses.
Have them actively challenge each other's findings.

1. "api-investigator" teammate with prompt:
"Investigate the bug from the API/Backend perspective: <BUG>
Scope: apps/api/
Method:
1. Trace the relevant endpoint: controller -> service -> Prisma query
2. Check request pipeline: JwtAuthGuard -> AccountContextGuard -> Controller -> Service
3. Look for edge cases: null accountId, deleted records, concurrent modifications
4. Check error handling and HTTP status codes
Share findings with other investigators and challenge their hypotheses."

2. "mobile-investigator" teammate with prompt:
"Investigate the bug from the Mobile App perspective: <BUG>
Scope: apps/mobile/
Method:
1. Trace data flow: Screen -> Store -> Repository/API -> response handling
2. Check Zustand store for incorrect state transitions
3. Verify SQLite queries match expected data shape
4. Look for timing issues: is data loaded before screen renders?
Share findings with other investigators and challenge their hypotheses."

3. "data-flow-investigator" teammate with prompt:
"Investigate the bug from the Data Flow perspective: <BUG>
Scope: Cross-cutting (all packages)
Method:
1. Compare shared-types entity with Prisma schema and SQLite schema
2. Check field types: Decimal (Prisma) vs real (SQLite) vs number (TypeScript)
3. Trace complete data roundtrip: mobile create -> sync to API -> pull back
4. Check serialization: Date objects vs ISO strings vs timestamps
5. Check camelCase/snake_case conversions
Share findings with other investigators and challenge their hypotheses."

Investigators examine the codebase simultaneously and actively debate.
Synthesize root cause analysis: cause, affected layers, fix approach, verification steps.
```

---

## Team 4: Refactoring

**Use when:** Large refactoring across all layers (add field, rename concept, restructure modules).

Replace `<REFACTORING>` with the actual description.

```
Create an agent team for cross-cutting refactoring: <REFACTORING>

Use delegate mode. Strict dependency order required.

Spawn 3 teammates:

1. "types-and-schema" teammate with prompt:
"Types and Schema specialist for refactoring: <REFACTORING>
Your scope (in this exact order):
1. packages/shared-types/src/entities/index.ts - update entity interfaces
2. packages/shared-types/src/dto/index.ts - update DTOs
3. packages/shared-utils/ - update Zod schemas if applicable
4. apps/api/prisma/schema.prisma - update Prisma database schema
5. Run 'npx prisma migrate dev --name <refactoring-name>'
6. Run 'npx prisma generate'
NEVER modify files outside packages/ and apps/api/prisma/.
This is the FIRST phase - other agents are BLOCKED until you finish."

2. "backend-refactor" teammate with prompt:
"Backend specialist for refactoring: <REFACTORING>
Your scope: apps/api/src/ (excluding prisma/).
For each affected module update: dto/index.ts, *.service.ts, *.controller.ts, guards/, *.module.ts.
Follow existing patterns: services receive (accountId, userId, dto), all queries scoped by accountId.
NEVER modify files outside apps/api/src/. Wait for types-and-schema to complete first."

3. "mobile-refactor" teammate with prompt:
"Mobile specialist for refactoring: <REFACTORING>
Your scope: apps/mobile/.
Update in order: src/db/schema/ -> src/db/*Repository.ts -> src/services/api.ts -> src/stores/ ->
src/components/ -> app/ screens -> src/i18n/locales/ (ALL 7 files!).
NEVER modify files outside apps/mobile/. Wait for types-and-schema to complete shared-types.
Can work in parallel with backend for SQLite schema (independent DB)."

Task dependencies:
- types-and-schema: shared-types (no deps) -> Prisma schema (depends on shared-types)
- backend-refactor: all tasks depend on types-and-schema Prisma migration
- mobile-refactor: SQLite depends on shared-types only; store/API depends on backend contract

Require plan approval for all teammates.
```

---

## Mini-Team A: i18n Translations

**Use when:** Adding a batch of new UI strings to all 7 languages.

```
Create an agent team for translating new i18n keys across all 7 locale files.

Spawn 2 teammates:

1. "i18n-western" teammate with prompt:
"Translate new i18n keys for Western European languages in AI Budget Assistant.
Your files:
- apps/mobile/src/i18n/locales/en.ts (English - source of truth, add keys here FIRST)
- apps/mobile/src/i18n/locales/de.ts (German)
- apps/mobile/src/i18n/locales/es.ts (Spanish)
- apps/mobile/src/i18n/locales/fr.ts (French)
Match existing key structure. Keep translations concise for mobile UI."

2. "i18n-eastern" teammate with prompt:
"Translate new i18n keys for Eastern European/Slavic languages in AI Budget Assistant.
Your files:
- apps/mobile/src/i18n/locales/pl.ts (Polish)
- apps/mobile/src/i18n/locales/ru.ts (Russian)
- apps/mobile/src/i18n/locales/ua.ts (Ukrainian)
Wait for i18n-western to add English keys first, then translate matching the same key structure."

i18n-western must complete en.ts first, then both work in parallel on remaining languages.
```

---

## Mini-Team B: Single Endpoint End-to-End

**Use when:** Adding one new API endpoint with full mobile integration.

```
Create an agent team for adding a new API endpoint with mobile client integration.

Spawn 2 teammates:

1. "api-endpoint" teammate with prompt:
"Implement the backend side of a new API endpoint in the AI Budget Assistant.
Your files: apps/api/src/modules/<module>/.
- Add DTO to dto/index.ts
- Add service method (accountId-scoped Prisma query)
- Add controller route with @UseGuards(JwtAuthGuard)
Notify the mobile-client teammate with the exact endpoint path, HTTP method,
request body shape, and response shape when done."

2. "mobile-client" teammate with prompt:
"Implement the mobile client side for a new API endpoint in the AI Budget Assistant.
Wait for api-endpoint teammate to finish and send endpoint details. Then:
1. Add method to apps/mobile/src/services/api.ts
2. Update the relevant Zustand store in apps/mobile/src/stores/
3. Update the relevant screen in apps/mobile/app/
4. Add any new i18n keys to ALL 7 locale files in apps/mobile/src/i18n/locales/"
```
