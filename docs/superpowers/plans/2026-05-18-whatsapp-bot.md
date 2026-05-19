# WhatsApp Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a WhatsApp bot mirroring the existing Telegram bot's feature set (chat, voice, OCR, expense/income/category, account linking, 8-language i18n) via the official WhatsApp Business Cloud API.

**Architecture:** New parallel NestJS module `apps/api/src/modules/whatsapp/` whose handlers call the same shared services as Telegram (`ChatService`, `WhisperService`, `OcrService`, `ExpensesService`, `IncomesService`, `CategoriesService`, `SubscriptionsService`). Link-code endpoints live on `UsersController` (mirror Telegram precedent). Webhook excluded from `/api/v1` prefix; HMAC-SHA256 verified via globally-available `req.rawBody`. Pending-action state in Redis. Mobile gets a new `settings/whatsapp.tsx` screen with QR + `wa.me` deep link.

**Tech Stack:** NestJS 10, Prisma 5 (PostgreSQL), `ioredis` (already installed), `fetch` (built-in, no new npm dep for Graph API), Jest for tests, React Native + Expo (mobile), `react-native-qrcode-svg` (new mobile dep).

**Spec:** [docs/superpowers/specs/2026-05-18-whatsapp-bot-design.md](../specs/2026-05-18-whatsapp-bot-design.md)

**Out of scope (v2):** persistent commands menu (Business Profile API), per-user proactive notifications (templates), Telegram bot pending-actions Redis migration (tracked separately — see Task 30), PDF/non-image documents, Prometheus metrics.

**Commit message convention:** Prefix every commit with the GitHub issue id once it's created (e.g., `ABA-150: feat(whatsapp): add parseCommand helper`). Until the issue exists, use `feat(whatsapp): ...` and rebase-rewrite later if needed. Per user's memory, every task ships with an issue.

---

## File map

### Backend (`apps/api/`)

| Status | Path | Responsibility |
|---|---|---|
| Modify | `prisma/schema.prisma` | Add `WhatsAppLink` + `WhatsAppLinkCode` models; add inverse refs to `User` and `Account` |
| Modify | `src/main.ts` | Add `whatsapp/webhook` to global-prefix exclude list |
| Modify | `src/app.module.ts` | Register `WhatsAppModule` |
| Modify | `src/modules/users/users.controller.ts` | Add 3 endpoints under `me/whatsapp-link[-code]` |
| Create | `src/modules/whatsapp/whatsapp.module.ts` | `@Global()` module declaration |
| Create | `src/modules/whatsapp/whatsapp-bot.controller.ts` | `GET/POST /whatsapp/webhook` |
| Create | `src/modules/whatsapp/whatsapp-bot.service.ts` | Dispatch inbound messages to handlers; lifecycle hooks |
| Create | `src/modules/whatsapp/whatsapp-client.service.ts` | Graph API wrapper: `sendText`, `sendButtons`, `sendList`, `downloadMedia` |
| Create | `src/modules/whatsapp/whatsapp-link.service.ts` | Link-code CRUD (mirror `TelegramLinkService`) |
| Create | `src/modules/whatsapp/types.ts` | `WhatsAppUserState`, payload interfaces |
| Create | `src/modules/whatsapp/handlers/command.handler.ts` | `link`, `help`, `unlink`, `account`, `newchat`, `usage` |
| Create | `src/modules/whatsapp/handlers/chat.handler.ts` | Free-form text → AI; confirm/cancel buttons |
| Create | `src/modules/whatsapp/handlers/expense.handler.ts` | `expense 50 lunch` / implicit `50 lunch` |
| Create | `src/modules/whatsapp/handlers/income.handler.ts` | `income 3000 salary` |
| Create | `src/modules/whatsapp/handlers/category.handler.ts` | Create/list/delete categories |
| Create | `src/modules/whatsapp/handlers/voice.handler.ts` | Voice note → Whisper → ChatHandler |
| Create | `src/modules/whatsapp/handlers/photo.handler.ts` | Image → OCR → expense; date-change flow |
| Create | `src/modules/whatsapp/helpers/i18n.ts` | Copy of telegram helper with HTML → WA markdown |
| Create | `src/modules/whatsapp/helpers/format-whatsapp.ts` | Markdown → WA-flavored text |
| Create | `src/modules/whatsapp/helpers/parse-command.ts` | `parseCommand(text)` |
| Create | `src/modules/whatsapp/helpers/parse-amount.ts` | Copy from telegram |
| Create | `src/modules/whatsapp/helpers/resolve-account.ts` | Copy from telegram |
| Create | `src/modules/whatsapp/helpers/download-media.ts` | 2-step Graph API media fetch |
| Create | `src/modules/whatsapp/helpers/verify-signature.ts` | HMAC-SHA256 verify |
| Create | `.env.example` (modify) | 7 new env vars (documented) |

**Tests (alongside source):**
- `src/modules/whatsapp/helpers/parse-command.spec.ts`
- `src/modules/whatsapp/helpers/format-whatsapp.spec.ts`
- `src/modules/whatsapp/helpers/verify-signature.spec.ts`
- `src/modules/whatsapp/whatsapp-link.service.spec.ts`
- `src/modules/whatsapp/whatsapp-bot.controller.spec.ts` (verify-token handshake + signature rejection)

### Mobile (`apps/mobile/`)

| Status | Path | Responsibility |
|---|---|---|
| Modify | `package.json` | Add `react-native-qrcode-svg` |
| Modify | `src/services/api.ts` | 3 new methods |
| Create | `app/settings/whatsapp.tsx` | QR + wa.me link + status |
| Modify | `app/settings/index.tsx` | Add "WhatsApp Bot" row |
| Modify | `src/i18n/locales/{en,de,es,fr,pl,ru,ua,be}.ts` | 8 new keys × 8 files |

---

## Task list

### Task 1: Prisma schema — add WhatsApp link models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add inverse relations to `User` model**

In `model User { ... }`, alongside existing telegram refs (~line 152-153), add:

```prisma
whatsappLink       WhatsAppLink?
whatsappLinkCodes  WhatsAppLinkCode[]
```

- [ ] **Step 2: Add inverse relation to `Account` model**

In `model Account { ... }`, alongside existing `telegramLinks` ref (~line 200), add:

```prisma
whatsappLinks      WhatsAppLink[]
```

- [ ] **Step 3: Add the two new models at the end of the schema (after `TelegramLinkCode`)**

```prisma
model WhatsAppLink {
  id               String   @id @default(uuid())
  waPhoneNumber    String   @unique @map("wa_phone_number")
  waProfileName    String?  @map("wa_profile_name")
  userId           String   @unique @map("user_id")
  defaultAccountId String   @map("default_account_id")
  conversationId   String?  @map("conversation_id")
  isActive         Boolean  @default(true) @map("is_active")
  lastInboundAt    DateTime? @map("last_inbound_at")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  account Account @relation(fields: [defaultAccountId], references: [id], onDelete: Cascade)

  @@map("whatsapp_links")
}

model WhatsAppLinkCode {
  id        String    @id @default(uuid())
  userId    String    @map("user_id")
  accountId String    @map("account_id")
  code      String    @unique
  expiresAt DateTime  @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([code])
  @@index([userId])
  @@map("whatsapp_link_codes")
}
```

- [ ] **Step 4: Create and apply migration**

```
cd apps/api && npx prisma migrate dev --name add_whatsapp_link
```

Expected output: migration files generated, applied to local DB, `prisma generate` runs automatically.

- [ ] **Step 5: Verify Prisma client compiles**

```
cd apps/api && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(api): add WhatsAppLink + WhatsAppLinkCode prisma models"
```

---

### Task 2: Update main.ts global-prefix exclude

**Files:**
- Modify: `apps/api/src/main.ts:24`

- [ ] **Step 1: Add `whatsapp/webhook` to the exclude list**

