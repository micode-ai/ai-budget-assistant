# Slack Multi-Workspace OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any Slack workspace install the AI Budget Assistant bot via Slack OAuth v2, with per-workspace bot tokens encrypted at rest, while the original (env-token) workspace keeps working unchanged.

**Architecture:** Two public OAuth endpoints (`/slack/install`, `/slack/oauth/callback`) exchange the code for a per-team bot token, stored encrypted in a new `SlackInstallation` table. `SlackClientService` resolves the bot token per `teamId` (DB installation → env fallback) and caches a `WebClient` per token; all outbound methods gain a leading `teamId` argument sourced from `userState.slackTeamId` / the inbound event's `team_id`. The global signing secret and inbound signature verification are unchanged.

**Tech Stack:** NestJS 10, Prisma 5 (PostgreSQL), ioredis, `@slack/web-api` (OAuth + WebClient), Node `crypto` (AES-256-GCM), Jest. Mobile: Expo / React Native.

**Design spec:** `docs/superpowers/specs/2026-06-05-slack-multiworkspace-oauth-design.md`

**Branch:** `feature/slack-oauth` (already created). Commit after every task; keep the literal `ABA-XXX` placeholder in commit messages (controller assigns the real number in the final task). End every commit message with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
Do NOT create any GitHub issue from a subagent.

---

## Task 1: Prisma `SlackInstallation` model + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add the model after `SlackLinkCode`)

- [ ] **Step 1: Add the model**

After the `SlackLinkCode` model, add:

```prisma
model SlackInstallation {
  id                     String   @id @default(uuid())
  teamId                 String   @unique @map("team_id")
  teamName               String?  @map("team_name")
  botToken               String   @map("bot_token")
  botUserId              String   @map("bot_user_id")
  appId                  String?  @map("app_id")
  enterpriseId           String?  @map("enterprise_id")
  scope                  String?
  installedBySlackUserId String?  @map("installed_by_slack_user_id")
  createdAt              DateTime @default(now()) @map("created_at")
  updatedAt              DateTime @updatedAt @map("updated_at")

  @@map("slack_installations")
}
```

(No relations — installs are workspace-scoped, not user-scoped. `botToken` holds AES-GCM ciphertext, not a relation.)

- [ ] **Step 2: Create the migration**

Run from `apps/api/`:
```bash
npx prisma migrate dev --name add_slack_installations
```
Expected: new folder `apps/api/prisma/migrations/<ts>_add_slack_installations/` creating `slack_installations` with a unique index on `team_id`; Prisma client regenerates.

If the DB is unreachable, run `npx prisma migrate dev --create-only --name add_slack_installations` and report BLOCKED with the error; do not fabricate SQL.

- [ ] **Step 3: Verify client**

Run: `cd apps/api && npx prisma generate`
Expected: `prisma.slackInstallation` exists; no errors.

- [ ] **Step 4: Commit**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "ABA-XXX Slack OAuth: add SlackInstallation model + migration"
```

---

## Task 2: Token-at-rest crypto — `token-crypto.ts` (TDD)

**Files:**
- Create: `apps/api/src/modules/slack/helpers/token-crypto.ts`
- Test: `apps/api/src/modules/slack/helpers/token-crypto.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { encryptToken, decryptToken } from './token-crypto';

// 32-byte key as 64 hex chars
const KEY = 'a'.repeat(64);

