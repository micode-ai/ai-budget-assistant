# Contributing

AI Budget Assistant is a Turborepo monorepo: a NestJS API, an Expo (iOS / Android / web)
app, a Next.js admin dashboard, and two shared packages. `CLAUDE.md` is the long-form map
of how every feature actually works — read the section for the area you are touching
before you change it. This file is the short version: how to get running, and the
conventions that will get a change sent back if you miss them.

## Getting started

```bash
npm install                 # installs every workspace
npm run dev                 # all dev servers (turbo)
npm run typecheck           # TypeScript across all packages
npm run test                # Jest across all packages
npm run lint
```

Per app:

```bash
cd apps/api    && npx prisma generate && npm run start:dev
cd apps/mobile && npx expo start          # or: npm run dev:web from the repo root
cd apps/admin  && npm run dev             # port 3001
```

Copy `.env.example` to `.env` and fill it in. The API needs PostgreSQL and Redis; most AI
features need `OPENAI_API_KEY`. Anything unset degrades to a no-op rather than crashing —
keep it that way when you add an integration.

## Order of work for a cross-package change

Changing one feature usually touches several packages. Do it in this order, or the types
you are coding against will not exist yet:

1. `packages/shared-types` — entities and DTOs
2. `packages/shared-utils` — Zod schemas, formatting
3. `apps/api/prisma/schema.prisma`, then `npx prisma migrate dev --name <name>` + `npx prisma generate`
4. `apps/api/src/modules/*` — service, controller, guards
5. `apps/mobile/src/db/` — SQLite schema and repositories (independent of step 3; can run in parallel)
6. `apps/mobile/src/stores/`, then `src/services/*.api.ts`, then `app/` screens
7. `apps/mobile/src/i18n/locales/*.ts` — **all 9 files**

## Conventions that are not negotiable

**Every account-scoped query filters by `accountId`.** Service methods take
`(accountId, userId, dto)`. The account comes from the `X-Account-Id` header via
`AccountContextGuard`, never from the request body.

**Every write endpoint gets `ViewerBlockGuard`.** A viewer must not be able to POST,
PATCH, PUT or DELETE. Reads stay open to viewers.

**Declare static routes before parameterised ones.** Express matches in declaration
order, so `@Patch('bulk')` after `@Patch(':id')` silently becomes `id = "bulk"` and the
endpoint no-ops instead of erroring.

**Resolve a client id to the server primary key, then use the resolved value.** The
mobile app addresses rows by its own local id until the first sync round-trip, so
endpoints resolve `OR: [{ id }, { clientId }]`. Having done that, pass `existing.id` into
the following Prisma `where` — not the raw route param, and not the raw param into a child
table keyed by the parent's primary key. This has been the root cause of several
silent-no-op bugs; it is the easiest mistake to make in this codebase.

**Creates must be idempotent, and a unique-constraint catch belongs outside the
transaction.** The client resends the same create after a retry or a lost response.
Pre-check the unique key, and catch `P2002` *outside* any `$transaction` — Postgres aborts
the whole transaction on the first violation, so catching it inside and carrying on
poisons every later statement in that transaction.

**The API must not import `@budget/shared-utils` at runtime.** There is no build step for
workspace packages in the API, so a runtime import crash-loops production. A pre-deploy
guard (`scripts/check-no-shared-utils-runtime-import.sh`) and an ESLint rule both enforce
it. `import type` is fine. When the API and the app genuinely need the same pure function,
copy it into `apps/api/src/common/utils/` and keep a mirror in `packages/shared-utils/` —
a deliberately duplicated pair, documented as such at the top of both files (see
`financial-month.ts`, `wallet-currencies.ts`). Change one, change the other.

**i18n covers all 9 locales** (`en, de, es, fr, pl, ru, ua, be, nl`). A key that exists in
`en.ts` only is an incomplete change. Translate into the language's real orthography —
never an ASCII transliteration, and never a calque of the English idiom.

**Never hand-edit `apps/mobile/src/help/content.ts`.** It is generated. Write the markdown
in `user_docs/<lang>/NN-slug.md` for all 9 languages, register the section id in **three**
places — `scripts/generate-help-content.js`, `apps/mobile/src/help/sections.ts`, and
`docs/marketing/help/build_help.py` — then run `npm run generate:help`. Miss the third and
the public web help silently omits the section.

**Money is per-currency until it is explicitly converted.** Do not sum amounts of
different currencies. When a figure is user-facing, take the display currency from the
caller (`req.user.currencyCode`) — never infer it from whichever row happens to be first.
Convert through `common/utils/fx.ts`, exclude amounts whose rate is unknown, and flag the
result approximate rather than quietly mislabelling it.

**Dates that mean a calendar day never go through `toISOString()`.** That routes via UTC
and shifts the day for any non-zero offset. On mobile, date fields go through
`src/components/DatePicker.tsx` — importing `@react-native-community/datetimepicker`
directly is the bug, since it has no web implementation and renders nothing at all.

**Mobile writes go to SQLite first.** A failed server push while offline is an expected
outcome: log it with `console.warn`, never `console.error` (a `console.error` renders as a
full-screen red overlay in dev and reads as a crash). Reserve `console.error` for a genuine
local-database failure.

**Migrations are authored without a local database.** There is no local Postgres in this
workflow; migrations run against production from the deploy pipeline. Write the SQL by hand
(or with `prisma migrate diff`), and for a data migration make it re-runnable and
non-destructive — `NOT EXISTS` rather than blind inserts, and never resurrect a row a user
soft-deleted on purpose.

## Tests

Jest, with specs next to the code (`foo.service.spec.ts`, or `__tests__/` in the mobile
app). Write the test first and watch it fail: a test written after the code passes
immediately, which proves nothing about whether it can catch the bug.

Pure logic belongs in a pure, separately tested function — the pattern throughout this repo
is a thin IO service over a `*.util.ts` that holds the arithmetic and the rules. Assert on
real behaviour rather than on what a mock was called with, wherever the two differ.

Before claiming a change is done, run these and read the output:

```bash
cd apps/api    && npx tsc --noEmit && npx jest <paths>
cd apps/mobile && npx tsc --noEmit && npx jest
```

## Commits and pull requests

- Branch off `development`. `main` is the release branch.
- Open a GitHub issue titled `ABA-<N> <summary>` (no colon after the number) and use the
  same `ABA-<N> <summary>` as the commit subject. `<N>` is one past the highest `ABA-`
  number in existing issue titles — search with `--state all`, closed included.
- **Everything in GitHub is written in English** — issues, PR bodies, commit messages, code
  comments — regardless of the language the work was discussed in.
- Explain *why* in the commit body, and name the failure mode a fix prevents. The commit
  log is the only place that context survives.
- Finish a change by updating `CLAUDE.md`, and `user_docs/` when user-visible behaviour
  changed, so the next person reads an accurate map.
- Never `--no-verify`, and never skip commit signing. If a hook fails, fix the cause.

## Releases (Android)

The version Google Play shows comes from `versionName` in
`apps/mobile/android/app/build.gradle` — this is a bare Expo workflow, so `app.json` is not
read for it. Bump both to the same value and let EAS own the integer `versionCode`; a CI
guard fails the production build if the two disagree. After a release, add the version in
**admin → App Versions** so the in-app update prompt knows about it.

## Generated files

`apps/mobile/src/help/content.ts`, the static sites under `docs/marketing/*/site/`, and
`apps/mobile/src/components/map/mapHtml.generated.ts` are build outputs. Change the source
and re-run the generator; do not edit the output by hand, and do not commit an output whose
source you did not change.