Replace:
```ts
app.setGlobalPrefix('api/v1', {
  exclude: ['webhooks/stripe', 'telegram/webhook'],
});
```
with:
```ts
app.setGlobalPrefix('api/v1', {
  exclude: ['webhooks/stripe', 'telegram/webhook', 'whatsapp/webhook'],
});
```

- [ ] **Step 2: Verify typecheck**

```
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): exclude whatsapp/webhook from /api/v1 prefix"
```

---

### Task 3: Helpers — parse-command (TDD)

**Files:**
- Create: `apps/api/src/modules/whatsapp/helpers/parse-command.ts`
- Test: `apps/api/src/modules/whatsapp/helpers/parse-command.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// parse-command.spec.ts
import { parseCommand } from './parse-command';

describe('parseCommand', () => {
  it('recognizes commands with leading slash', () => {
    expect(parseCommand('/help')).toEqual({ command: 'help', args: '' });
    expect(parseCommand('/expense 50 lunch')).toEqual({ command: 'expense', args: '50 lunch' });
  });

  it('recognizes commands without leading slash', () => {
    expect(parseCommand('help')).toEqual({ command: 'help', args: '' });
    expect(parseCommand('expense 50 lunch')).toEqual({ command: 'expense', args: '50 lunch' });
  });

  it('treats leading number as implicit expense', () => {
    expect(parseCommand('50 lunch')).toEqual({ command: 'expense', args: '50 lunch' });
    expect(parseCommand('12.5 coffee')).toEqual({ command: 'expense', args: '12.5 coffee' });
  });

  it('case-insensitive command keyword', () => {
    expect(parseCommand('HELP')).toEqual({ command: 'help', args: '' });
    expect(parseCommand('/Income 3000')).toEqual({ command: 'income', args: '3000' });
  });

  it('returns null for non-command free text', () => {
    expect(parseCommand('how much did I spend on food?')).toBeNull();
    expect(parseCommand('hello bot')).toBeNull();
  });

  it('recognizes link command (case-insensitive code)', () => {
    expect(parseCommand('link A3K9F2')).toEqual({ command: 'link', args: 'A3K9F2' });
    expect(parseCommand('LINK abc123')).toEqual({ command: 'link', args: 'abc123' });
  });

  it('trims whitespace', () => {
    expect(parseCommand('  /help  ')).toEqual({ command: 'help', args: '' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd apps/api && npx jest parse-command.spec.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `parse-command.ts`**

```ts
const COMMANDS = [
  'expense', 'income', 'help', 'unlink', 'account', 'menu',
  'newchat', 'usage', 'category', 'categories', 'link',
];

const NUMBER_RE = /^\d+([.,]\d+)?/;

export interface ParsedCommand {
  command: string;
  args: string;
}

export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const stripped = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  const firstWord = stripped.split(/\s+/)[0].toLowerCase();

  if (COMMANDS.includes(firstWord)) {
    return {
      command: firstWord,
      args: stripped.slice(stripped.split(/\s+/)[0].length).trim(),
    };
  }

  if (NUMBER_RE.test(firstWord)) {
    return { command: 'expense', args: stripped };
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
cd apps/api && npx jest parse-command.spec.ts
```
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp/helpers/parse-command.ts apps/api/src/modules/whatsapp/helpers/parse-command.spec.ts
git commit -m "feat(whatsapp): add parseCommand helper"
```

---

### Task 4: Helpers — verify-signature (TDD)

**Files:**
- Create: `apps/api/src/modules/whatsapp/helpers/verify-signature.ts`
- Test: `apps/api/src/modules/whatsapp/helpers/verify-signature.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// verify-signature.spec.ts
import { createHmac } from 'crypto';
import { verifySignature } from './verify-signature';

const SECRET = 'test_app_secret';
const RAW = Buffer.from('{"foo":"bar"}', 'utf-8');
const VALID_SIG = 'sha256=' + createHmac('sha256', SECRET).update(RAW).digest('hex');

describe('verifySignature', () => {
  it('accepts a valid signature', () => {
    expect(verifySignature(RAW, VALID_SIG, SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = Buffer.from('{"foo":"baz"}', 'utf-8');
    expect(verifySignature(tampered, VALID_SIG, SECRET)).toBe(false);
  });

  it('rejects a malformed header (no sha256= prefix)', () => {
    const noPrefix = VALID_SIG.replace('sha256=', '');
    expect(verifySignature(RAW, noPrefix, SECRET)).toBe(false);
  });

  it('rejects an empty signature header', () => {
    expect(verifySignature(RAW, '', SECRET)).toBe(false);
    expect(verifySignature(RAW, undefined as any, SECRET)).toBe(false);
  });

  it('rejects a signature signed with a different secret', () => {
    const wrongSig = 'sha256=' + createHmac('sha256', 'wrong_secret').update(RAW).digest('hex');
    expect(verifySignature(RAW, wrongSig, SECRET)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd apps/api && npx jest verify-signature.spec.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `verify-signature.ts`**

```ts
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies the X-Hub-Signature-256 header on an inbound WhatsApp webhook.
 * Returns false for any malformed input — never throws.
 */
export function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const actualHex = signatureHeader.slice('sha256='.length);

  if (expected.length !== actualHex.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actualHex, 'hex'));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
cd apps/api && npx jest verify-signature.spec.ts
```
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp/helpers/verify-signature.ts apps/api/src/modules/whatsapp/helpers/verify-signature.spec.ts
git commit -m "feat(whatsapp): add HMAC signature verification helper"
```

---

### Task 5: Helpers — format-whatsapp (TDD)

**Files:**
- Create: `apps/api/src/modules/whatsapp/helpers/format-whatsapp.ts`
- Test: `apps/api/src/modules/whatsapp/helpers/format-whatsapp.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { markdownToWhatsApp } from './format-whatsapp';

describe('markdownToWhatsApp', () => {
  it('converts **bold** to *bold*', () => {
    expect(markdownToWhatsApp('Hello **world**')).toBe('Hello *world*');
  });

  it('converts *italic* to _italic_', () => {
    // Note: distinguish *italic* (single asterisk) from already-converted *bold*
    expect(markdownToWhatsApp('Some *italic* text')).toBe('Some _italic_ text');
  });

  it('keeps `code` as-is', () => {
    expect(markdownToWhatsApp('use `foo()` here')).toBe('use `foo()` here');
  });

  it('keeps ```block``` as-is', () => {
    expect(markdownToWhatsApp('```js\nfoo()\n```')).toBe('```js\nfoo()\n```');
  });

  it('handles mixed formatting', () => {
    expect(markdownToWhatsApp('**Title**: *emphasis* and `code`'))
      .toBe('*Title*: _emphasis_ and `code`');
  });

  it('passes plain text through', () => {
    expect(markdownToWhatsApp('plain text here')).toBe('plain text here');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd apps/api && npx jest format-whatsapp.spec.ts
```

- [ ] **Step 3: Implement `format-whatsapp.ts`**