describe('token-crypto', () => {
  it('round-trips a token', () => {
    const enc = encryptToken('xoxb-123-secret', KEY);
    expect(enc).not.toContain('xoxb-123-secret');
    expect(enc.split(':')).toHaveLength(3);
    expect(decryptToken(enc, KEY)).toBe('xoxb-123-secret');
  });

  it('produces a different ciphertext each call (random IV)', () => {
    expect(encryptToken('same', KEY)).not.toBe(encryptToken('same', KEY));
  });

  it('returns "" on a tampered ciphertext', () => {
    const enc = encryptToken('xoxb-abc', KEY);
    const [iv, tag, data] = enc.split(':');
    const tampered = [iv, tag, Buffer.from('zzzz').toString('base64')].join(':');
    expect(decryptToken(tampered, KEY)).toBe('');
  });

  it('returns "" with the wrong key', () => {
    const enc = encryptToken('xoxb-abc', KEY);
    expect(decryptToken(enc, 'b'.repeat(64))).toBe('');
  });

  it('returns "" on malformed input', () => {
    expect(decryptToken('not-valid', KEY)).toBe('');
    expect(decryptToken('', KEY)).toBe('');
  });
});
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `cd apps/api && npx jest src/modules/slack/helpers/token-crypto.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

/** Parse the 32-byte key from a hex (64 chars) or base64 string. Throws if not 32 bytes. */
function parseKey(key: string): Buffer {
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(key)) buf = Buffer.from(key, 'hex');
  else buf = Buffer.from(key, 'base64');
  if (buf.length !== 32) {
    throw new Error('SLACK_TOKEN_ENC_KEY must be 32 bytes (64 hex chars or base64)');
  }
  return buf;
}

/** Encrypt a token: returns base64(iv):base64(authTag):base64(ciphertext). */
export function encryptToken(plain: string, key: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, parseKey(key), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** Decrypt; returns '' on any malformed/tampered input or wrong key (never throws). */
export function decryptToken(enc: string, key: string): string {
  try {
    const [ivB64, tagB64, dataB64] = enc.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return '';
    const decipher = createDecipheriv(ALGO, parseKey(key), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: Run it — verify PASS**

Run: `cd apps/api && npx jest src/modules/slack/helpers/token-crypto.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/slack/helpers/token-crypto.ts apps/api/src/modules/slack/helpers/token-crypto.spec.ts
git commit -m "ABA-XXX Slack OAuth: AES-256-GCM token-at-rest crypto"
```

---

## Task 3: `SlackInstallationService`

**Files:**
- Create: `apps/api/src/modules/slack/slack-installation.service.ts`

- [ ] **Step 1: Implement**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { encryptToken, decryptToken } from './helpers/token-crypto';

export interface UpsertInstallationInput {
  teamId: string;
  teamName?: string;
  botTokenPlain: string;
  botUserId: string;
  appId?: string;
  enterpriseId?: string;
  scope?: string;
  installedBySlackUserId?: string;
}

@Injectable()
export class SlackInstallationService {
  private readonly logger = new Logger(SlackInstallationService.name);
  private readonly encKey: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.encKey = config.get<string>('SLACK_TOKEN_ENC_KEY') || '';
  }

  async upsert(input: UpsertInstallationInput): Promise<void> {
    const botToken = encryptToken(input.botTokenPlain, this.encKey);
    const data = {
      teamName: input.teamName ?? null,
      botToken,
      botUserId: input.botUserId,
      appId: input.appId ?? null,
      enterpriseId: input.enterpriseId ?? null,
      scope: input.scope ?? null,
      installedBySlackUserId: input.installedBySlackUserId ?? null,
    };
    await this.prisma.slackInstallation.upsert({
      where: { teamId: input.teamId },
      create: { teamId: input.teamId, ...data },
      update: data,
    });
    this.logger.log(`Slack installed for team ${input.teamId} (${input.teamName ?? ''})`);
  }

  /** Decrypted bot token for a team, or null if no installation / decrypt failed. */
  async getToken(teamId: string): Promise<string | null> {
    const row = await this.prisma.slackInstallation.findUnique({ where: { teamId } });
    if (!row) return null;
    const token = decryptToken(row.botToken, this.encKey);
    if (!token) {
      this.logger.error(`Failed to decrypt bot token for team ${teamId}`);
      return null;
    }
    return token;
  }

  async getBotUserId(teamId: string): Promise<string | null> {
    const row = await this.prisma.slackInstallation.findUnique({
      where: { teamId },
      select: { botUserId: true },
    });
    return row?.botUserId ?? null;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors in `slack-installation.service.ts` (Prisma client has `slackInstallation` from Task 1).

- [ ] **Step 3: Commit**
```bash
git add apps/api/src/modules/slack/slack-installation.service.ts
git commit -m "ABA-XXX Slack OAuth: installation service (encrypted upsert + token/botUserId lookup)"
```

---

## Task 4: Rework `SlackClientService` to per-team tokens

**Files:**
- Modify: `apps/api/src/modules/slack/slack-client.service.ts` (full replace)

- [ ] **Step 1: Replace the file contents**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { downloadSlackFile, DownloadedFile } from './helpers/download-file';
import { SlackInstallationService } from './slack-installation.service';

export interface SlackButton {
  id: string; // becomes action_id + value
  title: string;
}

@Injectable()
export class SlackClientService {
  private readonly logger = new Logger(SlackClientService.name);
  private readonly envBotToken: string;
  private readonly clients = new Map<string, WebClient>(); // token -> WebClient
  private readonly botUserIdByToken = new Map<string, string>(); // env-fallback bot user id cache

  constructor(
    config: ConfigService,
    private readonly installations: SlackInstallationService,
  ) {
    this.envBotToken = config.get<string>('SLACK_BOT_TOKEN') || '';
  }

  /** True if at least the env token exists (original workspace) — used by callers that gate on "any Slack config". */
  isConfigured(): boolean {
    return Boolean(this.envBotToken);
  }

  /** Resolve the bot token for a team: OAuth installation first, else env fallback (original workspace). */
  private async tokenFor(teamId: string): Promise<string> {
    const installed = await this.installations.getToken(teamId);
    return installed || this.envBotToken;
  }

  private clientForToken(token: string): WebClient {
    let c = this.clients.get(token);
    if (!c) {
      c = new WebClient(token);
      this.clients.set(token, c);
    }
    return c;
  }

  /** WebClient for the team, or null if no token is available. */
  private async clientFor(teamId: string): Promise<WebClient | null> {
    const token = await this.tokenFor(teamId);
    if (!token) {
      this.logger.warn(`No Slack bot token for team ${teamId} — skipping outbound`);
      return null;
    }
    return this.clientForToken(token);
  }

  /** Bot user id for the team (installation value, else env-token auth.test, cached). '' if unknown. */
  async getBotUserId(teamId: string): Promise<string> {
    const installed = await this.installations.getBotUserId(teamId);
    if (installed) return installed;
    if (!this.envBotToken) return '';
    const cached = this.botUserIdByToken.get(this.envBotToken);
    if (cached) return cached;
    try {
      const res = await this.clientForToken(this.envBotToken).auth.test();
      const id = (res.user_id as string) || '';
      this.botUserIdByToken.set(this.envBotToken, id);
      return id;
    } catch (err) {
      this.logger.error(`auth.test failed: ${err}`);
      return '';
    }
  }

  async sendText(teamId: string, channel: string, text: string): Promise<void> {
    const c = await this.clientFor(teamId);
    if (!c) return;
    await c.chat.postMessage({ channel, text, mrkdwn: true });
  }

  async sendButtons(teamId: string, channel: string, bodyText: string, buttons: SlackButton[]): Promise<void> {
    const c = await this.clientFor(teamId);
    if (!c) return;
    await c.chat.postMessage({ channel, text: bodyText, blocks: this.buildButtonBlocks(bodyText, buttons) });
  }

  async postPlaceholder(teamId: string, channel: string, text: string): Promise<string | undefined> {
    const c = await this.clientFor(teamId);
    if (!c) return undefined;
    try {
      const res = await c.chat.postMessage({ channel, text, mrkdwn: true });
      return res.ts as string | undefined;
    } catch (err) {
      this.logger.warn(`postPlaceholder failed: ${err}`);
      return undefined;
    }
  }

  async updateText(teamId: string, channel: string, ts: string, text: string): Promise<void> {
    const c = await this.clientFor(teamId);
    if (!c) return;
    await c.chat.update({ channel, ts, text });
  }

  async updateButtons(teamId: string, channel: string, ts: string, bodyText: string, buttons: SlackButton[]): Promise<void> {
    const c = await this.clientFor(teamId);
    if (!c) return;
    await c.chat.update({ channel, ts, text: bodyText, blocks: this.buildButtonBlocks(bodyText, buttons) });
  }

  async replyText(teamId: string, channel: string, ts: string | undefined, text: string): Promise<void> {
    if (ts) return this.updateText(teamId, channel, ts, text);
    return this.sendText(teamId, channel, text);
  }

  async replyButtons(teamId: string, channel: string, ts: string | undefined, bodyText: string, buttons: SlackButton[]): Promise<void> {
    if (ts) return this.updateButtons(teamId, channel, ts, bodyText, buttons);
    return this.sendButtons(teamId, channel, bodyText, buttons);
  }

  async downloadFile(teamId: string, urlPrivateDownload: string, mimeType: string): Promise<DownloadedFile> {
    const token = await this.tokenFor(teamId);
    return downloadSlackFile(urlPrivateDownload, token, mimeType);
  }

  private buildButtonBlocks(bodyText: string, buttons: SlackButton[]) {
    return [
      { type: 'section', text: { type: 'mrkdwn', text: bodyText } },
      {
        type: 'actions',
        elements: buttons.map((b) => ({
          type: 'button',
          action_id: b.id,
          value: b.id,
          text: { type: 'plain_text', text: b.title.slice(0, 75) },
        })),
      },
    ];
  }
}
```

