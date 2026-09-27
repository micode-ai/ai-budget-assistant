# Voice Digest — API Implementation Plan (plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a week, at the user's chosen weekday and hour in their time zone, the Telegram / Slack bot sends a 40–60 s voice note plus the same text; WhatsApp sends it directly inside the 24-hour window or an approved template with a "Listen" button outside it. Opt-in via `/digest on`, the app, or the settings screen (plan 2).

**Architecture:** Pure modules carry every rule (`digest-schedule.util.ts`, `digest-facts.util.ts`, `digest-text.util.ts`) and are unit-tested. IO services: `VoiceDigestFactsService` (reads existing services), `VoiceDigestNarrator` (gpt-4o-mini, number-checked, deterministic fallback), `TtsService` (OpenAI speech → Ogg/Opus), `VoiceDigestService` (orchestrator + hourly cron). A `@Global()` `VoiceDigestModule` owns a **channel registry**: each bot module registers its own `DigestSender` on init, so the digest core never imports bot modules and bots can call the core for `/digest` without an import cycle.

**Tech Stack:** NestJS 10, Prisma 5, `@nestjs/schedule`, Redis (`CacheService`), OpenAI SDK (`gpt-4o-mini`, `gpt-4o-mini-tts`), Telegraf, WhatsApp Cloud API (Graph), Slack WebClient, Jest.

**Spec:** `docs/superpowers/specs/2026-09-26-voice-digest-design.md` — its **Corrections** section overrides the body.

## Global Constraints