```ts
/**
 * Convert Markdown produced by ChatService into WhatsApp-flavored text.
 *
 * WhatsApp uses *single-asterisk* for bold AND we need to convert Markdown
 * _italic_ at the same time. Doing the replaces in the wrong order makes the
 * italic regex eat the inner characters of **bold**. To avoid that, stash
 * bold behind a unique placeholder, do the italic pass, then restore bold.
 */
const BOLD_OPEN = '\u0001BO\u0001';
const BOLD_CLOSE = '\u0001BC\u0001';

export function markdownToWhatsApp(markdown: string): string {
  let out = markdown;
  // 1) Stash **bold**
  out = out.replace(/\*\*(.+?)\*\*/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`);
  // 2) *italic* -> _italic_
  out = out.replace(/\*([^*\n]+?)\*/g, '_$1_');
  // 3) Restore stashed bold as WhatsApp *bold*
  out = out.split(BOLD_OPEN).join('*').split(BOLD_CLOSE).join('*');
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
cd apps/api && npx jest format-whatsapp.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp/helpers/format-whatsapp.ts apps/api/src/modules/whatsapp/helpers/format-whatsapp.spec.ts
git commit -m "feat(whatsapp): add markdown→whatsapp-text formatter"
```

---

### Task 6: Helpers — i18n (8 languages, no test)

**Files:**
- Create: `apps/api/src/modules/whatsapp/helpers/i18n.ts`

- [ ] **Step 1: Copy from telegram**

Read `apps/api/src/modules/telegram/helpers/i18n.ts` in full. Write the same content to `apps/api/src/modules/whatsapp/helpers/i18n.ts` using the Write tool.

- [ ] **Step 2: Apply 5 substitutions via Edit tool with `replace_all: true`**

Run the following 5 Edit calls against the new file (each with `replace_all: true`):

| old_string | new_string |
|---|---|
| `<b>` | `*` |
| `</b>` | `*` |
| `<code>` | `` ` `` |
| `</code>` | `` ` `` |
| `<br>` | `\n` |

These tags appear inside multiple language strings; `replace_all` handles the bulk.

- [ ] **Step 3: Re-author `welcomeNew` for WhatsApp UX**

The Telegram `welcomeNew` string instructs the user to open the app → Settings → Telegram Bot → tap "Connect Telegram" → send `/link CODE`. For WhatsApp, the user arrives by tapping the wa.me link from the app, so the welcome message should be shorter: explain that the bot is for budget tracking and ask them to send `link YOUR_CODE` if they haven't already. Edit all 8 language entries for `welcomeNew`.

- [ ] **Step 4: Confirm all 33 keys present in all 8 languages**

Required keys (from telegram source): `linkFirst`, `aiLimitReached`, `somethingWrong`, `speechNotRecognized`, `receiptScanFailed`, `voiceFailed`, `receiptScanned`, `confirm`, `cancel`, `addExpense`, `expenseCreated`, `cancelled`, `receiptCancelled`, `usageTitle`, `used`, `tier`, `breakdown`, `resets`, `changeDate`, `sendDate`, `dateUpdated`, `invalidDate`, `welcomeBack`, `welcomeNew`, `linkProvideCode`, `linkSuccess`, `unlinkSuccess`, `notLinked`, `newChatStarted`, `chooseAccount`, `oneAccount`, `activeAccount`, `helpText`.

Grep the file with `pattern: "^\\s+(en|de|es|fr|pl|ru|ua|be):"` and assert each key has 8 hits.

- [ ] **Step 2: Verify the export signature matches telegram (so handlers can be copy-adapted)**

The file should export: `export function t(key: string, lang?: string, params?: Record<string, string>): string`

- [ ] **Step 3: Typecheck**

```
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/whatsapp/helpers/i18n.ts
git commit -m "feat(whatsapp): add 8-language i18n helper"
```

---

### Task 7: Helpers — parse-amount + resolve-account (copy, no test)

**Files:**
- Create: `apps/api/src/modules/whatsapp/helpers/parse-amount.ts`
- Create: `apps/api/src/modules/whatsapp/helpers/resolve-account.ts`

- [ ] **Step 1: Copy files byte-for-byte from telegram module**

Use Bash `cp`:

```bash
cp apps/api/src/modules/telegram/helpers/parse-amount.ts apps/api/src/modules/whatsapp/helpers/parse-amount.ts
cp apps/api/src/modules/telegram/helpers/resolve-account.ts apps/api/src/modules/whatsapp/helpers/resolve-account.ts
```

These helpers are framework-agnostic (no Telegraf imports). No edits required.

- [ ] **Step 2: Typecheck**

```
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/whatsapp/helpers/parse-amount.ts apps/api/src/modules/whatsapp/helpers/resolve-account.ts
git commit -m "feat(whatsapp): port parse-amount + resolve-account helpers"
```

---

### Task 8: Helpers — download-media

**Files:**
- Create: `apps/api/src/modules/whatsapp/helpers/download-media.ts`

- [ ] **Step 1: Implement**

```ts
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0';

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
}

export async function downloadMedia(mediaId: string, accessToken: string): Promise<DownloadedMedia> {
  const metaRes = await fetch(`https://graph.facebook.com/${API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaRes.ok) {
    throw new Error(`WhatsApp media meta fetch failed: ${metaRes.status} ${await metaRes.text()}`);
  }
  const meta = await metaRes.json() as { url: string; mime_type: string };

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!fileRes.ok) {
    throw new Error(`WhatsApp media file fetch failed: ${fileRes.status}`);
  }
  const bytes = await fileRes.arrayBuffer();

  return { buffer: Buffer.from(bytes), mimeType: meta.mime_type };
}
```

- [ ] **Step 2: Typecheck**

```
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/whatsapp/helpers/download-media.ts
git commit -m "feat(whatsapp): add download-media helper"
```

---

### Task 9: WhatsAppLinkService (TDD)

**Files:**
- Create: `apps/api/src/modules/whatsapp/whatsapp-link.service.ts`
- Test: `apps/api/src/modules/whatsapp/whatsapp-link.service.spec.ts`

- [ ] **Step 1: Read existing TelegramLinkService**

Open `apps/api/src/modules/telegram/telegram-link.service.ts` and read all 147 lines. The new service is structurally identical with field renames.

- [ ] **Step 2: Write the failing test**

Use the test pattern from `apps/api/src/modules/app-versions/app-versions.service.spec.ts` (mock PrismaService). Test these scenarios:
- `generateCode` invalidates previous unused codes for the same user
- `generateCode` returns a 6-char hex code in uppercase
- `redeemCode` upserts WhatsAppLink and marks code as used
- `redeemCode` returns `{success: false}` for expired/used/missing code
- `redeemCode` deletes any prior link for the same userId with a different phone number
- `getLink` filters by `isActive: true`
- `unlinkByTelegramId` ... wait, this is whatsapp. `unlinkByPhoneNumber` and `unlinkByUserId` set `isActive: false`

(Save 5–8 focused tests, ~80 lines.)

- [ ] **Step 3: Run test to verify it fails**

```
cd apps/api && npx jest whatsapp-link.service.spec.ts
```

- [ ] **Step 4: Implement `whatsapp-link.service.ts`**

Mirror the structure of `TelegramLinkService` exactly. Renames:
- `telegramUserId` → `waPhoneNumber`
- `telegramUsername` → `waProfileName`
- `telegramLinkCode` → `whatsAppLinkCode`
- `telegramLink` → `whatsAppLink`
- Method names: `unlinkByTelegramId` → `unlinkByPhoneNumber`

Imports unchanged: `PrismaService`, `ConfigService`, `randomBytes`.

- [ ] **Step 5: Run test to verify it passes**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/whatsapp/whatsapp-link.service.ts apps/api/src/modules/whatsapp/whatsapp-link.service.spec.ts
git commit -m "feat(whatsapp): add WhatsAppLinkService"
```

---

### Task 10: WhatsAppClientService

**Files:**
- Create: `apps/api/src/modules/whatsapp/whatsapp-client.service.ts`

- [ ] **Step 1: Implement**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { downloadMedia, DownloadedMedia } from './helpers/download-media';

interface Button { id: string; title: string; }
interface ListRow { id: string; title: string; description?: string; }

@Injectable()
export class WhatsAppClientService {
  private readonly logger = new Logger(WhatsAppClientService.name);
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly phoneNumberId: string;

  constructor(config: ConfigService) {
    const apiVersion = config.get<string>('WHATSAPP_API_VERSION') ?? 'v21.0';
    this.accessToken = config.get<string>('WHATSAPP_ACCESS_TOKEN') ?? '';
    this.phoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID') ?? '';
    this.baseUrl = `https://graph.facebook.com/${apiVersion}/${this.phoneNumberId}`;
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken && this.phoneNumberId);
  }

  async sendText(to: string, body: string): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: false },
    });
  }

  async sendButtons(to: string, bodyText: string, buttons: Button[]): Promise<void> {
    if (buttons.length > 3) throw new Error('WhatsApp allows max 3 buttons');
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })),
        },
      },
    });
  }

  async sendList(to: string, bodyText: string, buttonLabel: string, rows: ListRow[]): Promise<void> {
    if (rows.length > 10) throw new Error('WhatsApp list section allows max 10 rows');
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: buttonLabel.slice(0, 20),
          sections: [{ rows: rows.map(r => ({ id: r.id, title: r.title.slice(0, 24), description: r.description?.slice(0, 72) })) }],
        },
      },
    });
  }

  async downloadMedia(mediaId: string): Promise<DownloadedMedia> {
    return downloadMedia(mediaId, this.accessToken);
  }

  private async post(body: unknown): Promise<void> {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`WhatsApp send failed ${res.status}: ${text}`);
      throw new Error(`WhatsApp send failed: ${res.status}`);
    }
  }
}
```

- [ ] **Step 2: Typecheck**

```
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/whatsapp/whatsapp-client.service.ts
git commit -m "feat(whatsapp): add WhatsAppClientService (Graph API wrapper)"
```

---

### Task 11: Module + types skeleton

**Files:**
- Create: `apps/api/src/modules/whatsapp/types.ts`
- Create: `apps/api/src/modules/whatsapp/whatsapp.module.ts`

- [ ] **Step 1: Implement `types.ts`**

```ts
export interface WhatsAppUserState {
  userId: string;
  accountId: string;
  conversationId: string | null;
  currencyCode: string;
  language: string;
  waPhoneNumber: string;
}