- [ ] **Step 2: Typecheck (expect handler errors — fixed in Task 5)**

Run: `cd apps/api && npx tsc --noEmit`
Expected: errors ONLY in the 7 handler files + `slack-bot.service.ts` (they call the old signatures). `slack-client.service.ts` itself must be clean. Do not fix the handlers here — Tasks 5 & 6 do that.

- [ ] **Step 3: Commit**
```bash
git add apps/api/src/modules/slack/slack-client.service.ts
git commit -m "ABA-XXX Slack OAuth: per-team token resolution in SlackClientService"
```

---

## Task 5: Update handler call sites to pass `teamId`

**Files:**
- Modify: `apps/api/src/modules/slack/handlers/command.handler.ts`
- Modify: `apps/api/src/modules/slack/handlers/chat.handler.ts`
- Modify: `apps/api/src/modules/slack/handlers/expense.handler.ts`
- Modify: `apps/api/src/modules/slack/handlers/income.handler.ts`
- Modify: `apps/api/src/modules/slack/handlers/category.handler.ts`
- Modify: `apps/api/src/modules/slack/handlers/voice.handler.ts`
- Modify: `apps/api/src/modules/slack/handlers/photo.handler.ts`

**Transformation rule (apply to every `slackClient`/`client` call in these files):** every `SlackClientService` method now takes `teamId` as its FIRST argument. The teamId is `userState.slackTeamId` (available on every `SlackUserState`). Concretely:
- `this.slackClient.sendText(channel, x)` → `this.slackClient.sendText(userState.slackTeamId, channel, x)`
- `this.slackClient.sendButtons(channel, body, btns)` → `this.slackClient.sendButtons(userState.slackTeamId, channel, body, btns)`
- `this.slackClient.postPlaceholder(channel, x)` → `this.slackClient.postPlaceholder(userState.slackTeamId, channel, x)`
- `this.slackClient.updateText(channel, ts, x)` → `(userState.slackTeamId, channel, ts, x)`
- `this.slackClient.replyText(channel, ts, x)` → `(userState.slackTeamId, channel, ts, x)`
- `this.slackClient.replyButtons(channel, ts, body, btns)` → `(userState.slackTeamId, channel, ts, body, btns)`
- `this.slackClient.downloadFile(url, mime)` → `(userState.slackTeamId, url, mime)`