- User fields (migration in the same commit as the schema — ABA-558): `voiceDigestEnabled Boolean @default(false)`, `voiceDigestDay Int @default(1)` (0 = Sunday … 6 = Saturday), `voiceDigestHour Int @default(8)` (0–23), `voiceDigestChannel String?` (`telegram|whatsapp|slack`), `voiceDigestLastSentAt DateTime?`.
- Due when the user's local weekday == day and local hour == hour (IANA `User.timezone`, invalid → UTC) AND (`lastSentAt` null or older than 6 days); lock `vd:{userId}:{isoWeekKey}` via `CacheService.setIfAbsent(key, 8 * 86400)`; Redis down → `false` → skip.
- The digest covers the account selected in that bot (`<Link>.defaultAccountId`), in `User.language`, amounts in `User.currencyCode`. No expenses in the last 7 days → nothing sent, `lastSentAt` untouched.
- Tier-2 (full) encrypted account → skipped.
- Narration: `CHEAP_MODEL` (`gpt-4o-mini`), receives only the facts JSON, ≤ 130 words; every number in its output must equal a fact value (after normalisation) or the deterministic fallback text is used. Model error → fallback.
- TTS: `gpt-4o-mini-tts`, `response_format: 'opus'` (Ogg/Opus — Telegram `sendVoice`, WhatsApp `audio/ogg`, Slack file all accept it). TTS failure → text only; the week counts as sent.
- Text is always sent with the voice.
- WhatsApp: `lastInboundAt` within 23 h → audio + text directly; else the approved template (env `WHATSAPP_DIGEST_TEMPLATE` = template name; unset → WhatsApp digest unavailable, logged with `Logger.warn`, not sent, user not disabled). Template language: `en pl de es fr ru nl` as is, `ua` → `uk`, `be` → `ru`. The prepared digest waits in Redis `wa:vd:{userId}` for 48 h; the quick-reply payload is `vd--listen`.
- Blocked bot (Telegram 403; Slack `channel_not_found|is_archived|account_inactive|not_in_channel|user_not_found`; WhatsApp error `131026`) → `voiceDigestEnabled = false` + one push `voice_digest_disabled`. WhatsApp `131047` (window closed) → resend as template, not blocked.
- Cost: `SubscriptionsService.recordAdditionalUsage(userId, 'voice_digest', 0.5, accountId)` once per sent digest — audit only, no quota.
- Commands in all three bots: `/digest on`, `/digest off`, `/digest now` (Telegram `/digest …`; WhatsApp and Slack plain `digest on|off|now`). `/digest now` at most once per 24 h (`setIfAbsent('vd:now:{userId}', 86400)`). `on` sets `voiceDigestChannel` to the bot the command came from.
- Opt-in offer after a successful link: one extra line in the link-success message pointing to `/digest on` (deviation from the spec's Yes/No buttons — recorded in the ledger).
- Bot strings shared by 2+ bots go in `common/bot-i18n/shared-messages.ts` (ABA-462), 9 languages.
- No salary / amount values in log lines. `import type` only from `@budget/shared-types`.

## Review Focus

1. A user in `America/New_York` whose Monday 08:00 local is Monday 12:00/13:00 UTC across the DST switch → sent exactly once that week, at local 08:00 both before and after the switch. (Task 3 DST tests.)
2. The narrator writes a number that is right but formatted differently ("1 234,50 zł" for 1234.5) → accepted; a number that is not in the facts ("15%" when the change is 12%) → rejected. (Task 5 tests.)
3. The cron runs twice in the same hour (restart) → the second run sends nothing (lock). (Task 9 test.)
4. A WhatsApp user who wrote an hour ago → no template, audio + text directly; one who wrote 2 days ago → template only, audio sent on "Listen". (Task 8 tests.)
5. A Slack user who uninstalled the app → `channel_not_found` → digest disabled and one push, no retry loop. (Task 8 + Task 9 tests.)

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared-types/src/dto/voice-digest.ts` | `VoiceDigestChannel`, `VoiceDigestSettings`, `UpdateVoiceDigestDto` |
| `packages/shared-types/src/entities/primitives.ts` | `NotificationType` gains `'voice_digest_disabled'` |
| `apps/api/prisma/schema.prisma` + migration `20260928000000_add_voice_digest` | User fields |
| `apps/api/src/modules/voice-digest/digest-schedule.util.ts` | `localParts`, `isDue`, `isoWeekKey` |
| `.../digest-facts.util.ts` | `DigestFacts`, `assembleDigestFacts` |
| `.../digest-text.util.ts` | `fallbackText`, `extractNumbers`, `allowedNumbers`, `isFaithful`, `templateLanguage` |
| `.../voice-digest-facts.service.ts` | Gathers raw inputs |
| `.../voice-digest-narrator.service.ts` | LLM narration + check + fallback |
| `.../tts.service.ts` | OpenAI speech |
| `.../digest-channel.registry.ts` | `DigestSender`, `DigestBlockedError`, `DigestUnavailableError`, registry |
| `.../voice-digest.service.ts` | Orchestrator, `runForUser`, settings get/update |
| `.../voice-digest.cron.ts` | Hourly scan |
| `.../voice-digest.module.ts` | `@Global()` module |
| `apps/api/src/modules/telegram/digest/telegram-digest.sender.ts` | Telegram sender |
| `apps/api/src/modules/whatsapp/digest/whatsapp-digest.sender.ts` | WhatsApp sender + pending "Listen" |
| `apps/api/src/modules/slack/digest/slack-digest.sender.ts` | Slack sender |
| Modify bot command handlers + `shared-messages.ts` + WhatsApp callback router | `/digest`, offer line, `vd--listen` |
| Modify `users.controller.ts` | `GET/PATCH /users/me/voice-digest` |
| `.env.example` | `WHATSAPP_DIGEST_TEMPLATE` |
| `docs/wiki/features/voice-digest.md`, `docs/wiki/index.md`, `docs/wiki/log.md` | Docs |

---

### Task 1: Shared types

**Files:** Create `packages/shared-types/src/dto/voice-digest.ts`; modify `packages/shared-types/src/dto/index.ts` (export it) and `packages/shared-types/src/entities/primitives.ts` (add `'voice_digest_disabled'` to the `NotificationType` union).

- [ ] **Step 1:** Write the types:

```ts
export type VoiceDigestChannel = 'telegram' | 'whatsapp' | 'slack';

export interface VoiceDigestSettings {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday, in the user's time zone. */
  day: number;
  /** 0–23, in the user's time zone. */
  hour: number;
  channel: VoiceDigestChannel | null;
  /** Bots this user has linked — the only valid channel choices. */
  availableChannels: VoiceDigestChannel[];
  /** False when WhatsApp is linked but the digest template is not configured yet. */
  whatsappAvailable: boolean;
}

export interface UpdateVoiceDigestDto {
  enabled?: boolean;
  day?: number;
  hour?: number;
  channel?: VoiceDigestChannel;
}
```

- [ ] **Step 2:** `npx tsc --noEmit -p packages/shared-types` — exit 0. Also `grep -rn "NotificationType" apps/api/src --include=*.ts | grep -n "switch\|Record<NotificationType"` — if an exhaustive `Record<NotificationType, …>` map exists, add the new member there too (e.g. push i18n); note it in the report.
- [ ] **Step 3:** Commit `Add voice digest shared types`.

---

### Task 2: Schema + migration

**Files:** `apps/api/prisma/schema.prisma` (`model User`, after `notifyInflationShield`), `apps/api/prisma/migrations/20260928000000_add_voice_digest/migration.sql`.

- [ ] **Step 1:** Schema lines:

```prisma
  voiceDigestEnabled         Boolean       @default(false) @map("voice_digest_enabled")
  voiceDigestDay             Int           @default(1) @map("voice_digest_day")
  voiceDigestHour            Int           @default(8) @map("voice_digest_hour")
  voiceDigestChannel         String?       @map("voice_digest_channel")
  voiceDigestLastSentAt      DateTime?     @map("voice_digest_last_sent_at")
```
plus, next to the other `@@index`es of `User` (or add one): `@@index([voiceDigestEnabled])`.

- [ ] **Step 2:** Migration SQL:

```sql
-- Voice digest (plan 2026-09-27-voice-digest-api)
ALTER TABLE "users" ADD COLUMN "voice_digest_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "voice_digest_day" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "users" ADD COLUMN "voice_digest_hour" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "users" ADD COLUMN "voice_digest_channel" TEXT;
ALTER TABLE "users" ADD COLUMN "voice_digest_last_sent_at" TIMESTAMP(3);
CREATE INDEX "users_voice_digest_enabled_idx" ON "users"("voice_digest_enabled");
```

- [ ] **Step 3:** `cd apps/api && DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma validate && DATABASE_URL=… npx prisma generate` — valid + generated.
- [ ] **Step 4:** Commit schema + migration together: `Add voice digest user fields with their migration`.

---

### Task 3: Schedule rules (pure)

**Files:** Create `apps/api/src/modules/voice-digest/digest-schedule.util.ts`; test `apps/api/src/modules/voice-digest/__tests__/digest-schedule.util.spec.ts`.

**Produces:**
```ts
export function localParts(now: Date, timeZone: string): { weekday: number; hour: number; date: string /* YYYY-MM-DD */ };
export function isoWeekKey(now: Date, timeZone: string): string;   // e.g. '2026-W40'
export function isDue(input: { now: Date; timeZone: string; day: number; hour: number; lastSentAt: Date | null }): boolean;
export const RESEND_GUARD_MS: number;  // 6 days
```

- [ ] **Step 1: Failing test**

```ts
import { localParts, isoWeekKey, isDue } from '../digest-schedule.util';

describe('localParts', () => {
  it('reads weekday and hour in the user time zone', () => {
    // 2026-09-28 is a Monday. 06:30 UTC = 08:30 in Warsaw (CEST, +2).
    expect(localParts(new Date('2026-09-28T06:30:00Z'), 'Europe/Warsaw')).toEqual({ weekday: 1, hour: 8, date: '2026-09-28' });
  });
  it('falls back to UTC for an invalid zone', () => {
    expect(localParts(new Date('2026-09-28T06:30:00Z'), 'Not/AZone')).toEqual({ weekday: 1, hour: 6, date: '2026-09-28' });
  });
  it('handles a date line crossing', () => {
    // Sunday 23:30 UTC is Monday 12:30 in Auckland (NZDT, +13).
    expect(localParts(new Date('2026-10-04T23:30:00Z'), 'Pacific/Auckland').weekday).toBe(1);
  });
});

describe('isoWeekKey', () => {
  it('uses the local date', () => {
    expect(isoWeekKey(new Date('2026-09-28T06:30:00Z'), 'Europe/Warsaw')).toBe('2026-W40');
    // 2027-01-01 is a Friday → ISO week 53 of 2026
    expect(isoWeekKey(new Date('2027-01-01T12:00:00Z'), 'UTC')).toBe('2026-W53');
  });
});

describe('isDue', () => {
  const base = { timeZone: 'Europe/Warsaw', day: 1, hour: 8, lastSentAt: null };
  it('is due in the chosen local hour of the chosen weekday', () => {
    expect(isDue({ ...base, now: new Date('2026-09-28T06:05:00Z') })).toBe(true);
    expect(isDue({ ...base, now: new Date('2026-09-28T07:05:00Z') })).toBe(false);
    expect(isDue({ ...base, now: new Date('2026-09-29T06:05:00Z') })).toBe(false);
  });
  it('is not due within 6 days of the last send', () => {
    expect(isDue({ ...base, now: new Date('2026-09-28T06:05:00Z'), lastSentAt: new Date('2026-09-23T06:05:00Z') })).toBe(false);
    expect(isDue({ ...base, now: new Date('2026-09-28T06:05:00Z'), lastSentAt: new Date('2026-09-21T06:05:00Z') })).toBe(true);
  });
  it('follows local time across a DST switch (New York)', () => {
    const ny = { timeZone: 'America/New_York', day: 1, hour: 8, lastSentAt: null };
    // Mon 2026-10-26 08:00 EDT = 12:00 UTC; Mon 2026-11-02 08:00 EST = 13:00 UTC
    expect(isDue({ ...ny, now: new Date('2026-10-26T12:10:00Z') })).toBe(true);
    expect(isDue({ ...ny, now: new Date('2026-11-02T12:10:00Z') })).toBe(false);
    expect(isDue({ ...ny, now: new Date('2026-11-02T13:10:00Z') })).toBe(true);
  });
});
```

- [ ] **Step 2:** Run — FAIL (module missing).
- [ ] **Step 3: Implement**

```ts
export const RESEND_GUARD_MS = 6 * 24 * 60 * 60 * 1000;

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return timeZone;
  } catch {
    return 'UTC';
  }
}