export interface WaTextMessage {
  from: string;          // E.164 without leading '+'
  id: string;            // message id (idempotency key)
  timestamp: string;
  type: 'text';
  text: { body: string };
}
export interface WaInteractiveMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'interactive';
  interactive:
    | { type: 'button_reply'; button_reply: { id: string; title: string } }
    | { type: 'list_reply'; list_reply: { id: string; title: string; description?: string } };
}
export interface WaMediaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'audio' | 'image' | 'document' | 'voice';
  audio?: { id: string; mime_type: string };
  voice?: { id: string; mime_type: string };
  image?: { id: string; mime_type: string };
  document?: { id: string; mime_type: string; filename?: string };
}
export type WaMessage = WaTextMessage | WaInteractiveMessage | WaMediaMessage;

export interface WaWebhookBody {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: WaMessage[];
        statuses?: unknown[];
      };
      field: 'messages';
    }>;
  }>;
}
```

- [ ] **Step 2: Implement empty module**

```ts
// whatsapp.module.ts
import { Global, Module } from '@nestjs/common';
import { WhatsAppLinkService } from './whatsapp-link.service';
import { WhatsAppClientService } from './whatsapp-client.service';
import { AiModule } from '../ai/ai.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { IncomesModule } from '../incomes/incomes.module';
import { CategoriesModule } from '../categories/categories.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Global()
@Module({
  imports: [AiModule, ExpensesModule, IncomesModule, CategoriesModule, SubscriptionsModule],
  controllers: [],
  providers: [WhatsAppLinkService, WhatsAppClientService],
  exports: [WhatsAppLinkService, WhatsAppClientService],
})
export class WhatsAppModule {}
```

- [ ] **Step 3: Register in AppModule**

In `apps/api/src/app.module.ts`, add `WhatsAppModule` to `imports` array (alongside `TelegramModule`).

- [ ] **Step 4: Typecheck + boot test**

```
cd apps/api && npx tsc --noEmit
npm run start -- --watch=false
```

Expected: Nest boots without errors. Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp/ apps/api/src/app.module.ts
git commit -m "feat(whatsapp): scaffold module + types"
```

---

### Task 12: WhatsAppBotController + verify-token handshake (TDD)

**Files:**
- Create: `apps/api/src/modules/whatsapp/whatsapp-bot.controller.ts`
- Test: `apps/api/src/modules/whatsapp/whatsapp-bot.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { Test } from '@nestjs/testing';
import { WhatsAppBotController } from './whatsapp-bot.controller';
import { WhatsAppBotService } from './whatsapp-bot.service';

describe('WhatsAppBotController', () => {
  let controller: WhatsAppBotController;
  let botService: { handleUpdate: jest.Mock };

  beforeEach(async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify';
    process.env.WHATSAPP_APP_SECRET = 'test_secret';
    botService = { handleUpdate: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      controllers: [WhatsAppBotController],
      providers: [{ provide: WhatsAppBotService, useValue: botService }],
    }).compile();
    controller = moduleRef.get(WhatsAppBotController);
  });

  describe('GET /whatsapp/webhook', () => {
    it('returns challenge when token matches', async () => {
      const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      await controller.verify('subscribe', 'test_verify', 'CHALLENGE_XYZ', res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('CHALLENGE_XYZ');
    });

    it('returns 403 when token mismatches', async () => {
      const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      await controller.verify('subscribe', 'wrong', 'X', res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('POST /whatsapp/webhook', () => {
    it('returns 401 on bad signature', async () => {
      const res: any = { status: jest.fn().mockReturnThis(), sendStatus: jest.fn(), send: jest.fn() };
      const req: any = { rawBody: Buffer.from('{}'), headers: { 'x-hub-signature-256': 'sha256=bad' } };
      await controller.handle(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(botService.handleUpdate).not.toHaveBeenCalled();
    });

    it('ACKs 200 and dispatches on valid signature', async () => {
      const { createHmac } = await import('crypto');
      const body = Buffer.from('{"hello":"world"}');
      const sig = 'sha256=' + createHmac('sha256', 'test_secret').update(body).digest('hex');
      const res: any = { sendStatus: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() };
      const req: any = { rawBody: body, headers: { 'x-hub-signature-256': sig }, body: { hello: 'world' } };
      await controller.handle(req, res);
      expect(res.sendStatus).toHaveBeenCalledWith(200);
      // Dispatch happens fire-and-forget — wait a tick
      await new Promise(r => setImmediate(r));
      expect(botService.handleUpdate).toHaveBeenCalledWith({ hello: 'world' });
    });
  });
});
```

- [ ] **Step 2: Run test (fails)**

```
cd apps/api && npx jest whatsapp-bot.controller.spec.ts
```

- [ ] **Step 3: Implement controller**

```ts
import { Body, Controller, Get, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { WhatsAppBotService } from './whatsapp-bot.service';
import { verifySignature } from './helpers/verify-signature';

@Controller('whatsapp')
export class WhatsAppBotController {
  private readonly logger = new Logger(WhatsAppBotController.name);
  private readonly verifyToken: string;
  private readonly appSecret: string;

  constructor(
    private readonly botService: WhatsAppBotService,
    config: ConfigService,
  ) {
    this.verifyToken = config.get<string>('WHATSAPP_VERIFY_TOKEN') ?? '';
    this.appSecret = config.get<string>('WHATSAPP_APP_SECRET') ?? '';
  }

  @Get('webhook')
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): Promise<void> {
    if (mode === 'subscribe' && token === this.verifyToken) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send();
  }

  @Post('webhook')
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (!rawBody || !verifySignature(rawBody, signature, this.appSecret)) {
      res.status(401).send();
      return;
    }

    res.sendStatus(200);

    // Fire-and-forget; errors logged but never propagated
    this.botService.handleUpdate(req.body).catch((err) => {
      this.logger.error(`Handler error: ${err instanceof Error ? err.stack : err}`);
    });
  }
}
```

- [ ] **Step 4: Add stub `WhatsAppBotService` so DI works**

In `whatsapp-bot.service.ts` (will be filled in next task):

```ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class WhatsAppBotService {
  async handleUpdate(body: unknown): Promise<void> {
    // implemented in next task
  }
}
```