**Special case — `command.handler.ts` `handleLink`:** it runs BEFORE the user is linked, so there is no `userState`. Its signature is `handleLink(slackUserId, slackTeamId, code, channel, profileName?)`. Use the `slackTeamId` parameter it already receives: every client call inside `handleLink` (and the success-path reply) uses `slackTeamId`, not `userState.slackTeamId`.

Use the actual injected client property name in each file (it is `slackClient` in chat/command/photo; verify expense/income/category/voice — some use `client`; match each file).

- [ ] **Step 1: Apply the rule to all 7 handlers.** Read each file, update every client call site per the rule above. Do not change any other logic.

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: the 7 handlers are now clean. Remaining errors (if any) only in `slack-bot.service.ts` (Task 6).

- [ ] **Step 3: Commit**
```bash
git add apps/api/src/modules/slack/handlers
git commit -m "ABA-XXX Slack OAuth: thread teamId through handler client calls"
```

---

## Task 6: Update `SlackBotService` dispatcher for `teamId`

**Files:**
- Modify: `apps/api/src/modules/slack/slack-bot.service.ts`

The dispatcher calls `this.client.<method>(channel, …)` in a few spots and `this.client.getBotUserId()`. Update them:

- [ ] **Step 1: Update the calls**

- `getBotUserId()` → `getBotUserId(body.team_id)` (in `handleEvent`'s loop-guard).
- In `dispatchMessage(event, teamId, userState)`, the `linkFirst` replies `this.client.sendText(channel, t('linkFirst'))` → `this.client.sendText(teamId, channel, t('linkFirst'))` (the method already receives `teamId` as a param — use it).
- The crash-fallback `this.client.sendText(event.channel, t('somethingWrong', …))` in `handleEvent` → `this.client.sendText(event.event.team_id…)`. Use `body.team_id`: `this.client.sendText(body.team_id, event.channel, t('somethingWrong', userState?.language))`.
- In `handleInteractivity`: compute `const teamId = payload.user.team_id;` (it is always present on `block_actions`). The `linkFirst` reply `this.client.sendText(channelId, t('linkFirst'))` → `this.client.sendText(teamId, channelId, t('linkFirst'))`.
- No other dispatcher calls send messages directly (the rest go through handlers, fixed in Task 5).

(Reference the current file to find exact lines; `handleEvent` already passes `body.team_id` into `dispatchMessage` as the `teamId` argument and into `handleLink`.)

- [ ] **Step 2: Typecheck + build**

Run: `cd apps/api && npx tsc --noEmit && npm run build`
Expected: clean. The whole Slack module compiles with the new signatures.

- [ ] **Step 3: Update existing Slack tests for the new signatures**

The existing `slack-bot.controller.spec.ts` mocks `SlackBotService` (not the client) so it is unaffected. `verify-signature.spec.ts`, `parse-command.spec.ts`, `token-crypto.spec.ts` are unaffected. Run the suite to confirm:
```bash
cd apps/api && npx jest src/modules/slack
```
Expected: all pass. If any spec instantiates `SlackClientService` directly, update its constructor call to pass a mock `SlackInstallationService` and update method calls to teamId-first.

- [ ] **Step 4: Commit**
```bash
git add apps/api/src/modules/slack/slack-bot.service.ts
git commit -m "ABA-XXX Slack OAuth: thread teamId through dispatcher; loop-guard per team"
```

---

## Task 7: OAuth service + controller (`/slack/install`, `/slack/oauth/callback`) (TDD)

**Files:**
- Create: `apps/api/src/modules/slack/slack-oauth.service.ts`
- Create: `apps/api/src/modules/slack/helpers/oauth-pages.ts`
- Create: `apps/api/src/modules/slack/slack-oauth.controller.ts`
- Test: `apps/api/src/modules/slack/slack-oauth.controller.spec.ts`

- [ ] **Step 1: Create the OAuth service**

`apps/api/src/modules/slack/slack-oauth.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';

export interface SlackOAuthResult {
  teamId: string;
  teamName?: string;
  botToken: string;
  botUserId: string;
  appId?: string;
  enterpriseId?: string;
  scope?: string;
  installedBySlackUserId?: string;
}

const SCOPES = 'chat:write,im:history,im:read,im:write,files:read';

@Injectable()
export class SlackOAuthService {
  private readonly logger = new Logger(SlackOAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUrl: string;
  private readonly client = new WebClient();

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('SLACK_CLIENT_ID') || '';
    this.clientSecret = config.get<string>('SLACK_CLIENT_SECRET') || '';
    this.redirectUrl = config.get<string>('SLACK_OAUTH_REDIRECT_URL') || '';
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUrl);
  }

  buildAuthorizeUrl(state: string): string {
    const p = new URLSearchParams({
      client_id: this.clientId,
      scope: SCOPES,
      state,
      redirect_uri: this.redirectUrl,
    });
    return `https://slack.com/oauth/v2/authorize?${p.toString()}`;
  }

  async exchangeCode(code: string): Promise<SlackOAuthResult> {
    const res = (await this.client.oauth.v2.access({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUrl,
    })) as {
      access_token?: string;
      bot_user_id?: string;
      app_id?: string;
      scope?: string;
      team?: { id?: string; name?: string };
      authed_user?: { id?: string };
      enterprise?: { id?: string } | null;
    };
    return {
      teamId: res.team?.id ?? '',
      teamName: res.team?.name,
      botToken: res.access_token ?? '',
      botUserId: res.bot_user_id ?? '',
      appId: res.app_id,
      enterpriseId: res.enterprise?.id,
      scope: res.scope,
      installedBySlackUserId: res.authed_user?.id,
    };
  }
}
```

- [ ] **Step 2: Create the HTML pages helper**

`apps/api/src/modules/slack/helpers/oauth-pages.ts`:
```typescript
function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:64px auto;padding:0 24px;color:#1d1c1d;text-align:center}h1{font-size:20px}p{color:#454245;line-height:1.5}</style></head><body><h1>${title}</h1><p>${body}</p></body></html>`;
}

