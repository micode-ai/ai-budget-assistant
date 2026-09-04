# Web Product Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the signed-in web funnel visible — which screens a web user sees and where a key flow is abandoned — using first-party events stored in our own database.

**Architecture:** A web-only client buffers allow-listed events and flushes them with `fetch(..., { keepalive: true })` to `POST /telemetry/events`. The API validates every event against a server-side allow-list, drops anything else, stamps `userId` from the JWT and writes one row per event. A daily cron prunes rows older than 90 days. The admin reads a funnel from those rows. The native client is a no-op platform file, so the mobile app is bit-for-bit unaffected.

**Tech Stack:** NestJS 10 + Prisma 5 + PostgreSQL (API), Expo 54 / React Native 0.81 with Metro platform extensions (client), Next.js 16 + React Query (admin), Jest.

**Spec:** `docs/superpowers/specs/2026-09-04-web-telemetry-design.md`

## Global Constraints

- **Mobile must not be touched.** No new dependency, no native config change, no Play Data safety change, no bytes added to the AAB. Enforced by the platform split: `telemetry.ts` (native) is a no-op, `telemetry.web.ts` is the implementation.
- **Naming is `telemetry`, never `analytics`** — `src/features/analytics/` is the user-facing spending analytics and the admin already has an "Analytics" page about AI usage.
- **No money and no free text ever leaves the client.** Event names, prop keys and prop values are allow-listed **server-side**; anything else is dropped.
- **`screen` is validated by shape, not by an enumerated list of routes**: reject a value containing `?` or any path segment that looks like an id (UUID, hex run of 13+, all digits).
- **`userId` comes from the JWT, never from the payload.**
- **Telemetry may never degrade the product.** Every exported client function returns `void`, never throws, swallows failures, and never retries a failed flush.
- **`@Throttle` alone is inert in this app** (no global `ThrottlerGuard`); it must be paired with `@UseGuards(ThrottlerGuard)`.
- The API must never `import` a **runtime** value from `@budget/shared-types` / `@budget/shared-utils` — `import type` only (the deploy guard `scripts/check-no-shared-utils-runtime-import.sh` fails the deploy otherwise).
- Prisma migrations are authored **without a local database**, via `prisma migrate diff` against the previous schema.

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/modules/telemetry/telemetry.validator.ts` | Pure allow-list. The privacy boundary. |
| `apps/api/src/modules/telemetry/dto/index.ts` | Envelope validation (platform, sessionId, batch cap). |
| `apps/api/src/modules/telemetry/telemetry.service.ts` | Ingest write + funnel read. |
| `apps/api/src/modules/telemetry/telemetry.controller.ts` | `POST /telemetry/events`, user-facing guards. |
| `apps/api/src/modules/telemetry/telemetry-admin.controller.ts` | `GET /admin/telemetry/funnel`, admin guards. Separate file so a user-facing route can never inherit an admin guard or quietly lose one. |
| `apps/api/src/modules/telemetry/telemetry-cleanup.cron.ts` | 90-day retention. |
| `packages/shared-types/src/dto/telemetry.ts` | Request/response contracts shared with the admin. |
| `apps/mobile/src/services/telemetry.types.ts` | Platform-free flow/status unions — the one declaration site both platform files import. |
| `apps/mobile/src/services/telemetry.ts` | Native no-op. |
| `apps/mobile/src/services/telemetry.web.ts` | Web buffer + keepalive flush. |
| `apps/mobile/src/hooks/useTelemetryScreenViews.{ts,web.ts}` | Screen views; native is an empty function. |
| `apps/admin/src/hooks/use-telemetry-funnel.ts` | React Query hook. |
| `apps/admin/src/app/telemetry/page.tsx` | The funnel page. |

---

### Task 0: Claim the issue number — DONE (controller, 2026-09-04)

`ABA-497`, claimed against `gh issue list --state all` (highest in a title was
ABA-496, issue #501) and `git log`. Every commit message below already carries
it. The GitHub **issue itself** is created at the end (Task 9), per this repo's
convention that the issue describes finished work.

Note for whoever reads the issue list later: ABA-492 was used twice (#496 and
#497) by two sessions running at once. That is why this number is claimed up
front rather than at the end.

---

### Task 1: The validator (the privacy boundary)

Pure, no dependencies, and the only thing standing between a call site and a money amount in the database. It is first because every later task depends on its types.

**Files:**
- Create: `apps/api/src/modules/telemetry/telemetry.validator.ts`
- Test: `apps/api/src/modules/telemetry/telemetry.validator.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type TelemetryEventName = 'session_start' | 'screen_view' | 'action'`
  - `interface CleanEvent { name: TelemetryEventName; screen: string | null; props: Record<string, string | number> | null }`
  - `function sanitizeEvents(raw: unknown): CleanEvent[]`
  - `function isSafeScreen(value: unknown): value is string`
  - `const MAX_EVENTS_PER_BATCH = 40`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/telemetry/telemetry.validator.spec.ts
import { sanitizeEvents, isSafeScreen, MAX_EVENTS_PER_BATCH } from './telemetry.validator';

describe('isSafeScreen', () => {
  it('accepts a route pattern, including a dynamic segment and a group', () => {
    expect(isSafeScreen('expense/new')).toBe(true);
    expect(isSafeScreen('expense/[id]')).toBe(true);
    expect(isSafeScreen('(tabs)/index')).toBe(true);
  });

  it('rejects a resolved id, which is the leak this rule exists for', () => {
    expect(isSafeScreen('/expense/8f3c1d2e-4a5b-6c7d-8e9f-0a1b2c3d4e5f')).toBe(false);
    expect(isSafeScreen('expense/8f3c1d2e4a5b6')).toBe(false);
    expect(isSafeScreen('expense/12345')).toBe(false);
  });

  it('rejects a query string and anything over-long or oddly punctuated', () => {
    expect(isSafeScreen('expense/new?amount=42.50')).toBe(false);
    expect(isSafeScreen('expense/new;drop')).toBe(false);
    expect(isSafeScreen('a'.repeat(121))).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(isSafeScreen(42)).toBe(false);
    expect(isSafeScreen(null)).toBe(false);
  });
});

describe('sanitizeEvents', () => {
  it('keeps a well-formed event of each allowed name', () => {
    const out = sanitizeEvents([
      { name: 'session_start' },
      { name: 'screen_view', screen: 'expense/new' },
      { name: 'action', props: { flow: 'expense_manual', status: 'completed', ms: 1200 } },
    ]);

    expect(out).toEqual([
      { name: 'session_start', screen: null, props: null },
      { name: 'screen_view', screen: 'expense/new', props: null },
      { name: 'action', screen: null, props: { flow: 'expense_manual', status: 'completed', ms: 1200 } },
    ]);
  });

  it('drops an event name nobody allow-listed', () => {
    expect(sanitizeEvents([{ name: 'expense_amount' }])).toEqual([]);
  });

  it('drops an unknown prop key rather than the whole event', () => {
    const out = sanitizeEvents([
      { name: 'action', props: { flow: 'expense_manual', status: 'completed', amount: 42.5 } },
    ]);

    expect(out[0].props).toEqual({ flow: 'expense_manual', status: 'completed' });
  });

  it('drops an allow-listed key whose value is not one of its enumerated values', () => {
    const out = sanitizeEvents([
      { name: 'action', props: { flow: 'buying_a_boat', status: 'completed' } },
    ]);

    expect(out[0].props).toEqual({ status: 'completed' });
  });

  it('drops a non-finite duration', () => {
    const out = sanitizeEvents([
      { name: 'action', props: { flow: 'expense_manual', status: 'failed', ms: Number.NaN } },
    ]);

    expect(out[0].props).toEqual({ flow: 'expense_manual', status: 'failed' });
  });

  it('drops a screen that fails the shape rule but keeps the event', () => {
    const out = sanitizeEvents([{ name: 'screen_view', screen: '/expense/12345' }]);

    expect(out).toEqual([{ name: 'screen_view', screen: null, props: null }]);
  });

  it('one bad event does not cost the good ones in the same batch', () => {
    const out = sanitizeEvents([
      { name: 'screen_view', screen: 'expense/new' },
      { name: 'nonsense' },
      { name: 'session_start' },
    ]);

    expect(out.map((e) => e.name)).toEqual(['screen_view', 'session_start']);
  });

  it('ignores a payload-supplied userId completely', () => {
    const out = sanitizeEvents([{ name: 'session_start', userId: 'someone-else' }]);

    expect(out[0]).not.toHaveProperty('userId');
  });

  it('caps the batch', () => {
    const many = Array.from({ length: MAX_EVENTS_PER_BATCH + 5 }, () => ({ name: 'session_start' }));

    expect(sanitizeEvents(many)).toHaveLength(MAX_EVENTS_PER_BATCH);
  });

  it('returns an empty list for anything that is not an array', () => {
    expect(sanitizeEvents(null)).toEqual([]);
    expect(sanitizeEvents({ name: 'session_start' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

Run: `cd apps/api && npx jest src/modules/telemetry/telemetry.validator -t "accepts a route pattern"`
Expected: the suite fails to run — `Cannot find module './telemetry.validator'`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/modules/telemetry/telemetry.validator.ts

/**
 * The privacy boundary. Everything a client sends passes through here, and
 * anything not explicitly allowed is DROPPED rather than rejected: one unknown
 * event name must not cost the other events in the same batch, and a client that
 * is a version behind must not have its whole batch fail.
 *
 * This is the reason a money-handling app can carry client telemetry at all —
 * an amount has nowhere to land, rather than merely being something we agreed
 * not to send.
 */

export type TelemetryEventName = 'session_start' | 'screen_view' | 'action';

export interface CleanEvent {
  name: TelemetryEventName;
  screen: string | null;
  props: Record<string, string | number> | null;
}

export const MAX_EVENTS_PER_BATCH = 40;

const EVENT_NAMES: ReadonlySet<string> = new Set<TelemetryEventName>([
  'session_start',
  'screen_view',
  'action',
]);

/** Allow-listed prop keys and, for string keys, their enumerated values. */
const STRING_PROPS: Record<string, ReadonlySet<string>> = {
  flow: new Set([
    'expense_manual',
    'expense_voice',
    'expense_receipt',
    'income_manual',
    'import_bank',
    'budget_create',
    'chat_message',
    'rate_alert_create',
  ]),
  status: new Set(['started', 'completed', 'failed', 'abandoned']),
};
const NUMBER_PROPS: ReadonlySet<string> = new Set(['ms']);

const SCREEN_MAX_LEN = 120;
// Route patterns only: letters, digits, / _ - . and the [] () of expo-router.
const SCREEN_ALLOWED = /^[A-Za-z0-9/_\-.[\]()]+$/;
// A segment that looks like a resolved identifier rather than a route pattern.
const SEGMENT_LOOKS_LIKE_ID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{13,}|\d+)$/i;

export function isSafeScreen(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > SCREEN_MAX_LEN) return false;
  if (!SCREEN_ALLOWED.test(value)) return false;
  return !value
    .split('/')
    .some((segment) => segment.length > 0 && SEGMENT_LOOKS_LIKE_ID.test(segment));
}

function sanitizeProps(raw: unknown): Record<string, string | number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const allowedStrings = Object.prototype.hasOwnProperty.call(STRING_PROPS, key)
      ? STRING_PROPS[key]
      : undefined;
    if (allowedStrings) {
      if (typeof value === 'string' && allowedStrings.has(value)) out[key] = value;
      continue;
    }
    if (NUMBER_PROPS.has(key) && typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function sanitizeEvents(raw: unknown): CleanEvent[] {
  if (!Array.isArray(raw)) return [];
  const clean: CleanEvent[] = [];
  for (const entry of raw) {
    if (clean.length >= MAX_EVENTS_PER_BATCH) break;
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.name !== 'string' || !EVENT_NAMES.has(candidate.name)) continue;
    clean.push({
      name: candidate.name as TelemetryEventName,
      screen: isSafeScreen(candidate.screen) ? candidate.screen : null,
      props: sanitizeProps(candidate.props),
    });
  }
  return clean;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/api && npx jest src/modules/telemetry/telemetry.validator`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/telemetry/telemetry.validator.ts apps/api/src/modules/telemetry/telemetry.validator.spec.ts