- [ ] **Step 5: Wire controller + service into module**

In `whatsapp.module.ts`, add `WhatsAppBotController` to `controllers` and `WhatsAppBotService` to `providers` + `exports`.

- [ ] **Step 6: Run tests (pass)**

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/whatsapp/whatsapp-bot.controller.ts apps/api/src/modules/whatsapp/whatsapp-bot.controller.spec.ts apps/api/src/modules/whatsapp/whatsapp-bot.service.ts apps/api/src/modules/whatsapp/whatsapp.module.ts
git commit -m "feat(whatsapp): add webhook controller with HMAC verify + ACK"
```

---

### Task 13: Handler stubs (all 7, empty methods)

> ⚠️ This task **must come before the dispatcher (Task 14)** so that the dispatcher's imports resolve and each commit compiles.

**Files:**
- Create: `apps/api/src/modules/whatsapp/handlers/{command,chat,expense,income,category,voice,photo}.handler.ts`

- [ ] **Step 1: Create minimal stubs**

For each handler file, create an `@Injectable()` class with the method signatures referenced in the dispatcher (Task 14, below). Each method body: `this.logger.warn('not implemented');`. Use the method names from Task 14's `switch` and `routeCallback` blocks as the spec for the signatures.

- [ ] **Step 2: Register handlers in module**

In `whatsapp.module.ts`, add all 7 to `providers` (not exports — only services that other modules consume go in `exports`).

- [ ] **Step 3: Typecheck**

```
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 4: Boot Nest**

```
cd apps/api && npm run start -- --watch=false
```

Expected: Nest starts cleanly. Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp/
git commit -m "feat(whatsapp): scaffold 7 handler stubs"
```

---

### Task 14: WhatsAppBotService — dispatcher + idempotency

**Files:**
- Modify: `apps/api/src/modules/whatsapp/whatsapp-bot.service.ts`

- [ ] **Step 1: Implement full dispatcher**

```ts
import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppLinkService } from './whatsapp-link.service';
import { WhatsAppClientService } from './whatsapp-client.service';
import { CommandHandler } from './handlers/command.handler';
import { ChatHandler } from './handlers/chat.handler';
import { ExpenseHandler } from './handlers/expense.handler';
import { IncomeHandler } from './handlers/income.handler';
import { CategoryHandler } from './handlers/category.handler';
import { VoiceHandler } from './handlers/voice.handler';
import { PhotoHandler } from './handlers/photo.handler';
import { parseCommand } from './helpers/parse-command';
import { WaMessage, WaWebhookBody, WhatsAppUserState } from './types';
import { t } from './helpers/i18n';

@Injectable()
export class WhatsAppBotService {
  private readonly logger = new Logger(WhatsAppBotService.name);
  private readonly redis: Redis;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly linkService: WhatsAppLinkService,
    private readonly client: WhatsAppClientService,
    private readonly commandHandler: CommandHandler,
    private readonly chatHandler: ChatHandler,
    private readonly expenseHandler: ExpenseHandler,
    private readonly incomeHandler: IncomeHandler,
    private readonly categoryHandler: CategoryHandler,
    private readonly voiceHandler: VoiceHandler,
    private readonly photoHandler: PhotoHandler,
  ) {
    this.redis = new Redis(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
  }

  async handleUpdate(body: WaWebhookBody): Promise<void> {
    const value = body.entry?.[0]?.changes?.[0]?.value;
    if (!value) return;

    // Ignore statuses[] (delivery/read receipts) — same subscription, not user messages.
    const messages = value.messages ?? [];
    if (messages.length === 0) return;

    for (const msg of messages) {
      // Defensive filtering (spec §4):
      //   - Drop messages whose `from` doesn't look like a phone (length < 7, non-digits).
      //   - Drop messages with `context.referred_product` (catalog interactions — out of v1 scope).
      //   - Group messages don't arrive on Cloud API for individual numbers, but defensively
      //     reject any payload with a non-string `from`.
      if (typeof msg.from !== 'string' || !/^\d{7,15}$/.test(msg.from)) continue;
      if ((msg as any).context?.referred_product) continue;

      await this.processMessage(msg);
    }
  }

  private async processMessage(msg: WaMessage): Promise<void> {
    // Idempotency: dedup by message id, 24h TTL
    const setOk = await this.redis.set(`wa:msg:${msg.id}`, '1', 'EX', 86400, 'NX');
    if (setOk !== 'OK') {
      this.logger.debug(`Skipping duplicate message ${msg.id}`);
      return;
    }

    // Resolve user state
    const waPhone = msg.from.startsWith('+') ? msg.from : `+${msg.from}`;
    const link = await this.linkService.getLink(waPhone);
    const userState: WhatsAppUserState | undefined = link
      ? {
          userId: link.userId,
          accountId: link.defaultAccountId,
          conversationId: link.conversationId,
          currencyCode: link.user.currencyCode,
          language: link.user.language || 'en',
          waPhoneNumber: waPhone,
        }
      : undefined;

    try {
      await this.dispatch(msg, userState);
    } catch (err) {
      this.logger.error(`Handler crash: ${err instanceof Error ? err.stack : err}`);
      await this.client.sendText(waPhone, t('somethingWrong', userState?.language));
    }
  }

  private async dispatch(msg: WaMessage, userState?: WhatsAppUserState): Promise<void> {
    const waPhone = msg.from.startsWith('+') ? msg.from : `+${msg.from}`;

    // Interactive replies (button/list) — always require linked user
    if (msg.type === 'interactive') {
      if (!userState) {
        await this.client.sendText(waPhone, t('linkFirst'));
        return;
      }
      const id = msg.interactive.type === 'button_reply'
        ? msg.interactive.button_reply.id
        : msg.interactive.list_reply.id;
      await this.routeCallback(id, userState);
      return;
    }

    // Media
    if (msg.type === 'audio' || msg.type === 'voice') {
      if (!userState) { await this.client.sendText(waPhone, t('linkFirst')); return; }
      await this.voiceHandler.handle(msg, userState);
      return;
    }
    if (msg.type === 'image') {
      if (!userState) { await this.client.sendText(waPhone, t('linkFirst')); return; }
      await this.photoHandler.handleImage(msg, userState);
      return;
    }
    if (msg.type === 'document') {
      if (!userState) { await this.client.sendText(waPhone, t('linkFirst')); return; }
      await this.photoHandler.handleDocument(msg, userState);
      return;
    }

    // Text — may be link command (no user yet) OR awaiting-date input OR free chat
    if (msg.type === 'text') {
      const text = msg.text.body;

      const parsed = parseCommand(text);
      if (parsed?.command === 'link') {
        await this.commandHandler.handleLink(waPhone, parsed.args);
        return;
      }

      if (!userState) {
        await this.client.sendText(waPhone, t('welcomeNew'));
        return;
      }

      // Check awaiting-date mode (photo handler sets this)
      const handled = await this.photoHandler.handleDateInput(text, userState);
      if (handled) return;

      // Dispatch other commands
      if (parsed) {
        switch (parsed.command) {
          case 'expense':   return this.expenseHandler.handle(parsed.args, userState);
          case 'income':    return this.incomeHandler.handle(parsed.args, userState);
          case 'help':      return this.commandHandler.handleHelp(userState);
          case 'unlink':    return this.commandHandler.handleUnlink(userState);
          case 'account':
          case 'menu':      return this.commandHandler.handleAccount(userState);
          case 'newchat':   return this.commandHandler.handleNewChat(userState);
          case 'usage':     return this.commandHandler.handleUsage(userState);
          case 'category':  return this.categoryHandler.handle(parsed.args, userState);
          case 'categories': return this.categoryHandler.handleList(userState);
        }
      }

      // Free text → AI chat
      await this.chatHandler.handleText(text, userState);
    }
  }

  private async routeCallback(id: string, userState: WhatsAppUserState): Promise<void> {
    const sepIdx = id.indexOf('--');
    if (sepIdx < 0) return;
    const prefix = id.slice(0, sepIdx);
    const payload = id.slice(sepIdx + 2);

    switch (prefix) {
      case 'ca':           return this.chatHandler.handleConfirmCallback(payload, userState);
      case 'ra':           return this.chatHandler.handleRejectCallback(payload, userState);
      case 'account':      return this.commandHandler.handleAccountCallback(payload, userState);
      case 'cat_e':        return this.categoryHandler.handleTypeCallback('expense', payload, userState);
      case 'cat_i':        return this.categoryHandler.handleTypeCallback('income', payload, userState);
      case 'cat_d':        return this.categoryHandler.handleDeleteCallback(payload, userState);
      case 'receipt_add':  return this.photoHandler.handleReceiptAddCallback(payload, userState);
      case 'receipt_date': return this.photoHandler.handleDateCallback(payload, userState);
      case 'receipt_cancel': return this.photoHandler.handleReceiptCancelCallback(payload, userState);
    }
  }
}
```

- [ ] **Step 2: Wire dispatcher into module**

In `whatsapp.module.ts`, add `WhatsAppBotService` to providers + exports (replace the stub from Task 12).

- [ ] **Step 3: Typecheck**

```
cd apps/api && npx tsc --noEmit
```

Expected: 0 errors. Stubs from Task 13 satisfy all references.

- [ ] **Step 4: Boot Nest**

```
cd apps/api && npm run start -- --watch=false
```

Expected: clean start, no `WhatsAppBotService` resolution errors. Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp/whatsapp-bot.service.ts apps/api/src/modules/whatsapp/whatsapp.module.ts
git commit -m "feat(whatsapp): implement dispatcher with idempotency"
```