export function successPage(teamName?: string): string {
  const where = teamName ? `<b>${teamName}</b>` : 'your workspace';
  return page(
    'AI Budget Assistant installed 🎉',
    `The bot was added to ${where}. Open the AI Budget Assistant app → Settings → Chat bots → Slack, generate a 6-character code, then DM the bot <code>link YOUR_CODE</code> to connect your account.`,
  );
}

export function errorPage(message: string): string {
  return page('Installation problem', message);
}

export function notConfiguredPage(): string {
  return page('Not available', 'Slack installation is not configured on this server.');
}
```

- [ ] **Step 3: Write the failing controller test**

`apps/api/src/modules/slack/slack-oauth.controller.spec.ts`:
```typescript
import { Response } from 'express';
import { SlackOAuthController } from './slack-oauth.controller';
import { SlackOAuthService } from './slack-oauth.service';
import { SlackInstallationService } from './slack-installation.service';

function mockRes() {
  const res: Partial<Response> & { _status?: number; _body?: unknown; _redirect?: string } = {};
  res.status = ((c: number) => { res._status = c; return res as Response; }) as Response['status'];
  res.send = ((b?: unknown) => { res._body = b; return res as Response; }) as Response['send'];
  res.redirect = ((url: string) => { res._redirect = url; }) as Response['redirect'];
  return res as Response & { _status?: number; _body?: unknown; _redirect?: string };
}