git commit -m "ABA-497 Add the telemetry event validator"
```

---

### Task 2: Table, migration, ingest service and endpoint

One task because the migration, the service and the controller are worthless apart — a reviewer either accepts "events can be ingested" or rejects it.

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (new `TelemetryEvent` model + a `telemetryEvents` back-relation on `User`)
- Create: `apps/api/prisma/migrations/20260904120000_add_telemetry_events/migration.sql`
- Create: `apps/api/src/modules/telemetry/dto/index.ts`
- Create: `apps/api/src/modules/telemetry/telemetry.service.ts`
- Create: `apps/api/src/modules/telemetry/telemetry.controller.ts`
- Create: `apps/api/src/modules/telemetry/telemetry.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `TelemetryModule`)
- Create: `packages/shared-types/src/dto/telemetry.ts`
- Modify: `packages/shared-types/src/dto/index.ts` (re-export)
- Test: `apps/api/src/modules/telemetry/telemetry.service.spec.ts`
- Test: `apps/api/src/modules/telemetry/telemetry.controller.spec.ts`

**Interfaces:**
- Consumes: `sanitizeEvents`, `MAX_EVENTS_PER_BATCH` from Task 1.
- Produces:
  - `class TelemetryService { ingest(userId: string, dto: IngestTelemetryDto): Promise<{ accepted: number }> }`
  - `class IngestTelemetryDto { platform: string; sessionId: string; events: unknown[] }`
  - shared type `IngestTelemetryRequest { platform: 'web'; sessionId: string; events: TelemetryEventPayload[] }`

- [ ] **Step 1: Add the Prisma model**

Append to `apps/api/prisma/schema.prisma`:

```prisma
model TelemetryEvent {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  name      String
  screen    String?
  platform  String
  sessionId String   @map("session_id")
  props     Json?
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([createdAt])
  @@index([name, createdAt])
  @@index([userId, sessionId])
  @@map("telemetry_events")
}
```

And add this line to the `model User` relation block, beside the other `[]` relations:

```prisma
  telemetryEvents TelemetryEvent[]
```

`onDelete: Cascade` is load-bearing: deleting an account must take its telemetry with it, or we keep behavioural rows about a user who asked to be forgotten.

- [ ] **Step 2: Generate the migration without a database**

There is no local Postgres in this repo; migrations run against prod through the deploy `migrator`. Diff the committed schema against the working one:

```bash
cd apps/api
git show HEAD:apps/api/prisma/schema.prisma > /tmp/schema-before.prisma
mkdir -p prisma/migrations/20260904120000_add_telemetry_events
npx prisma migrate diff \
  --from-schema-datamodel /tmp/schema-before.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20260904120000_add_telemetry_events/migration.sql
cat prisma/migrations/20260904120000_add_telemetry_events/migration.sql
```

Expected: a `CREATE TABLE "telemetry_events"`, three `CREATE INDEX`, and one `ALTER TABLE … ADD CONSTRAINT … ON DELETE CASCADE`. **Read it** — if it contains a `DROP` of anything, the `--from` schema was wrong; stop and re-derive it.

- [ ] **Step 3: Regenerate the Prisma client**

Run: `cd apps/api && npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 4: Write the shared DTO types**

```typescript
// packages/shared-types/src/dto/telemetry.ts

/** A single client-emitted event. Every field is advisory: the server
 * allow-lists names, prop keys and prop values, and drops the rest. */
export interface TelemetryEventPayload {
  name: 'session_start' | 'screen_view' | 'action';
  screen?: string;
  props?: Record<string, string | number>;
  /** Client clock, advisory only — reporting uses the server's createdAt. */
  ts?: number;
}