export function localParts(now: Date, timeZone: string): { weekday: number; hour: number; date: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone(timeZone), weekday: 'short', hour: 'numeric', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    weekday: WEEKDAYS[parts.weekday as string],
    hour: Number(parts.hour) % 24,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** ISO-8601 week of the user's LOCAL date — the lock key, one digest per local week. */
export function isoWeekKey(now: Date, timeZone: string): string {
  const [y, m, d] = localParts(now, timeZone).date.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this week
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function isDue(input: { now: Date; timeZone: string; day: number; hour: number; lastSentAt: Date | null }): boolean {
  if (input.lastSentAt && input.now.getTime() - input.lastSentAt.getTime() < RESEND_GUARD_MS) return false;
  const p = localParts(input.now, input.timeZone);
  return p.weekday === input.day && p.hour === input.hour;
}
```

- [ ] **Step 4:** Run — PASS. Lint the two files.
- [ ] **Step 5:** Commit `Add the voice digest schedule rules`.

---

### Task 4: Facts assembly (pure)

**Files:** Create `.../digest-facts.util.ts`; test `.../__tests__/digest-facts.util.spec.ts`.

**Produces:**
```ts
export interface DigestInputs {
  currency: string;
  weekTotal: number;                       // last 7 days, base currency
  priorWeekTotals: number[];               // up to 8 previous 7-day windows, newest first; 0 for an empty week
  categoryWeek: { name: string; total: number }[];     // last 7 days by category
  categoryUsual: { name: string; total: number }[];    // mean per 7 days over the prior 8 windows
  safeToSpendToday: number | null;
  daysToIncome: number | null;
  shieldItem: { name: string; monthlyChangePct: number } | null;
  restockNames: string[];
  realChangePct: number | null;
}
export interface DigestFacts {
  currency: string;
  weekTotal: number;
  usualWeek: number | null;          // null when fewer than 4 prior weeks had spending
  changePct: number | null;          // week vs usual, integer percent
  topRise: { category: string; changePct: number } | null;
  safeToSpendToday: number | null;
  daysToIncome: number | null;
  shieldItem: { name: string; monthlyChangePct: number } | null;
  restock: string[];                 // at most 3
  realChangePct: number | null;
}
export function assembleDigestFacts(i: DigestInputs): DigestFacts | null;
```

Rules: `weekTotal <= 0` → null. `usualWeek` = mean of `priorWeekTotals` counting only weeks with spend > 0, and only if ≥ 4 such weeks; rounded to whole units. `changePct` = round((weekTotal/usualWeek − 1)·100). `topRise` = the category with the largest positive change among those whose usual ≥ 5 % of `usualWeek` and whose week total ≥ 1.2 × usual; `changePct` integer. Amounts rounded to whole units; percentages to integers; `safeToSpendToday` to whole units; `restock` first 3 names.

- [ ] **Step 1: Failing test** (cover: null on empty week; usual/change with 5 active prior weeks; null usual with 3; topRise picks the biggest qualifying rise and ignores a tiny category; restock capped at 3; rounding).

```ts
import { assembleDigestFacts, type DigestInputs } from '../digest-facts.util';

const base: DigestInputs = {
  currency: 'PLN', weekTotal: 820, priorWeekTotals: [900, 950, 0, 930, 960, 940],
  categoryWeek: [{ name: 'Groceries', total: 420 }, { name: 'Coffee', total: 40 }, { name: 'Transport', total: 200 }],
  categoryUsual: [{ name: 'Groceries', total: 300 }, { name: 'Coffee', total: 10 }, { name: 'Transport', total: 210 }],
  safeToSpendToday: 64.4, daysToIncome: 5,
  shieldItem: { name: 'Mleko 3,2% 1L', monthlyChangePct: 4.26 },
  restockNames: ['milk', 'bread', 'eggs', 'coffee'], realChangePct: -3.04,
};

describe('assembleDigestFacts', () => {
  it('returns null for a week without spending', () => {
    expect(assembleDigestFacts({ ...base, weekTotal: 0 })).toBeNull();
  });
  it('computes the usual week from active prior weeks only', () => {
    const f = assembleDigestFacts(base)!;
    expect(f.usualWeek).toBe(936);          // mean of 900,950,930,960,940
    expect(f.changePct).toBe(-12);          // 820/936 - 1 = -12.4 %
  });
  it('has no usual week with fewer than 4 active prior weeks', () => {
    const f = assembleDigestFacts({ ...base, priorWeekTotals: [900, 0, 950, 0, 930] })!;
    expect(f.usualWeek).toBeNull();
    expect(f.changePct).toBeNull();
  });
  it('reports the biggest real rise, ignoring tiny categories', () => {
    expect(assembleDigestFacts(base)!.topRise).toEqual({ category: 'Groceries', changePct: 40 });
  });
  it('rounds and caps the rest', () => {
    const f = assembleDigestFacts(base)!;
    expect(f.safeToSpendToday).toBe(64);
    expect(f.shieldItem).toEqual({ name: 'Mleko 3,2% 1L', monthlyChangePct: 4 });
    expect(f.restock).toEqual(['milk', 'bread', 'eggs']);
    expect(f.realChangePct).toBe(-3);
  });
});
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** implement per the rules above. **Step 4:** PASS + lint. **Step 5:** Commit `Assemble voice digest facts`.

---

### Task 5: Text rules (pure) — fallback text, number check, template language

**Files:** Create `.../digest-text.util.ts`; test `.../__tests__/digest-text.util.spec.ts`.

**Produces:**
```ts
export const DIGEST_LANGS: readonly string[];            // en pl de es fr ru ua be nl
export function fallbackText(f: DigestFacts, lang: string): string;
export function extractNumbers(text: string): number[];
export function allowedNumbers(f: DigestFacts): number[];
export function isFaithful(text: string, f: DigestFacts): boolean;
export function templateLanguage(lang: string): string;  // WhatsApp template locale
```

Rules:
- `fallbackText`: short sentences in the user's language, only facts that are present, in this order: week total (+ "N% below/above usual" when `changePct` ≠ null and ≠ 0), top rise, safe to spend today (+ "until payday in N days"), shield item, restock ("running low: a, b, c"), real salary. Amounts as `${Math.round(x)} ${currency}`; percentages as `${Math.abs(n)}%` with the direction in words. Unknown language → English. Write all 9 languages (sentence templates per language; no pluralisation tricks — phrase counts so they read correctly for any number, e.g. "until payday: 5 days" style).
- `extractNumbers`: remove spaces/NBSP/narrow-NBSP between digits, then match `\d+(?:[.,]\d+)*`; convert with the same rules as the mobile `parseMonthlyAmount` (both separators → last is decimal; a single separator followed by exactly 3 digits → thousands; otherwise decimal). Ignore `%` and currency signs.
- `allowedNumbers`: every numeric fact (weekTotal, usualWeek, |changePct|, topRise.changePct, safeToSpendToday, daysToIncome, |shieldItem.monthlyChangePct|, |realChangePct|, restock.length) plus 7 (a week) and 1.
- `isFaithful`: true iff every extracted number is within 0.5 of some allowed number.
- `templateLanguage`: `ua` → `uk`, `be` → `ru`, others unchanged, unknown → `en`.

- [ ] **Step 1: Failing test** — include: fallback text in `en` contains "820 PLN" and "12%" and "below"; `pl` differs from `en` and contains "820 PLN"; every DIGEST_LANG produces non-empty text; a facts object with only `weekTotal` produces one sentence; `extractNumbers('Wydałeś 1 234,50 zł, czyli 12% mniej')` → `[1234.5, 12]`; `isFaithful('You spent 820 PLN, 12% below usual. 64 PLN a day for 5 days.', facts)` → true; `isFaithful('You spent 820 PLN, 15% below usual.', facts)` → false; `isFaithful('Spent 1.234,5 PLN', {...facts, weekTotal: 1234.5})` → true; `templateLanguage('ua')` → 'uk', `('be')` → 'ru', `('xx')` → 'en'.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS + lint. **Step 5:** Commit `Add voice digest text rules`.

---

### Task 6: Facts service (IO)

**Files:** Create `.../voice-digest-facts.service.ts`; test `.../__tests__/voice-digest-facts.service.spec.ts`.

**Consumes:** `PrismaService`; `ExchangeRateService` + `getRatesSafe`/`convertAmount` (`common/utils/fx.ts`); `attributeToCategories` (`common/utils/category-attribution.ts`); `SafeToSpendService.compute(accountId, userId, base)` (`safeToSpendToday`, `breakdown.daysRemaining`, `incomeInferred`); `InflationShieldService.getShield(accountId, userId, base)` (first item with `monthlyChangePct > 0`, largest first); `ShoppingListService.getRestockSuggestions(accountId)` (`canonicalName`); `RealSalaryService.compute(accountId, userId, base)` (`status === 'ready'` → `realChangePct`). Every external call is wrapped: a failure yields `null`/empty for that fact, never an exception.

**Produces:** `VoiceDigestFactsService.gather(accountId, userId, baseCurrency, now): Promise<DigestInputs>`.

Spend queries: one `expense.findMany` for the last 63 days (`accountId`, `isDeleted:false, isDebt:false, isDebtRepayment:false, isPlanned:false, isSplitReceivable:false`, `date >= now-63d`) selecting amount, currencyCode, date, categoryId, category name, live categorySplits with their category names; bucket into 9 windows of 7 days ending at `now`; FX-convert each attributed part; unknown rate → skipped. `daysToIncome` = `incomeInferred ? breakdown.daysRemaining : null`.

`RealSalaryService` is not exported by `InsightsModule` today — export it (modify `insights.module.ts` `exports`).

- [ ] Tests with stubs (like `real-salary.service.spec.ts`): windows bucket correctly at the edges; a split expense counts by its split categories; an unconvertible expense is skipped; a failing shield call yields `shieldItem: null` and the rest still arrives; the Prisma where has every exclusion.
- [ ] Commit `Gather the voice digest facts from existing insights`.

---

### Task 7: Narrator + TTS

**Files:** Create `.../voice-digest-narrator.service.ts`, `.../tts.service.ts`; tests for both.

**Narrator** `narrate(facts, lang): Promise<{ text: string; usedModel: boolean }>` — `CHEAP_MODEL`, temperature 0.3, `max_tokens: 350`, OpenAI client `timeout: 15_000, maxRetries: 0`; system prompt: friendly spoken summary in the given language, ≤ 130 words, **use only the numbers given, exactly as given, no other numbers**, no advice beyond the facts, no greetings with the user's name; user message = the facts JSON. If the call throws, returns empty, exceeds 1200 characters, or `!isFaithful(text, facts)` → `{ text: fallbackText(facts, lang), usedModel: false }`. Same constructor shape as `CoicopClassifierService` (optional injected client for tests).

**TTS** `synthesize(text, lang): Promise<Buffer | null>` — `openai.audio.speech.create({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: text, response_format: 'opus' })` → `Buffer.from(await res.arrayBuffer())`; any error → `Logger.warn` + `null`; input capped at 1500 characters. Timeout 30 s, no retries.

- [ ] Tests: faithful model text returned; unfaithful → fallback; model error → fallback; TTS returns a Buffer from the fake client; TTS error → null; the prompt contains the facts JSON and no user id/name.
- [ ] Commit `Narrate and voice the weekly digest`.

---

### Task 8: Channel registry + three senders

**Files:**
- Create `.../digest-channel.registry.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { VoiceDigestChannel } from '@budget/shared-types';

export class DigestBlockedError extends Error {}      // the user blocked / removed the bot
export class DigestUnavailableError extends Error {}  // channel not usable now (e.g. no template configured)

export interface DigestPayload { userId: string; lang: string; text: string; audio: Buffer | null }

export interface DigestSender {
  readonly channel: VoiceDigestChannel;
  /** Resolves 'sent' (text/voice delivered) or 'template' (WhatsApp waiting for "Listen"). */
  send(payload: DigestPayload): Promise<'sent' | 'template'>;
  /** True when this user has an active link on this channel. */
  isLinked(userId: string): Promise<boolean>;
}

@Injectable()
export class DigestChannelRegistry {
  private readonly senders = new Map<VoiceDigestChannel, DigestSender>();
  register(sender: DigestSender): void { this.senders.set(sender.channel, sender); }
  get(channel: VoiceDigestChannel): DigestSender | undefined { return this.senders.get(channel); }
  channels(): VoiceDigestChannel[] { return [...this.senders.keys()]; }
}
```

- **Telegram** `apps/api/src/modules/telegram/digest/telegram-digest.sender.ts` (provider in `TelegramModule`, `OnModuleInit` → `registry.register(this)`): add to `TelegramBotService` a public `sendDigest(chatId: string, audio: Buffer | null, text: string)` using `this.bot.telegram.sendVoice(chatId, { source: audio, filename: 'digest.ogg' })` then `sendMessage(chatId, text)`; bot not started → throw `DigestUnavailableError`. The sender resolves the link via `TelegramLinkService.getLinkByUserId(userId)` (chat id = `telegramUserId`); no link → `DigestUnavailableError`; a Telegraf error with `response.error_code === 403` → `DigestBlockedError`.
- **WhatsApp** `apps/api/src/modules/whatsapp/digest/whatsapp-digest.sender.ts` (provider in `WhatsAppModule`, registers on init). Add to `WhatsAppClientService`: `uploadMedia(buffer, mimeType, filename): Promise<string>` (multipart POST `${baseUrl}/media` with `messaging_product=whatsapp`, returns `id`), `sendAudio(to, mediaId)`, `sendTemplate(to, name, languageCode, quickReplyPayload)` (type `template`, one `button` component `sub_type: 'quick_reply'`, index `'0'`, parameter `{ type: 'payload', payload }`). Make the client's `post` surface the Graph error code (throw an Error with `.code`). Sender logic: link by `WhatsAppLinkService.getLinkByUserId`; `lastInboundAt` within 23 h → deliver now (upload + audio if any, then text) → 'sent'; else if `WHATSAPP_DIGEST_TEMPLATE` unset → `DigestUnavailableError`; else store `{ text, audioB64 }` in Redis `wa:vd:{userId}` TTL 172800 and send the template (`templateLanguage(lang)`, payload `vd--listen`) → 'template'. Graph code 131026 → `DigestBlockedError`; 131047 on a direct send → fall back to the template path. Public `deliverPending(userId): Promise<boolean>` reads + deletes the Redis entry and delivers it (false when expired).
- **Slack** `apps/api/src/modules/slack/digest/slack-digest.sender.ts` (provider in `SlackModule`, registers on init). Add to `SlackClientService`: `openDm(teamId, slackUserId): Promise<string>` (`conversations.open({ users })` → channel id) and `uploadAudio(teamId, channelId, audio, text)` (`files.uploadV2({ channel_id, file: audio, filename: 'digest.ogg', initial_comment: text })`). Sender: link via `SlackLinkService.getLinkByUserId`; audio → upload with the text as the comment; no audio → `sendText`. Slack error codes `channel_not_found|is_archived|account_inactive|not_in_channel|user_not_found|invalid_auth|token_revoked` → `DigestBlockedError`.

Check first (and adapt to the real code, stating it in the report): the exact return shape of each `getLinkByUserId`; whether `WhatsAppClientService.post` already parses Graph errors; the Slack `WebClient` error shape (`e.data.error`).

- [ ] Tests (mocked clients): Telegram 403 → blocked; Telegram success sends voice then text; WhatsApp inside the window → media upload + audio + text, no template; outside → Redis set + template with payload `vd--listen` and language `uk` for `ua`; template env unset → unavailable; 131047 on direct send → template; 131026 → blocked; `deliverPending` sends once and then returns false; Slack `channel_not_found` → blocked; Slack no audio → sendText.
- [ ] Commit `Send the weekly digest through Telegram, WhatsApp and Slack`.

---

### Task 9: Orchestrator + cron

**Files:** Create `.../voice-digest.service.ts`, `.../voice-digest.cron.ts`, `.../voice-digest.module.ts` (`@Global()`; imports `InsightsModule`, `ShoppingListModule`, `SubscriptionsModule`, `CurrencyExchangeModule`, `ConfigModule`; providers: registry, facts, narrator, tts, service, cron; exports: registry, service); register in `app.module.ts`. Tests for service + cron.

**Produces:**
```ts
type DigestOutcome = 'sent' | 'template' | 'empty' | 'encrypted' | 'no_channel' | 'unavailable' | 'blocked' | 'failed';
VoiceDigestService.runForUser(userId: string, opts?: { force?: boolean; now?: Date }): Promise<DigestOutcome>;
VoiceDigestService.getSettings(userId): Promise<VoiceDigestSettings>;
VoiceDigestService.updateSettings(userId, dto: UpdateVoiceDigestDto): Promise<VoiceDigestSettings>;   // validates day 0–6, hour 0–23, channel ∈ availableChannels
VoiceDigestService.enableFrom(userId, channel): Promise<void>;
VoiceDigestService.disable(userId): Promise<void>;
VoiceDigestCron.run(now?: Date): Promise<number>;   // @Cron('5 * * * *'), returns digests attempted
```

`runForUser`: load user (timezone, language, currencyCode, channel); channel sender missing or `!isLinked` → `no_channel`; account = the channel link's `defaultAccountId` (sender exposes `accountIdFor(userId)` — add it to the interface); account tier ≥ 2 → `encrypted`; `gather` → `assembleDigestFacts` → null → `empty`; `narrate`; `synthesize`; `send`; on 'sent'/'template' → set `voiceDigestLastSentAt = now` and `recordAdditionalUsage(userId, 'voice_digest', 0.5, accountId)`; `DigestBlockedError` → `voiceDigestEnabled=false` + `notificationsService.sendToUser(userId, t, b, { type: 'voice_digest_disabled' }, 'voice_digest_disabled')` (localised title/body in 9 languages in this module) → `blocked`; `DigestUnavailableError` → `unavailable` (no state change); anything else → `failed` (`logFireAndForget`-style warn, no amounts).
Cron: `paginateById` over users with `voiceDigestEnabled: true` and `lastSentAt null or < now-6d`, selecting id/timezone/day/hour/lastSentAt; for each `isDue` → `setIfAbsent('vd:' + id + ':' + isoWeekKey(now, tz), 8*86400)` → `runForUser`; one user's failure never stops the run.

- [ ] Tests: happy path sets lastSentAt and records usage once; empty week → no send, lastSentAt untouched; blocked → disabled + push; unavailable → no change; the cron skips a user whose lock is taken and runs one whose lock is free; a throwing user does not stop the next.
- [ ] Commit `Run the weekly voice digest from an hourly cron`.

---

### Task 10: Bot commands, offer line, WhatsApp "Listen"

**Files:** the three bots' command handlers and dispatchers (`telegram-bot.service.ts` command registration + `CommandHandler`; `whatsapp-bot.service.ts` `parseCommand` switch + `routeCallback` prefix `vd`; `slack-bot.service.ts` command switch), `common/bot-i18n/shared-messages.ts`, and each bot's link-success message (append the offer line).

Behaviour:
- `digest on` → `VoiceDigestService.enableFrom(userId, '<this bot>')` → reply `digestOn` with the current day/hour (e.g. "Every Monday at 08:00 your time. Change it in the app: Settings → Chat bots.").
- `digest off` → `disable` → reply `digestOff`.
- `digest now` → `setIfAbsent('vd:now:' + userId, 86400)`; taken → reply `digestNowLimit`; else reply `digestPreparing`, then `runForUser(userId, { force: true })` and, for outcome `empty` → `digestEmpty`, `unavailable` → `digestUnavailable`.
- Viewer role is allowed (read-only).
- WhatsApp `routeCallback` prefix `vd` payload `listen` → `WhatsAppDigestSender.deliverPending(userId)`; false → reply `digestExpired`.
- Link-success message in each bot gains `digestOffer` ("Tip: get a short voice summary every week — send /digest on" / "digest on").
- New shared keys (9 languages each): `digestOn` (params `{{day}}`, `{{hour}}`), `digestOff`, `digestNowLimit`, `digestPreparing`, `digestEmpty`, `digestUnavailable`, `digestExpired`, `digestOffer` (param `{{command}}`: `/digest on` for Telegram, `digest on` for the others), and the 7 weekday names `weekday0..weekday6`.
- `/help` texts of each bot list the new command.

- [ ] Tests: follow each bot's existing handler spec style — one test per command in one bot (Telegram) with a mocked `VoiceDigestService`, plus the WhatsApp `vd--listen` route; shared-message key parity test if one exists.
- [ ] Commit `Add digest commands to the Telegram, WhatsApp and Slack bots`.

---

### Task 11: Settings API + env

**Files:** `apps/api/src/modules/users/users.controller.ts` (`GET /users/me/voice-digest`, `PATCH /users/me/voice-digest` — JwtAuthGuard, user-level, no account scoping; body validated: `enabled` boolean, `day` 0–6, `hour` 0–23, `channel` ∈ settings.availableChannels else 400); `.env.example` (`WHATSAPP_DIGEST_TEMPLATE=` with a comment: the approved template name; unset disables WhatsApp digests); a DI smoke test compiling `VoiceDigestModule` providers with stubbed externals (same approach as `real-salary.di.spec.ts`).
- [ ] Verify: `npx tsc --noEmit`; `npx jest src/modules/voice-digest src/modules/users src/modules/telegram src/modules/whatsapp src/modules/slack`; eslint on touched files; `bash scripts/check-no-shared-utils-runtime-import.sh`.
- [ ] Commit `Expose voice digest settings to the app`.

---

### Task 12: Wiki

**Files:** `docs/wiki/features/voice-digest.md` (new; What this is / Entry points / Key concepts / Invariants / Known gaps / History), `docs/wiki/index.md` (link under the bots hub), `docs/wiki/slack-bot.md` (one related link), `docs/wiki/log.md` (one line, `ABA-TBD` placeholder). Invariants: opt-in only; schedule in local time with the 6-day guard and the weekly lock; numbers checked or fallback; text always sent; WhatsApp window vs template, `be`→`ru`/`ua`→`uk`; blocked → disabled + one push; cost audit-only; registry pattern (no import cycle). Known gaps: WhatsApp template must be approved in Meta before `WHATSAPP_DIGEST_TEMPLATE` is set; no in-app player; no daily variant.
- [ ] `python scripts/wiki-lint.py` — no voice-digest finding. Commit `Document the voice digest in the wiki`.