---

### Task 15: CommandHandler — link, help, unlink, account, newchat, usage

**Files:**
- Modify: `apps/api/src/modules/whatsapp/handlers/command.handler.ts`

- [ ] **Step 1: Read telegram precedent**

Open `apps/api/src/modules/telegram/handlers/command.handler.ts` for reference structure.

- [ ] **Step 2: Implement**

Mirror each Telegram method, but:
- Use `this.client.sendText(waPhone, text)` instead of `ctx.reply(text, ...)`
- Use `this.client.sendList(...)` for the account picker (list message with all user's accounts as rows). Callback IDs use `--` separator: `account--{accountId}`.
- `handleLink(waPhone, code)` — validate `code` is 6 hex chars; call `linkService.redeemCode(code, waPhone, profileName?)`; reply with `linkSuccess` or `linkProvideCode` on failure.
- `handleUsage(userState)` — call `subscriptionsService.getUsageStats(userState.userId, userState.accountId)` (same as Telegram); format output with WA markdown (`*` for bold).
- `handleNewChat(userState)` — `linkService.resetConversation(userState.waPhoneNumber)`; reply with `newChatStarted`.

Inject: `WhatsAppLinkService`, `WhatsAppClientService`, `PrismaService`, `SubscriptionsService`.

- [ ] **Step 3: Typecheck**

```
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/whatsapp/handlers/command.handler.ts
git commit -m "feat(whatsapp): implement CommandHandler"
```

---

### Task 16: ChatHandler — AI chat with confirm/cancel buttons

**Files:**
- Modify: `apps/api/src/modules/whatsapp/handlers/chat.handler.ts`

- [ ] **Step 1: Read telegram precedent**

Open `apps/api/src/modules/telegram/handlers/chat.handler.ts`. The new file mirrors it.

- [ ] **Step 2: Implement**

Key changes vs Telegram:
- `pendingActions` stored in Redis (key `wa:pa:{shortId}`, TTL 1800s)
- Outbound formatting via `markdownToWhatsApp` (not Telegram HTML)
- Buttons sent via `client.sendButtons(waPhone, message, [{id: 'ca--shortId', title: 'Confirm'}, {id: 'ra--shortId', title: 'Cancel'}])`
- Inject `ChatService`, `WhatsAppLinkService`, `PrismaService`, `SubscriptionsService`, `WhatsAppClientService`, and the Redis client (or via `WhatsAppBotService` — pass-through). Simplest: inject `Redis` directly in this handler too (use `useFactory` in module).

- [ ] **Step 3: Add Redis provider to module**

In `whatsapp.module.ts`:

```ts
import Redis from 'ioredis';

@Global()
@Module({
  // ...
  providers: [
    // ...
    {
      provide: 'WA_REDIS',
      useFactory: (config: ConfigService) => new Redis(config.get('REDIS_URL') ?? 'redis://localhost:6379'),
      inject: [ConfigService],
    },
  ],
  exports: ['WA_REDIS', /* ... */],
})
```

Handlers inject via `@Inject('WA_REDIS') private readonly redis: Redis`.

Refactor `WhatsAppBotService` to use the same provider instead of creating its own Redis instance.

- [ ] **Step 4: Typecheck**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp/handlers/chat.handler.ts apps/api/src/modules/whatsapp/whatsapp-bot.service.ts apps/api/src/modules/whatsapp/whatsapp.module.ts
git commit -m "feat(whatsapp): implement ChatHandler with confirm/cancel via Redis"
```

---

### Task 17: ExpenseHandler + IncomeHandler

**Files:**
- Modify: `apps/api/src/modules/whatsapp/handlers/expense.handler.ts`
- Modify: `apps/api/src/modules/whatsapp/handlers/income.handler.ts`

- [ ] **Step 1: Implement ExpenseHandler**

Mirror `apps/api/src/modules/telegram/handlers/expense.handler.ts`. Signature: `handle(args: string, userState: WhatsAppUserState)`. Parse amount + description via `parseAmount`; call `expensesService.create(userState.accountId, userState.userId, dto)`; reply `expenseCreated` with formatted summary.

- [ ] **Step 2: Implement IncomeHandler**

Mirror Telegram's income handler analogously.

- [ ] **Step 3: Typecheck**

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/whatsapp/handlers/expense.handler.ts apps/api/src/modules/whatsapp/handlers/income.handler.ts
git commit -m "feat(whatsapp): implement Expense + Income handlers"
```

---

### Task 18: CategoryHandler

**Files:**
- Modify: `apps/api/src/modules/whatsapp/handlers/category.handler.ts`

- [ ] **Step 1: Implement**

Mirror `apps/api/src/modules/telegram/handlers/category.handler.ts`. Use `sendButtons` (2: Expense/Income) for type picker; use `sendList` for category deletion list (up to 10 — if more, send a text fallback message asking the user to use the mobile app).

- [ ] **Step 2: Typecheck + commit**

```bash
git add apps/api/src/modules/whatsapp/handlers/category.handler.ts
git commit -m "feat(whatsapp): implement CategoryHandler"
```

---

### Task 19: VoiceHandler

**Files:**
- Modify: `apps/api/src/modules/whatsapp/handlers/voice.handler.ts`

- [ ] **Step 1: Implement**

```ts
async handle(msg: WaMediaMessage, userState: WhatsAppUserState): Promise<void> {
  // WhatsApp distinguishes "audio" (uploaded file) from "voice" (push-to-talk).
  // Both have id + mime_type in same shape.
  const media = msg.audio ?? msg.voice;
  if (!media) return;

  try {
    await this.subscriptionsService.trackAiUsage(userState.userId, 'voice', 2.0, userState.accountId);
  } catch (e) {
    if (e instanceof ForbiddenException) {
      await this.client.sendText(userState.waPhoneNumber, t('aiLimitReached', userState.language));
      return;
    }
    throw e;
  }

  const { buffer } = await this.client.downloadMedia(media.id);
  const transcript = await this.whisperService.transcribe(buffer, 'ogg');

  if (!transcript?.trim()) {
    await this.client.sendText(userState.waPhoneNumber, t('speechNotRecognized', userState.language));
    return;
  }

  // Echo transcript, then dispatch as text via chatHandler
  await this.client.sendText(userState.waPhoneNumber, `🎤 _"${transcript}"_`);
  await this.chatHandler.handleText(transcript, userState);
}
```

Inject: `WhisperService`, `SubscriptionsService`, `WhatsAppClientService`, `ChatHandler`.

**Forward reference:** Since `ChatHandler` and `VoiceHandler` reference each other indirectly, declare both as providers in the module and Nest's DI handles ordering. No `forwardRef()` needed unless circular at constructor level.

- [ ] **Step 2: Typecheck + commit**

```bash
git add apps/api/src/modules/whatsapp/handlers/voice.handler.ts
git commit -m "feat(whatsapp): implement VoiceHandler (Whisper)"
```

---

### Task 20: PhotoHandler — OCR + date-change flow

**Files:**
- Modify: `apps/api/src/modules/whatsapp/handlers/photo.handler.ts`

- [ ] **Step 1: Implement**

Mirror `apps/api/src/modules/telegram/handlers/photo.handler.ts`. Differences:
- Store `pendingReceipt` in Redis (`wa:receipt:{shortId}`, TTL 1800s) instead of in-memory Map
- Store awaiting-date state in Redis (`wa:awaiting_date:{waPhone}`, TTL 600s)
- `handleDateInput(text, userState)` — first reads `wa:awaiting_date:{waPhone}`; if present, parses DD.MM.YYYY, updates receipt data, replies; returns `true` if handled, `false` otherwise (so dispatcher knows to fall through to chat)
- Outbound: 3 buttons via `sendButtons` (max 3 — fits exactly)
- Image-only in v1: if `msg.type === 'document'` but mime is not `image/*` or `application/pdf`, reply with `receiptScanFailed`

- [ ] **Step 2: Typecheck + commit**

```bash
git add apps/api/src/modules/whatsapp/handlers/photo.handler.ts
git commit -m "feat(whatsapp): implement PhotoHandler (OCR + date flow)"
```

---

### Task 21: UsersController — 3 endpoints for mobile

**Files:**
- Modify: `apps/api/src/modules/users/users.controller.ts`

- [ ] **Step 1: Inject `WhatsAppLinkService`**

Add to constructor signature alongside existing telegram service. **No new import needed** in `users.module.ts` — `WhatsAppModule` is `@Global()` (Task 11 set this up), so `WhatsAppLinkService` is available app-wide.

- [ ] **Step 2: Add 3 endpoints (mirror telegram ones at lines 93-123)**

```ts
// ── WhatsApp ──

@Post('me/whatsapp-link-code')
@UseGuards(AccountContextGuard)
async generateWhatsAppLinkCode(@Req() req: AuthenticatedRequest) {
  const result = await this.whatsAppLinkService.generateCode(req.user.id, req.accountId);
  return {
    code: result.code,
    expiresAt: result.expiresAt.toISOString(),
    waPhoneNumber: process.env.WHATSAPP_BUSINESS_PHONE_NUMBER ?? '',
  };
}

@Get('me/whatsapp-link')
async getWhatsAppLinkStatus(@Req() req: AuthenticatedRequest) {
  const link = await this.whatsAppLinkService.getLinkByUserId(req.user.id);
  if (!link) return { linked: false };
  return {
    linked: true,
    waPhoneNumber: link.waPhoneNumber,
    waProfileName: link.waProfileName,
    linkedAt: link.createdAt.toISOString(),
  };
}

@Delete('me/whatsapp-link')
async unlinkWhatsApp(@Req() req: AuthenticatedRequest) {
  await this.whatsAppLinkService.unlinkByUserId(req.user.id);
  return { success: true };
}
```

- [ ] **Step 3: Add a `generateCode` overload** in `WhatsAppLinkService` that mirrors `TelegramLinkService.generateCode` — already in Task 9.

- [ ] **Step 4: Typecheck + commit**

```bash
git add apps/api/src/modules/users/users.controller.ts
git commit -m "feat(api): expose whatsapp-link-code/status/unlink on UsersController"
```

---

### Task 22: Env vars

**Files:**
- Modify: `.env.example`
- Modify (locally): `.env.production` (NOT committed — secrets)

- [ ] **Step 1: Add to `.env.example`**

```
# ─── WhatsApp Cloud API ───
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_BUSINESS_PHONE_NUMBER=
WHATSAPP_API_VERSION=v21.0
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "feat(whatsapp): document env vars"
```

- [ ] **Step 3: Update `.env.production` on the prod host (operational, not in this PR)**

Add the 7 vars with real values. Re-create the api container:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
```

---

### Task 23: Mobile API client methods

**Files:**
- Modify: `apps/mobile/src/services/api.ts`

- [ ] **Step 1: Find the Telegram methods**

Open `apps/mobile/src/services/api.ts` and locate `generateTelegramLinkCode`, `getTelegramLinkStatus`, `unlinkTelegram` (use Grep tool). Mirror them.

- [ ] **Step 2: Add 3 WhatsApp methods**

```ts
async generateWhatsAppLinkCode(): Promise<{ code: string; expiresAt: string; waPhoneNumber: string }> {
  return this.post<{ code: string; expiresAt: string; waPhoneNumber: string }>('/users/me/whatsapp-link-code');
}

async getWhatsAppLinkStatus(): Promise<{ linked: boolean; waPhoneNumber?: string; waProfileName?: string | null; linkedAt?: string }> {
  return this.get('/users/me/whatsapp-link');
}

async unlinkWhatsApp(): Promise<{ success: boolean }> {
  return this.delete('/users/me/whatsapp-link');
}
```

- [ ] **Step 3: Typecheck mobile**

```
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/api.ts
git commit -m "feat(mobile): add whatsapp link API methods"
```

---

### Task 24: Install react-native-qrcode-svg

**Files:**
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Install**

```
cd apps/mobile && npm install react-native-qrcode-svg
```

- [ ] **Step 2: Verify it doesn't require native rebuild**

`react-native-qrcode-svg` is pure JS and renders via `react-native-svg` (already installed). **However:** if `apps/mobile/ios/` or `apps/mobile/android/` directories exist (bare workflow, post-`expo prebuild`), the new dep's autolinking config may require a fresh prebuild. Check:

```bash
ls apps/mobile/ios apps/mobile/android 2>/dev/null
```

If those directories exist, run:

```bash
cd apps/mobile && npx expo prebuild --clean
```

If the directories don't exist (managed workflow), no native rebuild is needed.

Then confirm:

```bash
cd apps/mobile && npx tsc --noEmit && npx expo start --web
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "feat(mobile): add react-native-qrcode-svg dependency"
```

---

### Task 25: i18n keys × 8 locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts` (source)
- Modify: `apps/mobile/src/i18n/locales/{de,es,fr,pl,ru,ua,be}.ts`

**Use the `i18n-add-strings` skill** to coordinate the 8-file update.

- [ ] **Step 1: Define keys in English first**

Open `apps/mobile/src/i18n/locales/en.ts` and add a new `whatsappBot` namespace:

```ts
whatsappBot: {
  title: 'WhatsApp Bot',
  connectButton: 'Connect WhatsApp',
  disconnectButton: 'Disconnect',
  codeInstructions: 'Open WhatsApp and send this code:',
  openButton: 'Open WhatsApp',
  copyCode: 'Copy code',
  linkedAs: 'Linked as {{name}}',
  confirmDisconnect: 'Disconnect WhatsApp?',
},
```

- [ ] **Step 2: Translate to 7 other languages**

Add the same keys (translated) to `de.ts`, `es.ts`, `fr.ts`, `pl.ts`, `ru.ts`, `ua.ts`, `be.ts`. Translations should match the tone of existing `notifications` / `telegramBot` (if it exists) sections.

- [ ] **Step 3: Verify TypeScript**

```
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/locales/
git commit -m "feat(mobile): add WhatsApp bot i18n keys (8 locales)"
```

---

### Task 26: WhatsApp settings screen

**Files:**
- Create: `apps/mobile/app/settings/whatsapp.tsx`

- [ ] **Step 1: Read telegram screen for reference**

Look at the existing telegram settings screen (likely `apps/mobile/app/settings/telegram.tsx` or wherever it lives). Use Grep tool to find it.

- [ ] **Step 2: Implement**

Key elements:
- Use `useState<{ linked: boolean; waPhoneNumber?: string; waProfileName?: string }>()` for status
- On mount: `apiClient.getWhatsAppLinkStatus()` → set state
- When not linked: show **Connect** button → calls `generateWhatsAppLinkCode()` → shows QR code (`<QRCode value={waMeUrl} size={220} />`) + "Open WhatsApp" deep link (`Linking.openURL(waMeUrl)`) + "Copy code" (uses `expo-clipboard`)
- `waMeUrl = \`https://wa.me/${waPhoneNumber.replace(/^\+/, '')}?text=link%20${code}\``
- When linked: show "Linked as {profileName}" + Disconnect button (with `confirmDisconnect` Alert)
- After successful linking (no callback — the user goes to WhatsApp): poll status every 3s while screen is focused (or add a manual "Refresh" button). Simplest: add a Refresh button rather than polling.

- [ ] **Step 3: Boot the app and visually verify**

```
cd apps/mobile && npx expo start --web
```

Navigate to Settings → WhatsApp Bot. Verify QR renders, "Open WhatsApp" button is present.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/settings/whatsapp.tsx
git commit -m "feat(mobile): add WhatsApp Bot settings screen"
```

---

### Task 27: Add row in settings index

**Files:**
- Modify: `apps/mobile/app/settings/index.tsx`

- [ ] **Step 1: Find the Telegram Bot row**

Use Grep tool: `Telegram Bot` or `telegramBot`. Insert a sibling row right below it.

- [ ] **Step 2: Add WhatsApp Bot row**

Use the same pattern (TouchableOpacity with icon + label + chevron). Title from `t('whatsappBot.title')`. Navigation: `router.push('/settings/whatsapp')`. Icon: `whatsapp` from your icon set, or a generic `chatbubbles-outline` if WhatsApp icon isn't available.

- [ ] **Step 3: Boot, navigate, verify**

```
cd apps/mobile && npx expo start --web
```

Settings shows new row. Tapping it navigates to the new screen.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/settings/index.tsx
git commit -m "feat(mobile): link to WhatsApp Bot settings from index"
```

---

### Task 28: Run all tests + typecheck

**Files:** none (verification)

- [ ] **Step 1: Run API tests**

```
cd apps/api && npm test
```

Expected: all WhatsApp tests pass; existing project tests still pass; no regressions.

- [ ] **Step 2: Typecheck API**

```
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 3: Typecheck mobile**

```
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 4: Lint**

```
cd apps/api && npm run lint
cd apps/mobile && npm run lint
```

- [ ] **Step 5: Boot the API and verify Nest starts cleanly**

```
cd apps/api && npm run start
```

Expected: log "Nest application successfully started" with no `WhatsAppModule` errors. Ctrl+C.

---

### Task 29: Manual E2E test (ngrok + Meta test number)

**Files:** none (operational)

**Prerequisites (operational, in parallel with dev work):**
- Meta Business Manager account created
- WABA created
- Test phone number registered (Meta provides one per WABA at minimum)
- System User token issued with `whatsapp_business_messaging` scope
- Webhook configured in Meta dashboard with verify token + `messages` subscription
- App Secret copied to `.env.development.local` along with other 6 vars

- [ ] **Step 1: Start ngrok**

```
ngrok http 3000
```

Copy the HTTPS URL.

- [ ] **Step 2: Set webhook in Meta dashboard**

Webhook callback URL: `https://<ngrok-id>.ngrok-free.app/whatsapp/webhook`
Verify token: same value as `WHATSAPP_VERIFY_TOKEN` in `.env`
Subscribe to: `messages`

Click "Verify and save". Expect 200 + your verify token round-trip.

- [ ] **Step 3: Start API + mobile**

```
npm run dev
```

- [ ] **Step 4: Run linking flow from mobile**

- Open mobile app → Settings → WhatsApp Bot → Connect
- Should see QR + code (e.g., `A3K9F2`)
- On your personal WhatsApp, send `link A3K9F2` to the Meta test number (from the dashboard "Send and receive messages" widget; or use `wa.me/{testNumber}` if available)
- Expected: bot replies `linkSuccess` in your locale
- Mobile screen: tap "Refresh" → status shows "Linked as ..."

- [ ] **Step 5: Test each handler**

Send the following messages from WhatsApp and verify replies + DB inserts:

| Input | Expected |
|---|---|
| `expense 50 coffee` | `expenseCreated`, new row in `expenses` table |
| `50 lunch` (implicit) | same |
| `income 3000 salary` | `incomeCreated`, new row in `incomes` |
| Voice note "пять евро на кофе" | Whisper transcript + AI confirms an expense |
| Receipt photo | OCR summary + 3 buttons; tap Add → expense row created; tap Change date → enter `28.03.2026` → confirms |
| `help` | help text with WA-flavored markdown |
| `usage` | AI usage report |
| `account` | list message with all accounts |
| Free text "Сколько я потратил на еду?" | AI reply |
| `unlink` | `unlinkSuccess`; mobile status flips to "Not linked" after Refresh |

- [ ] **Step 6: Fix any issues** found above by adding/amending commits.

- [ ] **Step 7: Re-test all manually after fixes.**

---

### Task 30: Finish — ABA issue + tracking issue + docs update

**Files:** none (use `finish-aba-task` skill)

- [ ] **Step 1: Invoke the `finish-aba-task` skill**

Skill creates the `ABA-{N}` GitHub issue (in English), updates `CLAUDE.md` Architecture section ("API → 30 modules", add WhatsApp module description in the same style as Telegram), and writes user-facing docs in `user_docs/`.

- [ ] **Step 2: Create follow-up tracking issue**

Open a second GitHub issue: **"Migrate Telegram bot pending-actions to Redis (unify with WhatsApp)"**. Description: Telegram's `chat.handler.ts:15` and `photo.handler.ts` (similar) use in-memory `Map` for `pendingActions` / `pendingReceipts`. WhatsApp uses Redis from day one. Unify Telegram → Redis so both bots share storage and so Telegram becomes safe to run multi-instance. Labels: `tech-debt`, `telegram`.

- [ ] **Step 3: Add docs/wiki page**

Create `docs/wiki/whatsapp-bot.md` mirroring `docs/wiki/telegram-bot.md`.

- [ ] **Step 4: Update CLAUDE.md "API" row**

In `CLAUDE.md`, in the architecture table and the API section, update module count from 29 → 30 and add a WhatsApp bullet matching the existing Telegram bullet style.

- [ ] **Step 5: Final commit + PR**

```bash
git add docs/wiki/whatsapp-bot.md CLAUDE.md user_docs/
git commit -m "docs: add WhatsApp bot to wiki + CLAUDE.md + user docs"
git push -u origin <your-feature-branch>
gh pr create --title "WhatsApp bot (ABA-XXX)" --body "..."
```

---

## Final verification checklist

- [ ] All 30 tasks committed
- [ ] `npm test` (api) passes
- [ ] `npx tsc --noEmit` (api + mobile) passes
- [ ] `npm run lint` (api + mobile) passes
- [ ] Manual E2E walk through Task 29 with no regressions
- [ ] CLAUDE.md updated
- [ ] `docs/wiki/whatsapp-bot.md` created
- [ ] ABA-{N} issue created + linked in PR description
- [ ] Telegram-Redis follow-up issue created