export interface IngestTelemetryRequest {
  platform: 'web';
  /** Random per app load, memory only — no cross-session identifier exists. */
  sessionId: string;
  events: TelemetryEventPayload[];
}
```

Add to `packages/shared-types/src/dto/index.ts`:

```typescript
export * from './telemetry';
```

- [ ] **Step 5: Write the failing service and controller tests**

```typescript
// apps/api/src/modules/telemetry/telemetry.service.spec.ts
import { TelemetryService } from './telemetry.service';

function makeService() {
  const prisma = { telemetryEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }) } };
  return { service: new TelemetryService(prisma as never), prisma };
}

describe('TelemetryService.ingest', () => {
  it('writes one row per surviving event, stamping the caller as the user', async () => {
    const { service, prisma } = makeService();

    const result = await service.ingest('user-1', {
      platform: 'web',
      sessionId: 'sess-1',
      events: [
        { name: 'screen_view', screen: 'expense/new' },
        { name: 'action', props: { flow: 'expense_manual', status: 'completed' } },
      ],
    } as never);

    expect(result).toEqual({ accepted: 2 });
    const rows = prisma.telemetryEvent.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      userId: 'user-1',
      name: 'screen_view',
      screen: 'expense/new',
      platform: 'web',
      sessionId: 'sess-1',
      props: undefined,
    });
  });

  it('never lets the payload choose the user', async () => {
    const { service, prisma } = makeService();

    await service.ingest('user-1', {
      platform: 'web',
      sessionId: 'sess-1',
      events: [{ name: 'session_start', userId: 'someone-else' }],
    } as never);

    expect(prisma.telemetryEvent.createMany.mock.calls[0][0].data[0].userId).toBe('user-1');
  });

  it('writes nothing at all when every event was dropped', async () => {
    const { service, prisma } = makeService();

    const result = await service.ingest('user-1', {
      platform: 'web',
      sessionId: 'sess-1',
      events: [{ name: 'expense_amount', props: { amount: 42.5 } }],
    } as never);

    expect(result).toEqual({ accepted: 0 });
    expect(prisma.telemetryEvent.createMany).not.toHaveBeenCalled();
  });

  it('records only the platforms it knows, defaulting the rest to unknown', async () => {
    const { service, prisma } = makeService();

    await service.ingest('user-1', {
      platform: 'smart-fridge',
      sessionId: 'sess-1',
      events: [{ name: 'session_start' }],
    } as never);

    expect(prisma.telemetryEvent.createMany.mock.calls[0][0].data[0].platform).toBe('unknown');
  });

  it('bounds the session id it stores', async () => {
    const { service, prisma } = makeService();

    await service.ingest('user-1', {
      platform: 'web',
      sessionId: 'x'.repeat(200),
      events: [{ name: 'session_start' }],
    } as never);

    expect(prisma.telemetryEvent.createMany.mock.calls[0][0].data[0].sessionId).toHaveLength(64);
  });
});
```

```typescript
// apps/api/src/modules/telemetry/telemetry.controller.spec.ts
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