describe('SlackOAuthController', () => {
  let controller: SlackOAuthController;
  let oauth: { isConfigured: jest.Mock; buildAuthorizeUrl: jest.Mock; exchangeCode: jest.Mock };
  let installations: { upsert: jest.Mock };
  let redis: { set: jest.Mock; del: jest.Mock };

  beforeEach(() => {
    oauth = {
      isConfigured: jest.fn().mockReturnValue(true),
      buildAuthorizeUrl: jest.fn().mockReturnValue('https://slack.com/oauth/v2/authorize?state=S'),
      exchangeCode: jest.fn(),
    };
    installations = { upsert: jest.fn().mockResolvedValue(undefined) };
    redis = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn() };
    controller = new SlackOAuthController(
      oauth as unknown as SlackOAuthService,
      installations as unknown as SlackInstallationService,
      redis as never,
    );
  });

  it('install: stores a state and redirects to the authorize URL', async () => {
    const res = mockRes();
    await controller.install(res);
    expect(redis.set).toHaveBeenCalled();
    expect(res._redirect).toBe('https://slack.com/oauth/v2/authorize?state=S');
  });

  it('callback: rejects an unknown state without upserting', async () => {
    redis.del.mockResolvedValue(0);
    const res = mockRes();
    await controller.callback('code123', 'BADSTATE', undefined, res);
    expect(res._status).toBe(400);
    expect(installations.upsert).not.toHaveBeenCalled();
  });

  it('callback: valid state exchanges the code and upserts the installation', async () => {
    redis.del.mockResolvedValue(1);
    oauth.exchangeCode.mockResolvedValue({ teamId: 'T1', teamName: 'Acme', botToken: 'xoxb-1', botUserId: 'U1' });
    const res = mockRes();
    await controller.callback('code123', 'GOODSTATE', undefined, res);
    expect(oauth.exchangeCode).toHaveBeenCalledWith('code123');
    expect(installations.upsert).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'T1', botTokenPlain: 'xoxb-1', botUserId: 'U1' }));
    expect(res._status).toBe(200);
  });

  it('callback: cancelled install (error param) returns 400 and does not upsert', async () => {
    const res = mockRes();
    await controller.callback(undefined, undefined, 'access_denied', res);
    expect(res._status).toBe(400);
    expect(installations.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run it — verify FAIL**

Run: `cd apps/api && npx jest src/modules/slack/slack-oauth.controller.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Create the controller**

`apps/api/src/modules/slack/slack-oauth.controller.ts`:
```typescript
import { Controller, Get, Inject, Logger, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { SlackOAuthService } from './slack-oauth.service';
import { SlackInstallationService } from './slack-installation.service';
import { SLACK_REDIS } from './types';
import { successPage, errorPage, notConfiguredPage } from './helpers/oauth-pages';

@Controller('slack')
export class SlackOAuthController {
  private readonly logger = new Logger(SlackOAuthController.name);

  constructor(
    private readonly oauth: SlackOAuthService,
    private readonly installations: SlackInstallationService,
    @Inject(SLACK_REDIS) private readonly redis: Redis,
  ) {}

  @Get('install')
  async install(@Res() res: Response): Promise<void> {
    if (!this.oauth.isConfigured()) {
      res.status(503).send(notConfiguredPage());
      return;
    }
    const state = randomBytes(16).toString('hex');
    await this.redis.set(`slack:oauth_state:${state}`, '1', 'EX', 600, 'NX');
    res.redirect(this.oauth.buildAuthorizeUrl(state));
  }

  @Get('oauth/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (error) {
      res.status(400).send(errorPage('Installation was cancelled.'));
      return;
    }
    if (!code || !state) {
      res.status(400).send(errorPage('Missing authorization code or state.'));
      return;
    }
    const existed = await this.redis.del(`slack:oauth_state:${state}`);
    if (existed !== 1) {
      res.status(400).send(errorPage('Invalid or expired link. Please start the installation again.'));
      return;
    }
    try {
      const r = await this.oauth.exchangeCode(code);
      if (!r.teamId || !r.botToken || !r.botUserId) {
        throw new Error('Incomplete OAuth response from Slack');
      }
      await this.installations.upsert({
        teamId: r.teamId,
        teamName: r.teamName,
        botTokenPlain: r.botToken,
        botUserId: r.botUserId,
        appId: r.appId,
        enterpriseId: r.enterpriseId,
        scope: r.scope,
        installedBySlackUserId: r.installedBySlackUserId,
      });
      res.status(200).send(successPage(r.teamName));
    } catch (err) {
      this.logger.error(`OAuth callback failed: ${err instanceof Error ? err.stack || err.message : err}`);
      res.status(500).send(errorPage('Something went wrong installing the app. Please try again.'));
    }
  }
}
```

- [ ] **Step 6: Run it — verify PASS**

Run: `cd apps/api && npx jest src/modules/slack/slack-oauth.controller.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**
```bash
git add apps/api/src/modules/slack/slack-oauth.service.ts apps/api/src/modules/slack/slack-oauth.controller.ts apps/api/src/modules/slack/helpers/oauth-pages.ts apps/api/src/modules/slack/slack-oauth.controller.spec.ts
git commit -m "ABA-XXX Slack OAuth: install + callback endpoints (state CSRF, code exchange)"
```

---

## Task 8: Module wiring + `main.ts` prefix exclude

**Files:**
- Modify: `apps/api/src/modules/slack/slack.module.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Register the new providers + controller**

In `apps/api/src/modules/slack/slack.module.ts`:
- Import `SlackInstallationService`, `SlackOAuthService`, `SlackOAuthController`.
- Add `SlackInstallationService` and `SlackOAuthService` to `providers` (alongside `SlackClientService`).
- Add `SlackOAuthController` to `controllers` (alongside `SlackBotController`).
- Add `SlackInstallationService` to `exports` (so it could be reused; optional but harmless).

(`SlackClientService` now depends on `SlackInstallationService` — both are providers in the same module, so DI resolves. `PrismaService` comes from the global `DatabaseModule` as for the other Slack services.)

- [ ] **Step 2: Exclude the OAuth routes from the API prefix**

In `apps/api/src/main.ts`, add `'slack/install'` and `'slack/oauth/callback'` to the `setGlobalPrefix('api/v1', { exclude: [...] })` array (next to `'slack/events'`, `'slack/interactivity'`). These are GET browser routes; no `rawBody` handling needed.

- [ ] **Step 3: Typecheck + build**

Run: `cd apps/api && npx tsc --noEmit && npm run build`
Expected: clean — full DI graph compiles.

- [ ] **Step 4: Commit**
```bash
git add apps/api/src/modules/slack/slack.module.ts apps/api/src/main.ts
git commit -m "ABA-XXX Slack OAuth: wire installation/oauth providers + exclude install routes from prefix"
```

---

## Task 9: Env vars — `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document the new env vars**

In the Slack block of `.env.example` (after the existing `SLACK_*` lines), add:
```bash
# Slack OAuth (multi-workspace install). Required to let other workspaces add the bot.
# Redirect URL must be registered in the Slack app's OAuth & Permissions → Redirect URLs,
# and Public Distribution activated under Manage Distribution.
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_OAUTH_REDIRECT_URL=https://api.ai-budget.pl/slack/oauth/callback
# 32-byte key (64 hex chars or base64) used to encrypt per-workspace bot tokens at rest.
SLACK_TOKEN_ENC_KEY=
```

- [ ] **Step 2: Commit**
```bash
git add .env.example
git commit -m "ABA-XXX Slack OAuth: document client id/secret, redirect URL, token enc key"
```

---

## Task 10: Mobile — "Add to Slack" button

**Files:**
- Modify: `apps/mobile/app/settings/bots.tsx`
- Modify: all 8 locale files `apps/mobile/src/i18n/locales/*.ts`

- [ ] **Step 1: Add the button to the Slack section**

In `apps/mobile/app/settings/bots.tsx`, inside the Slack section (near the existing `slack://open` button), add an **Add to Slack** button that opens the install URL in the browser:
```tsx
<TouchableOpacity
  style={styles.secondaryButton}
  onPress={() => Linking.openURL(`${getApiBaseOrigin()}/slack/install`)}
>
  <Ionicons name="add-circle-outline" size={18} color="#4A154B" />
  <Text style={styles.secondaryButtonText}>{t('slackBot.addToSlack')}</Text>
</TouchableOpacity>
<Text style={styles.hint}>{t('slackBot.addToSlackHint')}</Text>
```
`getApiBaseOrigin()` must return the API origin WITHOUT the `/api/v1` suffix (the install route is root-level). Derive it from the existing configured API URL: read the same base the API client uses (e.g. `process.env.EXPO_PUBLIC_API_URL` or the constant the http-client uses) and strip a trailing `/api/v1`. Add this tiny helper inline in the file or next to the API base constant — match how the app already exposes its base URL. Reuse the existing `styles.secondaryButton`/`hint` if present; otherwise mirror the styling of the existing `slack://open` button.

- [ ] **Step 2: Add i18n keys (all 8 locales)**

Add to the `slackBot` group in EVERY locale file (`en, de, es, fr, pl, ru, ua, be`):
- `addToSlack` — e.g. EN `"Add to Slack"`.
- `addToSlackHint` — e.g. EN `"Workspace admins: add the bot to your Slack workspace (one-time). Then each member connects their account with a code."`.
Translate properly per language (no English left in non-English files). Use the i18n-add-strings skill if available to keep keys in sync.

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors; no missing-key errors (all 8 locales have the new keys).

- [ ] **Step 4: Commit**
```bash
git add apps/mobile/app/settings/bots.tsx apps/mobile/src/i18n/locales
git commit -m "ABA-XXX Slack OAuth: 'Add to Slack' mobile button + i18n (8 locales)"
```

---

## Task 11: Docs + ABA task

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/wiki/slack-bot.md`

- [ ] **Step 1: Update CLAUDE.md**

In the Slack bot bullet, add a sentence describing multi-workspace OAuth: install via `GET /slack/install` → Slack OAuth → `GET /slack/oauth/callback` exchanges the code and upserts `SlackInstallation` (per-team bot token, **AES-256-GCM encrypted at rest** via `SLACK_TOKEN_ENC_KEY`); `SlackClientService` resolves the bot token per `teamId` (installation → env `SLACK_BOT_TOKEN` fallback for the original workspace) and every outbound method takes a leading `teamId`; both OAuth routes excluded from `/api/v1` in `main.ts`; state-CSRF via Redis `slack:oauth_state:{state}`. New env: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_OAUTH_REDIRECT_URL`, `SLACK_TOKEN_ENC_KEY`. Note the module count bump if applicable (still one `slack` module — no new module).

- [ ] **Step 2: Update the Slack wiki page**

In `docs/wiki/slack-bot.md`, add a "Multi-workspace install (OAuth)" section: the two endpoints, the `SlackInstallation` table, token-at-rest encryption, per-team token resolution with env fallback, the Slack-dashboard runbook (register Redirect URL, activate Public Distribution), and the "Add to Slack" mobile button.

- [ ] **Step 3: Full check suite**

Run from project root:
```bash
npm run typecheck && cd apps/api && npx jest src/modules/slack
```
Expected: typecheck clean; all Slack tests pass (token-crypto, oauth controller, bot controller, verify-signature, parse-command).

- [ ] **Step 4: Create the ABA issue (controller only)**

Run `gh issue list --limit 1 --state all`, compute the next ABA-N, create the issue in English describing the multi-workspace OAuth feature, and reference the number going forward. (Do NOT rewrite the branch's `ABA-XXX` commit messages; resolve to the real number in the issue + final summary.)

- [ ] **Step 5: Commit docs**
```bash
git add CLAUDE.md docs/wiki/slack-bot.md
git commit -m "ABA-XXX Slack OAuth: documentation (CLAUDE.md + wiki)"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** §1 OAuth flow → Tasks 7, 8; §2 data model → Task 1; §3 token crypto → Task 2; §4 per-team client → Tasks 3, 4; §5 handler/dispatcher → Tasks 5, 6; §6 backward compat → Task 4 (`tokenFor` env fallback); §7 mobile → Task 10; §8 env → Task 9; §9 testing → TDD in Tasks 2, 7 + suite in Tasks 6, 11. All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; the only deferred detail is `getApiBaseOrigin()` (Task 10), which is specified as "strip trailing `/api/v1` from the existing API base" — concrete enough.
- **Type consistency:** `SlackClientService` method signatures (teamId-first) defined in Task 4 are applied verbatim by the Task 5 rule and Task 6 dispatcher; `SlackInstallationService.upsert` input shape (`botTokenPlain`, …) is identical in Tasks 3, 7 (controller) and the Task 7 test; `SlackOAuthResult` fields match between the service (Task 7 step 1) and the controller's `upsert` mapping (Task 7 step 5).
- **`ABA-XXX`** is a deliberate placeholder resolved in Task 11.