describe('TelemetryController', () => {
  function makeController(ingest = jest.fn().mockResolvedValue({ accepted: 0 })) {
    const service = { ingest } as unknown as TelemetryService;
    return { controller: new TelemetryController(service), ingest };
  }

  it('takes the user from the request, not the body', async () => {
    const { controller, ingest } = makeController();

    await controller.ingest(
      { user: { id: 'user-1' } } as never,
      { platform: 'web', sessionId: 's', events: [] } as never,
    );

    expect(ingest).toHaveBeenCalledWith('user-1', expect.objectContaining({ platform: 'web' }));
  });

  it('resolves with no body even when every event was dropped', async () => {
    const { controller } = makeController(jest.fn().mockResolvedValue({ accepted: 0 }));

    await expect(
      controller.ingest(
        { user: { id: 'user-1' } } as never,
        { platform: 'web', sessionId: 's', events: [{ name: 'nonsense' }] } as never,
      ),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Run them and confirm they fail**

Run: `cd apps/api && npx jest src/modules/telemetry/telemetry.service src/modules/telemetry/telemetry.controller`
Expected: both fail to run — `Cannot find module './telemetry.service'`.

- [ ] **Step 7: Write the DTO, service, controller and module**

```typescript
// apps/api/src/modules/telemetry/dto/index.ts
import { IsArray, IsString, MaxLength, ArrayMaxSize } from 'class-validator';
import { MAX_EVENTS_PER_BATCH } from '../telemetry.validator';

export class IngestTelemetryDto {
  @IsString()
  @MaxLength(32)
  platform: string;

  @IsString()
  @MaxLength(64)
  sessionId: string;

  /** Deliberately `unknown[]`: the shape is decided by the allow-list in
   * `sanitizeEvents`, not by class-validator, so a client one version ahead
   * cannot fail the whole batch on an unknown field. */
  @IsArray()
  @ArrayMaxSize(MAX_EVENTS_PER_BATCH)
  events: unknown[];
}
```

```typescript
// apps/api/src/modules/telemetry/telemetry.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { IngestTelemetryDto } from './dto';
import { sanitizeEvents } from './telemetry.validator';

const KNOWN_PLATFORMS = new Set(['web', 'ios', 'android']);
const SESSION_ID_MAX = 64;

@Injectable()
export class TelemetryService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(userId: string, dto: IngestTelemetryDto): Promise<{ accepted: number }> {
    const events = sanitizeEvents(dto.events);
    if (events.length === 0) return { accepted: 0 };

    const platform = KNOWN_PLATFORMS.has(dto.platform) ? dto.platform : 'unknown';
    const sessionId = String(dto.sessionId ?? '').slice(0, SESSION_ID_MAX);

    await this.prisma.telemetryEvent.createMany({
      data: events.map((event) => ({
        userId,
        name: event.name,
        screen: event.screen,
        platform,
        sessionId,
        props: event.props ?? undefined,
      })),
    });

    return { accepted: events.length };
  }
}
```

```typescript
// apps/api/src/modules/telemetry/telemetry.controller.ts
import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types';
import { TelemetryService } from './telemetry.service';
import { IngestTelemetryDto } from './dto';

/**
 * No AccountContextGuard: telemetry is about the person using the app, not about
 * an account's data, and a screen view has no account. ThrottlerGuard is applied
 * explicitly because this app registers no global one, so `@Throttle` alone
 * would be inert.
 */
@Controller('telemetry')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class TelemetryController {
  constructor(private readonly service: TelemetryService) {}

  @Post('events')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async ingest(@Req() req: AuthenticatedRequest, @Body() dto: IngestTelemetryDto): Promise<void> {
    // 204 regardless of how many events survived: the client has nothing useful
    // to do with a rejection and must never retry.
    await this.service.ingest(req.user.id, dto);
  }
}
```

```typescript
// apps/api/src/modules/telemetry/telemetry.module.ts
import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService],
})
export class TelemetryModule {}
```

In `apps/api/src/app.module.ts`, add the import beside the others and `TelemetryModule,` to the `imports` array.

- [ ] **Step 8: Run the tests and typecheck**

Run: `cd apps/api && npx jest src/modules/telemetry && npx tsc --noEmit`
Expected: PASS (13 validator + 5 service + 2 controller), no TS output.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/modules/telemetry apps/api/src/app.module.ts packages/shared-types/src/dto
git commit -m "ABA-497 Add the telemetry events table and ingest endpoint"
```

---

### Task 3: Retention cron

**Files:**
- Create: `apps/api/src/modules/telemetry/telemetry-cleanup.cron.ts`
- Modify: `apps/api/src/modules/telemetry/telemetry.module.ts` (register the provider)
- Test: `apps/api/src/modules/telemetry/telemetry-cleanup.cron.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`.
- Produces: `class TelemetryCleanupCron { prune(): Promise<number> }` — `prune` is public so the test can call it without waiting for a schedule.

`ScheduleModule.forRoot()` is already registered in `app.module.ts`, so a `@Cron` provider works with no further wiring.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/telemetry/telemetry-cleanup.cron.spec.ts
import { TelemetryCleanupCron } from './telemetry-cleanup.cron';

describe('TelemetryCleanupCron', () => {
  it('deletes rows older than the retention window and reports the count', async () => {
    const prisma = { telemetryEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 7 }) } };
    const cron = new TelemetryCleanupCron(prisma as never);

    const deleted = await cron.prune();

    expect(deleted).toBe(7);
    const cutoff = prisma.telemetryEvent.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    const days = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
  });

  it('never throws — a failed prune must not take the cron process down', async () => {
    const prisma = {
      telemetryEvent: { deleteMany: jest.fn().mockRejectedValue(new Error('db down')) },
    };
    const cron = new TelemetryCleanupCron(prisma as never);

    await expect(cron.prune()).resolves.toBe(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd apps/api && npx jest src/modules/telemetry/telemetry-cleanup`
Expected: fails to run — `Cannot find module './telemetry-cleanup.cron'`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/modules/telemetry/telemetry-cleanup.cron.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';

/** 90 days is enough for a funnel and short enough that this table cannot
 *  become the largest thing in the database. Mirrors the shopping- and
 *  insight-notification log retention. */
const RETENTION_DAYS = 90;

@Injectable()
export class TelemetryCleanupCron {
  private readonly logger = new Logger(TelemetryCleanupCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *')
  async handleCron(): Promise<void> {
    const deleted = await this.prune();
    if (deleted > 0) {
      this.logger.log(`Pruned ${deleted} telemetry events older than ${RETENTION_DAYS} days`);
    }
  }

  async prune(): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    try {
      const { count } = await this.prisma.telemetryEvent.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      return count;
    } catch (error) {
      this.logger.warn(`Telemetry prune failed: ${error}`);
      return 0;
    }
  }
}
```

Add `TelemetryCleanupCron` to the module's `providers` array.

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/modules/telemetry`
Expected: PASS, 22 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/telemetry
git commit -m "ABA-497 Prune telemetry events older than 90 days"
```

---

### Task 4: The admin funnel query and endpoint

**Files:**
- Create: `apps/api/src/modules/telemetry/telemetry-admin.controller.ts`
- Modify: `apps/api/src/modules/telemetry/telemetry.service.ts` (add `getFunnel`)
- Modify: `apps/api/src/modules/telemetry/telemetry.module.ts` (add the controller)
- Modify: `packages/shared-types/src/dto/telemetry.ts` (response types)
- Test: `apps/api/src/modules/telemetry/telemetry-funnel.spec.ts`

**Interfaces:**
- Consumes: `TelemetryService` from Task 2.
- Produces:
  - `TelemetryService.getFunnel(days: number): Promise<TelemetryFunnelResponse>`
  - `interface TelemetryFunnelRow { flow: string; started: number; completed: number; abandoned: number; failed: number }`
  - `interface TelemetryScreenRow { screen: string; views: number }`
  - `interface TelemetryFunnelResponse { days: number; flows: TelemetryFunnelRow[]; screens: TelemetryScreenRow[]; lastScreens: TelemetryScreenRow[] }`

The response types live **only** in `packages/shared-types/src/dto/telemetry.ts`; the service imports them with `import type`, which the API is allowed to do (a runtime import would fail the deploy guard).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/telemetry/telemetry-funnel.spec.ts
import { TelemetryService } from './telemetry.service';

type Row = {
  name: string;
  screen: string | null;
  props: unknown;
  sessionId: string;
  createdAt: Date;
};

function makeService(rows: Row[]) {
  const prisma = {
    telemetryEvent: {
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };
  return { service: new TelemetryService(prisma as never), prisma };
}

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 1, 12, minutes));

describe('TelemetryService.getFunnel', () => {
  it('counts each flow by status', async () => {
    const { service } = makeService([
      { name: 'action', screen: null, props: { flow: 'expense_receipt', status: 'started' }, sessionId: 'a', createdAt: at(0) },
      { name: 'action', screen: null, props: { flow: 'expense_receipt', status: 'started' }, sessionId: 'b', createdAt: at(1) },
      { name: 'action', screen: null, props: { flow: 'expense_receipt', status: 'abandoned' }, sessionId: 'a', createdAt: at(2) },
      { name: 'action', screen: null, props: { flow: 'expense_manual', status: 'completed' }, sessionId: 'b', createdAt: at(3) },
    ]);

    const out = await service.getFunnel(30);

    expect(out.flows).toEqual([
      { flow: 'expense_receipt', started: 2, completed: 0, abandoned: 1, failed: 0 },
      { flow: 'expense_manual', started: 0, completed: 1, abandoned: 0, failed: 0 },
    ]);
  });

  it('counts screen views most-viewed first and ignores other event names', async () => {
    const { service } = makeService([
      { name: 'screen_view', screen: '(tabs)/index', props: null, sessionId: 'a', createdAt: at(0) },
      { name: 'screen_view', screen: 'expense/new', props: null, sessionId: 'a', createdAt: at(1) },
      { name: 'screen_view', screen: 'expense/new', props: null, sessionId: 'b', createdAt: at(2) },
      { name: 'session_start', screen: null, props: null, sessionId: 'b', createdAt: at(3) },
    ]);

    const out = await service.getFunnel(30);

    expect(out.screens).toEqual([
      { screen: 'expense/new', views: 2 },
      { screen: '(tabs)/index', views: 1 },
    ]);
  });

  it('reports the screen each session ended on — where people leave', async () => {
    const { service } = makeService([
      // session a: index -> receipt, left on receipt
      { name: 'screen_view', screen: '(tabs)/index', props: null, sessionId: 'a', createdAt: at(0) },
      { name: 'screen_view', screen: 'expense/receipt', props: null, sessionId: 'a', createdAt: at(5) },
      // session b: receipt -> index, left on index
      { name: 'screen_view', screen: 'expense/receipt', props: null, sessionId: 'b', createdAt: at(1) },
      { name: 'screen_view', screen: '(tabs)/index', props: null, sessionId: 'b', createdAt: at(9) },
      // session c: left on receipt
      { name: 'screen_view', screen: 'expense/receipt', props: null, sessionId: 'c', createdAt: at(2) },
    ]);

    const out = await service.getFunnel(30);

    expect(out.lastScreens).toEqual([
      { screen: 'expense/receipt', views: 2 },
      { screen: '(tabs)/index', views: 1 },
    ]);
  });

  it('asks the database only for the requested window', async () => {
    const { service, prisma } = makeService([]);

    const out = await service.getFunnel(7);

    const since = prisma.telemetryEvent.findMany.mock.calls[0][0].where.createdAt.gte as Date;
    expect(Math.round((Date.now() - since.getTime()) / 86_400_000)).toBe(7);
    expect(out.days).toBe(7);
  });

  it('clamps a nonsense window instead of scanning the whole table', async () => {
    const { service, prisma } = makeService([]);

    await service.getFunnel(9999);

    const since = prisma.telemetryEvent.findMany.mock.calls[0][0].where.createdAt.gte as Date;
    expect(Math.round((Date.now() - since.getTime()) / 86_400_000)).toBe(90);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd apps/api && npx jest src/modules/telemetry/telemetry-funnel`
Expected: FAIL — `service.getFunnel is not a function`.

- [ ] **Step 3: Add the response types**

Append to `packages/shared-types/src/dto/telemetry.ts`:

```typescript
export interface TelemetryFunnelRow {
  flow: string;
  started: number;
  completed: number;
  abandoned: number;
  failed: number;
}

export interface TelemetryScreenRow {
  screen: string;
  views: number;
}

export interface TelemetryFunnelResponse {
  days: number;
  flows: TelemetryFunnelRow[];
  /** Most-viewed screens in the window. */
  screens: TelemetryScreenRow[];
  /** The screen each session ended on, most frequent first — where people leave. */
  lastScreens: TelemetryScreenRow[];
}
```

- [ ] **Step 4: Implement `getFunnel`**

Add to the imports at the top of `apps/api/src/modules/telemetry/telemetry.service.ts`:

```typescript
import type {
  TelemetryFunnelResponse,
  TelemetryFunnelRow,
  TelemetryScreenRow,
} from '@budget/shared-types';
```

these constants beside the existing ones:

```typescript
const MAX_WINDOW_DAYS = 90; // never longer than what retention keeps

type FunnelStatus = 'started' | 'completed' | 'abandoned' | 'failed';
```

and this method to the class:

```typescript
  /**
   * Aggregated in JS rather than SQL: `props` is Json, so grouping by
   * `props->>'flow'` would need raw SQL, and the row volume inside a 90-day
   * window is bounded by retention. Flow insertion order is preserved so the
   * flow a user hits first reads first.
   */
  async getFunnel(days: number): Promise<TelemetryFunnelResponse> {
    const window = Math.min(Math.max(Math.trunc(days) || 30, 1), MAX_WINDOW_DAYS);
    const since = new Date(Date.now() - window * 86_400_000);

    const rows = await this.prisma.telemetryEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { name: true, screen: true, props: true, sessionId: true, createdAt: true },
    });

    const flows = new Map<string, TelemetryFunnelRow>();
    const screens = new Map<string, number>();
    // The latest screen_view seen per session, so far.
    const lastPerSession = new Map<string, { screen: string; at: number }>();

    for (const row of rows) {
      if (row.name === 'screen_view') {
        if (!row.screen) continue;
        screens.set(row.screen, (screens.get(row.screen) ?? 0) + 1);
        const at = row.createdAt.getTime();
        const seen = lastPerSession.get(row.sessionId);
        if (!seen || at >= seen.at) lastPerSession.set(row.sessionId, { screen: row.screen, at });
        continue;
      }
      if (row.name !== 'action') continue;
      const props = (row.props ?? {}) as Record<string, unknown>;
      const flow = typeof props.flow === 'string' ? props.flow : null;
      const status = typeof props.status === 'string' ? (props.status as FunnelStatus) : null;
      if (!flow || !status) continue;
      const entry = flows.get(flow) ?? { flow, started: 0, completed: 0, abandoned: 0, failed: 0 };
      entry[status] += 1;
      flows.set(flow, entry);
    }

    const lastScreens = new Map<string, number>();
    for (const { screen } of lastPerSession.values()) {
      lastScreens.set(screen, (lastScreens.get(screen) ?? 0) + 1);
    }

    const byViewsDesc = (counts: Map<string, number>): TelemetryScreenRow[] =>
      Array.from(counts.entries())
        .map(([screen, views]) => ({ screen, views }))
        .sort((a, b) => b.views - a.views);

    return {
      days: window,
      flows: Array.from(flows.values()),
      screens: byViewsDesc(screens),
      lastScreens: byViewsDesc(lastScreens),
    };
  }
```

- [ ] **Step 5: Add the admin controller**

```typescript
// apps/api/src/modules/telemetry/telemetry-admin.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { TelemetryService } from './telemetry.service';

/**
 * A second controller rather than another route on the ingest one: the ingest
 * route is reachable by every signed-in user and this one must never be, so the
 * two guard sets are kept physically apart (the restore-credentials precedent).
 */
@Controller('admin/telemetry')
@UseGuards(JwtAuthGuard, AdminGuard)
export class TelemetryAdminController {
  constructor(private readonly service: TelemetryService) {}

  @Get('funnel')
  async funnel(@Query('days') days?: string) {
    return this.service.getFunnel(Number(days));
  }
}
```

Add `TelemetryAdminController` to the module's `controllers` array.

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd apps/api && npx jest src/modules/telemetry && npx tsc --noEmit`
Expected: PASS, 27 tests; no TS output.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/telemetry packages/shared-types/src/dto/telemetry.ts
git commit -m "ABA-497 Add the admin telemetry funnel endpoint"
```

---

### Task 5: The admin page

**Files:**
- Create: `apps/admin/src/hooks/use-telemetry-funnel.ts`
- Create: `apps/admin/src/app/telemetry/page.tsx`
- Modify: `apps/admin/src/components/layout/app-sidebar.tsx`

**Interfaces:**
- Consumes: `GET admin/telemetry/funnel?days=` and `TelemetryFunnelResponse` from Task 4.
- Produces: nothing other tasks depend on.

`Stat`/`InfoHint` are page-local helpers in this codebase — `/metrics` and `/acquisition` each define their own — so this page defines its own too rather than importing one.

- [ ] **Step 1: Write the hook**

```typescript
// apps/admin/src/hooks/use-telemetry-funnel.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { TelemetryFunnelResponse } from "@budget/shared-types";

export function useTelemetryFunnel(days = 30) {
  return useQuery<TelemetryFunnelResponse>({
    queryKey: ["admin", "telemetry", "funnel", days],
    queryFn: () => api.get(`admin/telemetry/funnel?days=${days}`).json(),
  });
}
```

Confirm the idiom matches its sibling before moving on:

```bash
cat apps/admin/src/hooks/use-acquisition.ts
```

If `use-acquisition.ts` builds its query key or fetch differently, follow that file.

- [ ] **Step 2: Write the page**

```tsx
// apps/admin/src/app/telemetry/page.tsx
"use client";

import { useState } from "react";
import { useTelemetryFunnel } from "@/hooks/use-telemetry-funnel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip as UITooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { TelemetryScreenRow } from "@budget/shared-types";

const WINDOWS = [7, 30, 90] as const;

const HINTS = {
  flows:
    "A flow reports 'started' when its screen opens and 'completed' when it saves. 'Abandoned' is derived — started minus completed minus failed — because a screen that is left cannot run code to report itself.",
  screens:
    "Screen views in the window, most viewed first. The name is the route pattern, so a dynamic route reads as expense/[id] and never carries a real id.",
  lastScreens: "The screen each session ended on, most frequent first. This is where people leave.",
  webOnly:
    "Signed-in web sessions only. Mobile sends nothing — the native client is a deliberate no-op — so these numbers are not app-wide.",
};

function InfoHint({ text }: { text: string }) {
  return (
    <UITooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="What is this?"
          className="inline-flex text-muted-foreground/60 hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-snug">{text}</TooltipContent>
    </UITooltip>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
          {label}
          {hint && <InfoHint text={hint} />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function ScreenTable({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: TelemetryScreenRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {title}
          <InfoHint text={hint} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Screen</TableHead>
              <TableHead className="text-right">Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 25).map((row) => (
              <TableRow key={row.screen}>
                <TableCell className="font-mono text-xs">{row.screen}</TableCell>
                <TableCell className="text-right">{row.views}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={2}>No screen views in this window.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function TelemetryPage() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading } = useTelemetryFunnel(days);

  if (isLoading) return <PageSkeleton />;

  const flows = data?.flows ?? [];
  const totalStarted = flows.reduce((sum, f) => sum + f.started, 0);
  const totalCompleted = flows.reduce((sum, f) => sum + f.completed, 0);
  const sessions = (data?.lastScreens ?? []).reduce((sum, s) => sum + s.views, 0);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold flex items-center gap-1.5">
            Product telemetry
            <InfoHint text={HINTS.webOnly} />
          </h1>
          <div className="ml-auto flex gap-1">
            {WINDOWS.map((w) => (
              <Button
                key={w}
                variant={w === days ? "default" : "outline"}
                size="sm"
                onClick={() => setDays(w)}
              >
                {w}d
              </Button>
            ))}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Sign-ups, activation and retention live on Investor metrics. This page
          answers what a signed-in web user did <em>before</em> writing anything.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Sessions with a screen view"
            value={String(sessions)}
            hint={HINTS.lastScreens}
          />
          <Stat label="Flows started" value={String(totalStarted)} hint={HINTS.flows} />
          <Stat
            label="Overall completion"
            value={totalStarted > 0 ? `${Math.round((totalCompleted / totalStarted) * 100)}%` : "—"}
            hint={HINTS.flows}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              Flows
              <InfoHint text={HINTS.flows} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flow</TableHead>
                  <TableHead className="text-right">Started</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Abandoned</TableHead>
                  <TableHead className="text-right">Completion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flows.map((row) => {
                  // Derived, not reported: a screen that is left cannot run code.
                  const abandoned = Math.max(
                    row.abandoned,
                    row.started - row.completed - row.failed,
                  );
                  return (
                    <TableRow key={row.flow}>
                      <TableCell className="font-medium">{row.flow}</TableCell>
                      <TableCell className="text-right">{row.started}</TableCell>
                      <TableCell className="text-right">{row.completed}</TableCell>
                      <TableCell className="text-right">{row.failed}</TableCell>
                      <TableCell className="text-right">{abandoned}</TableCell>
                      <TableCell className="text-right">
                        {row.started > 0
                          ? `${Math.round((row.completed / row.started) * 100)}%`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {flows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>No flow events in this window.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <ScreenTable title="Most viewed screens" hint={HINTS.screens} rows={data?.screens ?? []} />
          <ScreenTable
            title="Where sessions end"
            hint={HINTS.lastScreens}
            rows={data?.lastScreens ?? []}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 3: Add the sidebar entry**

In `apps/admin/src/components/layout/app-sidebar.tsx`, add `Activity` to the `lucide-react` import and this entry to the nav array, directly after the Acquisition line:

```typescript
  { href: "/telemetry", label: "Telemetry", icon: Activity },
```

- [ ] **Step 4: Typecheck and build the admin**

Run: `cd apps/admin && npx tsc --noEmit && npm run build`
Expected: no TS output; the build lists a `/telemetry` route.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src
git commit -m "ABA-497 Add the admin product-telemetry page"
```

---

### Task 6: The client — native no-op and web implementation

**Files:**
- Create: `apps/mobile/src/services/telemetry.types.ts`
- Create: `apps/mobile/src/services/telemetry.ts` (native)
- Create: `apps/mobile/src/services/telemetry.web.ts` (web)
- Test: `apps/mobile/src/services/__tests__/telemetry.native.test.ts`
- Test: `apps/mobile/src/services/__tests__/telemetry.web.test.ts`

**Interfaces:**
- Consumes: `POST /telemetry/events` from Task 2; `secureStorage` from `@/services/secureStorage`.
- Produces (identical exports in both platform files):
  - `function trackScreen(screen: string): void`
  - `function trackAction(flow: TelemetryFlow, status: TelemetryStatus, ms?: number): void`
  - `function startTelemetrySession(): void`
  - `function flushTelemetry(): void`
  - `function resetTelemetry(): void` — called on sign-out; drops the buffer
- From `telemetry.types.ts`: `type TelemetryFlow`, `type TelemetryStatus`

The unions live in a **third, platform-free file** — the `attribution.{ts,types.ts,web.ts,native.ts}` convention. A `telemetry.web.ts` importing from `./telemetry` would resolve to itself under Metro's platform resolution while `tsc` resolved it to the native file; a separate types file removes the ambiguity.

- [ ] **Step 1: Write the failing native guard test — this is the CI expression of "mobile is not touched"**

```typescript
// apps/mobile/src/services/__tests__/telemetry.native.test.ts
import {
  trackScreen,
  trackAction,
  startTelemetrySession,
  flushTelemetry,
  resetTelemetry,
} from '../telemetry';

describe('telemetry (native)', () => {
  it('sends nothing and throws nothing', () => {
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;

    expect(() => {
      startTelemetrySession();
      trackScreen('expense/new');
      trackAction('expense_manual', 'completed', 1200);
      flushTelemetry();
      resetTelemetry();
    }).not.toThrow();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd apps/mobile && npx jest src/services/__tests__/telemetry.native`
Expected: fails to run — `Cannot find module '../telemetry'`.

- [ ] **Step 3: Write the types file and the native no-op**

```typescript
// apps/mobile/src/services/telemetry.types.ts

/** Platform-free so both `telemetry.ts` and `telemetry.web.ts` can import it
 *  without either platform file importing the other. Mirrors
 *  `attribution.types.ts`. These names must match the server allow-list in
 *  `apps/api/src/modules/telemetry/telemetry.validator.ts` — a value missing
 *  there is dropped silently. */
export type TelemetryFlow =
  | 'expense_manual'
  | 'expense_voice'
  | 'expense_receipt'
  | 'income_manual'
  | 'import_bank'
  | 'budget_create'
  | 'chat_message'
  | 'rate_alert_create';

export type TelemetryStatus = 'started' | 'completed' | 'failed' | 'abandoned';
```

```typescript
// apps/mobile/src/services/telemetry.ts
import type { TelemetryFlow, TelemetryStatus } from './telemetry.types';

export type { TelemetryFlow, TelemetryStatus };

/**
 * Native no-op. The web implementation lives in `telemetry.web.ts` and Metro
 * resolves the platform file at bundle time, so nothing here — and no browser
 * API, and no dependency — ever reaches the native app. That is what makes
 * "mobile is not touched" a property of the bundler rather than a promise.
 *
 * To add mobile telemetry later, implement these five functions here; every
 * existing call site starts reporting with no further change.
 */
export function startTelemetrySession(): void {}
export function trackScreen(_screen: string): void {}
export function trackAction(_flow: TelemetryFlow, _status: TelemetryStatus, _ms?: number): void {}
export function flushTelemetry(): void {}
export function resetTelemetry(): void {}
```

- [ ] **Step 4: Run the native test**

Run: `cd apps/mobile && npx jest src/services/__tests__/telemetry.native`
Expected: PASS, 1 test.

- [ ] **Step 5: Write the failing web test**

The `@jest-environment jsdom` pragma is **required**: this repo's mobile Jest
environment (`jest-expo` preset) provides **no `document`** — verified by probe —
so without it the `visibilitychange` test has nothing to dispatch on and the
implementation's own `typeof document === 'undefined'` guard skips binding the
listener. `jest-environment-jsdom` resolves from the repo root, so the pragma
needs no dependency change.

```typescript
/** @jest-environment jsdom */
// apps/mobile/src/services/__tests__/telemetry.web.test.ts
jest.mock('@/services/secureStorage', () => ({
  secureStorage: { getItem: jest.fn().mockResolvedValue('token-1') },
}));

import {
  startTelemetrySession,
  trackScreen,
  trackAction,
  flushTelemetry,
  resetTelemetry,
} from '../telemetry.web';

/**
 * Microtasks only — deliberately NOT `setImmediate`, which `jest.useFakeTimers()`
 * also fakes, so a `setImmediate`-based helper never resolves under fake timers.
 * `send()` awaits one promise (the token read) before calling fetch, so a few
 * turns of the microtask queue are enough.
 */
const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('telemetry (web)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    resetTelemetry();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('buffers events and sends them as one batch with the bearer token and keepalive', async () => {
    startTelemetrySession();
    trackScreen('expense/new');
    trackAction('expense_manual', 'completed', 1200);

    flushTelemetry();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/telemetry/events');
    expect(init.keepalive).toBe(true);
    expect(init.headers.Authorization).toBe('Bearer token-1');
    const body = JSON.parse(init.body);
    expect(body.platform).toBe('web');
    expect(body.sessionId).toEqual(expect.any(String));
    expect(body.events.map((e: { name: string }) => e.name)).toEqual([
      'session_start',
      'screen_view',
      'action',
    ]);
  });

  it('flushes on its own after the interval, with no explicit call', async () => {
    trackScreen('expense/new');

    jest.advanceTimersByTime(20_000);
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flushes when the page is hidden, which is the unload path', async () => {
    trackScreen('expense/new');

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the buffer is empty', () => {
    flushTelemetry();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the buffer before sending, so a rejected flush cannot resend it', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    trackScreen('expense/new');

    flushTelemetry();
    await flushMicrotasks();
    fetchMock.mockResolvedValue({ ok: true });
    flushTelemetry();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never throws when the network rejects', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    trackScreen('expense/new');

    expect(() => flushTelemetry()).not.toThrow();
    await flushMicrotasks();
  });

  it('drops the buffer on reset without sending, for sign-out', async () => {
    trackScreen('expense/new');

    resetTelemetry();
    flushTelemetry();
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives every session a different id', async () => {
    startTelemetrySession();
    flushTelemetry();
    await flushMicrotasks();
    const first = JSON.parse(fetchMock.mock.calls[0][1].body).sessionId;

    resetTelemetry();
    fetchMock.mockClear();
    startTelemetrySession();
    flushTelemetry();
    await flushMicrotasks();
    const second = JSON.parse(fetchMock.mock.calls[0][1].body).sessionId;

    expect(second).not.toBe(first);
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `cd apps/mobile && npx jest src/services/__tests__/telemetry.web`
Expected: fails to run — `Cannot find module '../telemetry.web'`.

- [ ] **Step 7: Write the web implementation**

```typescript
// apps/mobile/src/services/telemetry.web.ts
import { secureStorage } from '@/services/secureStorage';
import type { TelemetryFlow, TelemetryStatus } from './telemetry.types';

export type { TelemetryFlow, TelemetryStatus };

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
const FLUSH_INTERVAL_MS = 15_000;
/** Well under the 64 KB keepalive body cap, and equal to the server's cap. */
const MAX_BUFFERED = 40;

interface BufferedEvent {
  name: 'session_start' | 'screen_view' | 'action';
  screen?: string;
  props?: Record<string, string | number>;
  ts: number;
}

let buffer: BufferedEvent[] = [];
let sessionId = newSessionId();
let timer: ReturnType<typeof setInterval> | null = null;
let listenersBound = false;

/** Random per app load, memory only — no cross-session identifier exists. */
function newSessionId(): string {
  const random = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${random}`;
}

function push(event: BufferedEvent): void {
  // Drop the oldest rather than grow without bound: a lost statistic is
  // strictly preferable to unbounded memory in a long-lived tab.
  if (buffer.length >= MAX_BUFFERED) buffer.shift();
  buffer.push(event);
  ensureTimers();
}

function ensureTimers(): void {
  if (timer === null) timer = setInterval(flushTelemetry, FLUSH_INTERVAL_MS);
  if (listenersBound || typeof document === 'undefined') return;
  listenersBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushTelemetry();
  });
}

export function startTelemetrySession(): void {
  push({ name: 'session_start', ts: Date.now() });
}

export function trackScreen(screen: string): void {
  push({ name: 'screen_view', screen, ts: Date.now() });
}

export function trackAction(flow: TelemetryFlow, status: TelemetryStatus, ms?: number): void {
  const props: Record<string, string | number> = { flow, status };
  if (typeof ms === 'number' && Number.isFinite(ms)) props.ms = Math.round(ms);
  push({ name: 'action', props, ts: Date.now() });
}

/** Drops whatever is buffered without sending it. Called on sign-out: the token
 *  is gone and those events belong to a session that has ended.
 *
 *  Also stops the periodic flush — after sign-out nothing should tick on a
 *  timer until something is tracked again, and `push` recreates it when it is.
 *  `listenersBound` is deliberately NOT reset: the visibilitychange listener is
 *  bound once for the document's lifetime and must never be double-bound. */
export function resetTelemetry(): void {
  buffer = [];
  sessionId = newSessionId();
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

export function flushTelemetry(): void {
  if (buffer.length === 0) return;
  // Cleared BEFORE the request: a rejected flush must not resend (no retries).
  const events = buffer;
  buffer = [];
  void send(events);
}

async function send(events: BufferedEvent[]): Promise<void> {
  try {
    const token = await secureStorage.getItem('accessToken');
    if (!token) return;
    await fetch(`${API_BASE_URL}/telemetry/events`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ platform: 'web', sessionId, events }),
    });
  } catch {
    // Telemetry may never degrade the product: no log, no retry, no rethrow.
  }
}
```

- [ ] **Step 8: Run both client test files**

Run: `cd apps/mobile && npx jest src/services/__tests__/telemetry`
Expected: PASS, 10 tests (1 native + 9 web). The `jsdom` pragma at the top of the web test file is what makes the `visibilitychange` test possible — do not drop it.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/services/telemetry.types.ts apps/mobile/src/services/telemetry.ts apps/mobile/src/services/telemetry.web.ts apps/mobile/src/services/__tests__
git commit -m "ABA-497 Add the web telemetry client and its native no-op"
```

---

### Task 7: Screen views

**Files:**
- Create: `apps/mobile/src/hooks/useTelemetryScreenViews.ts` (native)
- Create: `apps/mobile/src/hooks/useTelemetryScreenViews.web.ts` (web)
- Modify: `apps/mobile/app/_layout.tsx` (one hook call in `RootNavigator`)
- Modify: `apps/mobile/src/stores/authSessionActions.ts` (`resetTelemetry()` in `logoutAction`)

**Interfaces:**
- Consumes: `trackScreen`, `startTelemetrySession`, `resetTelemetry` from Task 6.
- Produces: `function useTelemetryScreenViews(gateOpen: boolean): void`

- [ ] **Step 1: Write the native no-op hook**

```typescript
// apps/mobile/src/hooks/useTelemetryScreenViews.ts

/**
 * Native no-op. The web version subscribes to navigation; this one must not,
 * because a route subscription anywhere near `RootNavigator` re-renders its 95
 * `<Stack.Screen>` elements on every navigation (see `useFirstRunOnboarding`'s
 * note on why `usePathname()` was removed from there).
 */
export function useTelemetryScreenViews(_gateOpen: boolean): void {}
```

- [ ] **Step 2: Write the web hook**

```typescript
// apps/mobile/src/hooks/useTelemetryScreenViews.web.ts
import { useEffect, useRef } from 'react';
import { useNavigationContainerRef } from 'expo-router';
import { startTelemetrySession, trackScreen } from '@/services/telemetry';

/**
 * Reports a screen view per navigation, observed through the navigation ref's
 * listener so the host component never re-renders — the only shape allowed near
 * `RootNavigator`.
 *
 * The reported name is the ROUTE PATTERN from `getCurrentRoute().name`
 * (`expense/[id]`), never the resolved path, which would put an expense id into
 * a telemetry row.
 */
export function useTelemetryScreenViews(gateOpen: boolean): void {
  const navigationRef = useNavigationContainerRef();
  const started = useRef(false);
  const lastScreen = useRef<string | null>(null);

  useEffect(() => {
    if (!gateOpen) return;

    if (!started.current) {
      started.current = true;
      startTelemetrySession();
    }

    const report = () => {
      const name = navigationRef.getCurrentRoute()?.name;
      if (!name || name === lastScreen.current) return;
      lastScreen.current = name;
      trackScreen(name);
    };

    report();
    const unsubscribe = navigationRef.addListener('state', report);
    return unsubscribe;
  }, [gateOpen, navigationRef]);
}
```

- [ ] **Step 3: Wire it into the root navigator**

In `apps/mobile/app/_layout.tsx`, add the import beside the other hooks and call it with the **existing** cold-start gate value, which in that file is bound as `coldStartGateReady` (line ~47, `useColdStartGate({ isInitializing, isAuthenticated, fontsLoaded })`) and is already passed to `<WhatsNewSpotlight gateOpen={coldStartGateReady} />`:

```typescript
import { useTelemetryScreenViews } from '@/hooks/useTelemetryScreenViews';
// …inside RootNavigator, beside the existing hook calls:
useTelemetryScreenViews(coldStartGateReady);
```

Do not compute a second gate value.

- [ ] **Step 4: Drop the buffer on sign-out**

In `apps/mobile/src/stores/authSessionActions.ts`, inside `logoutAction`, beside the existing `clearRestoreCredential()` call:

```typescript
import { resetTelemetry } from '@/services/telemetry';
// …
resetTelemetry();
```

Place it outside any token-valid guard, like `clearRestoreCredential()` — an offline sign-out must still drop the buffer.

- [ ] **Step 5: Typecheck and run the whole mobile suite**

Run: `cd apps/mobile && npx tsc --noEmit && npx jest`
Expected: no TS output; every suite passes.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/hooks/useTelemetryScreenViews.ts apps/mobile/src/hooks/useTelemetryScreenViews.web.ts apps/mobile/app/_layout.tsx apps/mobile/src/stores/authSessionActions.ts
git commit -m "ABA-497 Report web screen views through the navigation ref"
```

---

### Task 8: The eight flow call sites

Each is one import plus one or two `trackAction` lines, in shared code, compiling to nothing on native.

**Files (modify):**
- `apps/mobile/app/expense/new.tsx` — `expense_manual`
- `apps/mobile/app/expense/voice.tsx` — `expense_voice`
- `apps/mobile/app/expense/receipt.tsx` — `expense_receipt`
- `apps/mobile/app/income/new.tsx` — `income_manual`
- `apps/mobile/app/settings/import/preview.tsx` — `import_bank`
- `apps/mobile/app/budget/new.tsx` — `budget_create`
- `apps/mobile/app/(tabs)/chat.tsx` — `chat_message`
- `apps/mobile/app/wallet/rate-alerts.tsx` — `rate_alert_create`

**Interfaces:**
- Consumes: `trackAction` from Task 6.
- Produces: nothing.

- [ ] **Step 1: Confirm every path and find each screen's submit handler**

```bash
cd apps/mobile
ls app/budget/ app/expense/ app/income/ app/settings/import/
grep -n "const handleSubmit\|const handleSave\|const handleSend\|const handleCreate\|const handleConfirm" \
  app/expense/new.tsx app/expense/voice.tsx app/expense/receipt.tsx app/income/new.tsx \
  app/settings/import/preview.tsx app/budget/new.tsx "app/(tabs)/chat.tsx" app/wallet/rate-alerts.tsx
```

Expected: at least one handler per file. Note the exact name for each; the steps below refer to "the submit handler". If a path does not exist (`app/budget/new.tsx` in particular), find the real one with `ls app/budget` and use it.

- [ ] **Step 2: Instrument one screen and verify the shape**

In `apps/mobile/app/expense/new.tsx`:

```typescript
import { trackAction } from '@/services/telemetry';
```

At the top of the screen component body, mark the flow started once on mount:

```typescript
  useEffect(() => {
    trackAction('expense_manual', 'started');
  }, []);
```

At the point the submit handler has validated and is about to write:

```typescript
    trackAction('expense_manual', 'completed');
```

and in its validation-failure branches, where it already shows an alert for a bad amount:

```typescript
    trackAction('expense_manual', 'failed');
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Repeat for the remaining seven**

Same three insertion points, with these exact flow names:

- `app/expense/voice.tsx` → `trackAction('expense_voice', 'started' | 'completed' | 'failed')`
- `app/expense/receipt.tsx` → `trackAction('expense_receipt', …)` — `started` on mount, `completed` in the save handler, `failed` in the scan-error branch
- `app/income/new.tsx` → `trackAction('income_manual', …)`
- `app/settings/import/preview.tsx` → `trackAction('import_bank', …)` — `started` on mount, `completed` after the commit resolves, `failed` in its catch
- `app/budget/new.tsx` → `trackAction('budget_create', …)`
- `app/(tabs)/chat.tsx` → `trackAction('chat_message', 'completed')` in the send handler only; a chat tab is not a flow that can be abandoned
- `app/wallet/rate-alerts.tsx` → `trackAction('rate_alert_create', 'completed')` after `createWatch` resolves, `'failed'` in its catch

There is deliberately **no `abandoned` call site**: it is derived on read as `started − completed − failed`, because a screen that is left cannot run code. Do not add an unmount handler for it — an unmount fires on a successful navigation away too, so it would report abandonment for completed flows.

- [ ] **Step 5: Run the whole mobile suite and lint the touched files**

```bash
cd apps/mobile
npx tsc --noEmit && npx jest
npx eslint app/expense/new.tsx app/expense/voice.tsx app/expense/receipt.tsx \
  app/income/new.tsx app/settings/import/preview.tsx app/budget/new.tsx \
  "app/(tabs)/chat.tsx" app/wallet/rate-alerts.tsx \
  src/services/telemetry.ts src/services/telemetry.web.ts src/services/telemetry.types.ts \
  src/hooks/useTelemetryScreenViews.ts src/hooks/useTelemetryScreenViews.web.ts
```
Expected: no TS output, all suites pass, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app
git commit -m "ABA-497 Report the eight key flows to telemetry"
```

---

### Task 9: Privacy policy, docs and the issue

The spec requires a privacy-policy line **before the first event is sent in production**, so this task gates the deploy.

**Files:**
- Modify: `docs/marketing/landing/build_landing.py` (the privacy/cookie policy copy)
- Regenerate: `docs/marketing/landing/site/**` and the apex sitemap
- Modify: `CLAUDE.md`
- Create: the GitHub issue

- [ ] **Step 1: Find the policy copy and its languages**

```bash
grep -n "Co zbieramy\|What we collect" docs/marketing/landing/build_landing.py | head
```

Expected: the policy section's copy table. Note every language it carries — the new sentence goes into all of them.

- [ ] **Step 2: Add the telemetry sentence to the policy**

One sentence per language, stating that in the web app we record product-usage events — which screens are opened and whether a key action was completed — that they are stored on our own servers, are not shared with third parties, contain no transaction data, and are deleted after 90 days. Do **not** claim consent is collected: the basis here is first-party events for an authenticated user with no cross-session identifier.

- [ ] **Step 3: Regenerate the landing with the production environment**

```bash
cd /d/Work/micode/ai-budget-assistant
LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py
```

Expected: the site rebuilds. The env vars are mandatory — the bare invocation builds a `noindex` preview that would overwrite the production pages. `docs/marketing` is gitignored, so the regenerated pages need `git add -f`.

- [ ] **Step 4: Update CLAUDE.md**

Add a bullet in the mobile section recording: the platform-split no-op as the mechanism that keeps mobile untouched (and `telemetry.types.ts` as the shared declaration site); that `screen` is a route pattern read from the navigation ref, never `usePathname()`'s resolved path, and why; that the flush is `keepalive` fetch and why `sendBeacon` cannot be used (no custom headers, and the JWT is in localStorage, not a cookie); that event names, prop keys and prop values are allow-listed server-side and silently dropped otherwise; that `abandoned` is derived on read rather than emitted; and the endpoint, table, retention window and admin page.

- [ ] **Step 5: Create the issue**

Use the number claimed in Task 0. Title has no colon. Body: Problem / Implementation / Out of scope, in English, per this repo's convention:

```bash
gh issue create --title "ABA-497 Add first-party web product telemetry" --body "$(cat <<'EOF'
## Problem
…
## Implementation
…
## Out of scope / Follow-ups
…
EOF
)"
```

- [ ] **Step 6: Full verification**

```bash
cd apps/api && OPENAI_API_KEY=test npx jest && npx tsc --noEmit
cd ../mobile && npx jest && npx tsc --noEmit
cd ../admin && npx tsc --noEmit
```
Expected: everything passes. (`OPENAI_API_KEY` is required or two unrelated price-history suites fail on `new OpenAI()` in a constructor — pre-existing, not caused by this work.)

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md && git add -f docs/marketing/landing
git commit -m "ABA-497 Document web telemetry in the privacy policy and CLAUDE.md"
```

---

## Deployment notes

- The API deploy is path-filtered on `apps/api/**`, `packages/**` and `docker-compose.prod.yml`, so pushing this lands the migration automatically through the deploy `migrator`.
- **Order matters**: the API must be deployed before a web build that sends events, or every flush 404s. The web deploy (`web-deploy.yml`) runs on the same push as the API deploy and the client swallows failures, so the worst case is a few dropped batches during the window.
- Nothing here requires a mobile release. That is the point of the platform split.
- After the first day, read the admin page and check the assumption in the spec's "What we do not know": if there is almost no post-login abandonment, the loss is upstream and the A/B/C sub-project order should be revisited before building them.

## Out of scope (spec decision 8 and its Follow-ups)

- Pre-login telemetry — needs a public, throttled ingest endpoint with its own abuse design.
- Mobile telemetry — needs a Play Data safety decision first.
- Cohort and per-`acquisitionSource` funnel breakdowns joining ABA-436's columns to behaviour.
