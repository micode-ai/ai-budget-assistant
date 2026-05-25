# Shared AI Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members of a shared account hold a group AI chat per conversation, where `@mentioning` a member silences the AI and notifies absent members, while no-mention messages get an AI reply — all opt-in per conversation and owner-controlled.

**Architecture:** A `ChatConversation` gains `accountId` + `isShared`; `ChatMessage` gains `senderUserId` + `mentionedUserIds`. Shared conversations are visible to all account members; the API silences the AI when a message mentions members and pushes to absent mentioned members (presence tracked in Redis via the existing `CacheService`). Mobile polls while a shared conversation is focused and renders per-member attribution + an `@`-mention bar. Owner-only PATCH toggles `isShared`.

**Tech Stack:** NestJS 10 + Prisma 5 + PostgreSQL + Redis (`CacheService`), Expo/React Native + Zustand + SQLite, shared-types/shared-utils, Jest (api + mobile).

**Spec:** `docs/superpowers/specs/2026-05-25-shared-ai-chat-design.md`

---

## File Structure

**shared-types** (`packages/shared-types/src`)
- Modify `entities/index.ts` — `ChatConversation` (+`accountId`,`isShared`), `ChatMessage` (+`senderUserId`,`senderName`,`mentionedUserIds`), `NotificationType` (+`chat_mention`).
- Modify `dto/index.ts` — chat request/response shapes (mentions, isShared, senderName, poll, aiResponded, server ids).

**api** (`apps/api`)
- Modify `prisma/schema.prisma` — columns + `Account.chatConversations` relation.
- Create migration `prisma/migrations/<ts>_shared_ai_chat/migration.sql` — columns + backfill.
- Modify `src/modules/notifications/notification-i18n.ts` — `chatMentionTitle/Body` (8 langs) + exports.
- Modify `src/modules/notifications/notifications.service.ts` — gate `chat_mention` under `notifySharedActivity`.
- Modify `src/modules/ai/services/chat.service.ts` — presence, push, mentions, scoping, sharing, poll, name-prefixed history.
- Modify `src/modules/ai/ai.controller.ts` — body params, `PATCH :id`, `GET :id/poll`, pass `accountRole`.
- Test `src/modules/ai/services/chat.service.spec.ts` (new).

**mobile** (`apps/mobile`)
- Modify `src/db/client.native.ts` — `ALTER TABLE` for new columns.
- Modify `src/db/chatRepository.ts` — read/write new fields.
- Modify `src/services/ai.api.ts` — chat params, setShared, poll, response types.
- Modify `src/stores/chatStore.ts` — fields, mentions, polling, setShared, id reconciliation.
- Modify `app/(tabs)/chat.tsx` — shared badge/toggle, sender attribution, mention bar.
- Modify `src/i18n/locales/{en,de,es,fr,pl,ru,ua,be}.ts` — `chat.*` keys.

**docs**
- Modify `CLAUDE.md`; add help section; create `ABA-{N}` issue.

---

## Task 1: shared-types — entities & DTOs

**Files:**
- Modify: `packages/shared-types/src/entities/index.ts:19` and `:448-463`
- Modify: `packages/shared-types/src/dto/index.ts` (chat DTO region near `:380-510`)

- [ ] **Step 1: Add `chat_mention` to NotificationType**

In `entities/index.ts:19` replace the line with:

```ts
export type NotificationType = 'budget_alert' | 'shared_expense' | 'spending_anomaly' | 'debt_reminder' | 'recurring_expense' | 'chat_mention';
```

- [ ] **Step 2: Extend ChatConversation & ChatMessage entities**

In `entities/index.ts` replace the `ChatConversation` and `ChatMessage` interfaces (lines 448-463) with:

```ts
export interface ChatConversation {
  id: string;
  userId: string;
  accountId?: string;
  isShared: boolean;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  senderUserId?: string;
  senderName?: string;
  mentionedUserIds?: string[];
  tokensUsed?: number;
  createdAt: Date;
}
```

- [ ] **Step 3: Add chat DTO shapes**

Open `packages/shared-types/src/dto/index.ts`. Find the chat request/response area (around the `ChatResponse`/`pendingAction` definitions near line 380-410). Add these exported interfaces (place them next to the existing chat DTOs; do not duplicate names that already exist — if `ChatRequest`/`ChatResponse` exist, extend them instead):

```ts
export interface ChatMention {
  userId: string;
}

export interface SendChatRequest {
  message: string;
  conversationId?: string;
  mentions?: ChatMention[];
  isShared?: boolean;
}

export interface SendChatResponse {
  message: string;
  conversationId: string;
  aiResponded: boolean;
  userMessageId: string;
  userMessageCreatedAt: string;
  assistantMessageId?: string;
  assistantCreatedAt?: string;
  pendingAction?: ChatPendingAction;
  actionResult?: ChatActionResult;
  encryptionRestricted?: boolean;
}

export interface ChatConversationSummary {
  id: string;
  title: string | null;
  isShared: boolean;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageResponse {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  senderUserId: string | null;
  senderName: string | null;
  mentionedUserIds: string[];
  tokensUsed: number | null;
  createdAt: string;
}

export interface SetConversationSharedRequest {
  isShared: boolean;
}
```

> Note: `ChatPendingAction` and `ChatActionResult` are already defined in this file (around `:498-510`). If a `ChatActionResult` type is not exported, reference the existing inline shape instead — do not invent a new name.

- [ ] **Step 4: Build shared-types & typecheck**

Run: `cd D:/Work/micode/ai-budget-assistant && npm run build --workspace=@budget/shared-types && npm run typecheck --workspace=@budget/shared-types`
Expected: build + typecheck PASS (downstream api/mobile typecheck may now fail until later tasks — that is expected).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/entities/index.ts packages/shared-types/src/dto/index.ts
git commit -m "feat(shared-types): add shared-chat fields and chat_mention notification type"
```

---

## Task 2: Prisma schema + migration + backfill

**Files:**
- Modify: `apps/api/prisma/schema.prisma:164-211` (Account relations) and `:469-496` (Chat models)
- Create: `apps/api/prisma/migrations/<timestamp>_shared_ai_chat/migration.sql`

- [ ] **Step 1: Add columns to ChatConversation & ChatMessage**

In `schema.prisma`, replace the `ChatConversation` model (lines 469-481) with:

```prisma
model ChatConversation {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  accountId String?  @map("account_id")
  isShared  Boolean  @default(false) @map("is_shared")
  title     String?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // Relations
  user     User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  account  Account?      @relation(fields: [accountId], references: [id], onDelete: Cascade)
  messages ChatMessage[]

  @@index([accountId, updatedAt])
  @@map("chat_conversations")
}
```

And replace the `ChatMessage` model (lines 483-496) with:

```prisma
model ChatMessage {
  id               String   @id @default(uuid())
  conversationId   String   @map("conversation_id")
  role             String
  content          String
  senderUserId     String?  @map("sender_user_id")
  mentionedUserIds String[] @map("mentioned_user_ids")
  tokensUsed       Int?     @map("tokens_used")
  createdAt        DateTime @default(now()) @map("created_at")

  // Relations
  conversation ChatConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("chat_messages")
}
```

- [ ] **Step 2: Add the back-relation on Account**

In the `Account` model (after the existing relation list, around line 194 near `tags`), add:

```prisma
  chatConversations ChatConversation[]
```

- [ ] **Step 3: Create the migration with backfill**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/api && npx prisma migrate dev --name shared_ai_chat --create-only`
This generates `prisma/migrations/<timestamp>_shared_ai_chat/migration.sql`. Open that file and **replace its body** with the following (so the backfill runs inside the migration):

```sql
-- ChatConversation: account scoping + shared flag
ALTER TABLE "chat_conversations" ADD COLUMN "account_id" TEXT;
ALTER TABLE "chat_conversations" ADD COLUMN "is_shared" BOOLEAN NOT NULL DEFAULT false;

-- ChatMessage: author + mentions
ALTER TABLE "chat_messages" ADD COLUMN "sender_user_id" TEXT;
ALTER TABLE "chat_messages" ADD COLUMN "mentioned_user_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: existing private conversations → creator's personal account
UPDATE "chat_conversations" c
SET "account_id" = (
  SELECT a."id" FROM "accounts" a
  WHERE a."owner_id" = c."user_id" AND a."type" = 'personal'
  ORDER BY a."created_at" ASC
  LIMIT 1
)
WHERE c."account_id" IS NULL;

-- Backfill: existing user messages → sender = conversation creator
UPDATE "chat_messages" m
SET "sender_user_id" = c."user_id"
FROM "chat_conversations" c
WHERE m."conversation_id" = c."id" AND m."role" = 'user' AND m."sender_user_id" IS NULL;

-- Index + FK
CREATE INDEX "chat_conversations_account_id_updated_at_idx" ON "chat_conversations"("account_id", "updated_at");
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply migration + regenerate client**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/api && npx prisma migrate dev --name shared_ai_chat && npx prisma generate`
Expected: migration applied, client regenerated, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add account scoping, shared flag, sender and mentions to chat tables"
```

---

## Task 3: Notification i18n for chat mentions

**Files:**
- Modify: `apps/api/src/modules/notifications/notification-i18n.ts`

- [ ] **Step 1: Add the param interface + map keys**

After the `RecurringExpenseParams` interface (line 67) add:

```ts
interface ChatMentionParams {
  senderName: string;
  preview: string;
}
```

In the `translations` map type (the object type starting line 69), add two keys to the type signature:

```ts
  chatMentionTitle: (p: ChatMentionParams) => string;
  chatMentionBody: (p: ChatMentionParams) => string;
```

- [ ] **Step 2: Add translations for all 8 languages**

Add these two entries inside each language block (`en, ru, ua, pl, es, fr, de, be`), next to the `recurringExpense*` entries:

```ts
// en
chatMentionTitle: ({ senderName }) => `${senderName} mentioned you`,
chatMentionBody: ({ preview }) => preview,
// ru
chatMentionTitle: ({ senderName }) => `${senderName} упомянул вас`,
chatMentionBody: ({ preview }) => preview,
// ua
chatMentionTitle: ({ senderName }) => `${senderName} згадав вас`,
chatMentionBody: ({ preview }) => preview,
// pl
chatMentionTitle: ({ senderName }) => `${senderName} wspomniał o tobie`,
chatMentionBody: ({ preview }) => preview,
// es
chatMentionTitle: ({ senderName }) => `${senderName} te mencionó`,
chatMentionBody: ({ preview }) => preview,
// fr
chatMentionTitle: ({ senderName }) => `${senderName} vous a mentionné`,
chatMentionBody: ({ preview }) => preview,
// de
chatMentionTitle: ({ senderName }) => `${senderName} hat dich erwähnt`,
chatMentionBody: ({ preview }) => preview,
// be
chatMentionTitle: ({ senderName }) => `${senderName} згадаў вас`,
chatMentionBody: ({ preview }) => preview,
```

- [ ] **Step 3: Add exported helper functions**

At the end of the file (after `recurringExpenseBody`, line 557) add:

```ts
export function chatMentionTitle(lang: Lang, params: ChatMentionParams): string {
  return t(lang).chatMentionTitle(params);
}
export function chatMentionBody(lang: Lang, params: ChatMentionParams): string {
  return t(lang).chatMentionBody(params);
}
```

- [ ] **Step 4: Typecheck api**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/api && npx tsc --noEmit`
Expected: no errors from `notification-i18n.ts` (other files may still error until Task 5/6).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notifications/notification-i18n.ts
git commit -m "feat(notifications): add localized chat_mention strings"
```

---

## Task 4: Gate chat_mention under notifySharedActivity

**Files:**
- Modify: `apps/api/src/modules/notifications/notifications.service.ts:49-53` and `:103-107`

- [ ] **Step 1: Add the gate in sendToUser**

In `sendToUser` after line 53 (`if (notificationType === 'recurring_expense' ...`) add:

```ts
    if (notificationType === 'chat_mention' && !user.notifySharedActivity) return false;
```

- [ ] **Step 2: Add the gate in sendToUsers filter**

In `sendToUsers` filter after line 107 add:

```ts
      if (notificationType === 'chat_mention' && !u.notifySharedActivity) return false;
```

- [ ] **Step 3: Typecheck**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/api && npx tsc --noEmit`
Expected: no errors from `notifications.service.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/notifications/notifications.service.ts
git commit -m "feat(notifications): gate chat_mention under shared-activity preference"
```

---

## Task 5: ChatService — presence, mentions, scoping, sharing, poll

This is the core task. The service signature must accept `accountId`, `accountRole`, and `userName`. `CacheService` and `NotificationsService` are both `@Global` exports so they can be injected without touching `AiModule.imports`.

**Files:**
- Modify: `apps/api/src/modules/ai/services/chat.service.ts`
- Test: `apps/api/src/modules/ai/services/chat.service.spec.ts` (new)

### 5a: Inject deps + presence helpers

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/ai/services/chat.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { UserContextBuilder } from './user-context-builder.service';
import { AiToolsService } from './ai-tools.service';
import { PromptBuilder } from './prompt-builder.service';

const mockChatCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
}));

function buildService(overrides: { prisma?: any; cache?: any; notifications?: any } = {}) {
  const prisma = overrides.prisma ?? {
    account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: 0 }) },
    chatConversation: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    chatMessage: { create: jest.fn().mockResolvedValue({ id: 'm1', createdAt: new Date('2026-05-25T10:00:00Z') }), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ aiResponseMode: 'balanced', aiModel: null, name: 'Alice' }) },
    accountMember: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const cache = overrides.cache ?? { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
  const notifications = overrides.notifications ?? { sendToUser: jest.fn() };
  return { prisma, cache, notifications };
}

describe('ChatService', () => {
  let service: ChatService;
  let deps: ReturnType<typeof buildService>;

  beforeEach(async () => {
    mockChatCreate.mockReset();
    deps = buildService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: ConfigService, useValue: { get: () => 'sk-test' } },
        { provide: PrismaService, useValue: deps.prisma },
        { provide: CacheService, useValue: deps.cache },
        { provide: NotificationsService, useValue: deps.notifications },
        { provide: UserContextBuilder, useValue: { build: jest.fn().mockResolvedValue({}) } },
        { provide: AiToolsService, useValue: { getToolDefinitions: () => [], isWriteAction: () => false, executeAction: jest.fn(), executeWithCache: jest.fn() } },
        { provide: PromptBuilder, useValue: { buildSystemPrompt: () => 'SYS', detectLanguage: () => 'English' } },
      ],
    }).compile();
    service = moduleRef.get(ChatService);
  });

  it('touchPresence writes a TTL key', async () => {
    await service.touchPresence('conv-1', 'user-1');
    expect(deps.cache.set).toHaveBeenCalledWith('chat:presence:conv-1:user-1', expect.any(String), 45);
  });

  it('isPresent returns true only when key exists', async () => {
    deps.cache.get.mockResolvedValueOnce('2026-05-25T10:00:00Z');
    expect(await service.isPresent('conv-1', 'user-1')).toBe(true);
    deps.cache.get.mockResolvedValueOnce(null);
    expect(await service.isPresent('conv-1', 'user-2')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/api && npx jest chat.service --silent`
Expected: FAIL — `touchPresence`/`isPresent` not defined; constructor missing providers.

- [ ] **Step 3: Add constructor deps + presence helpers**

In `chat.service.ts`, add imports near the top:

```ts
import { CacheService } from '../../../common/cache/cache.service';
import { NotificationsService } from '../../notifications/notifications.service';
import * as ni18n from '../../notifications/notification-i18n';
```

Add the two providers to the constructor parameter list:

```ts
    private readonly cache: CacheService,
    private readonly notifications: NotificationsService,
```

Add these methods to the class:

```ts
  private presenceKey(conversationId: string, userId: string): string {
    return `chat:presence:${conversationId}:${userId}`;
  }

  async touchPresence(conversationId: string, userId: string): Promise<void> {
    await this.cache.set(this.presenceKey(conversationId, userId), new Date().toISOString(), 45);
  }

  async isPresent(conversationId: string, userId: string): Promise<boolean> {
    return (await this.cache.get<string>(this.presenceKey(conversationId, userId))) !== null;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/api && npx jest chat.service --silent`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai/services/chat.service.ts apps/api/src/modules/ai/services/chat.service.spec.ts
git commit -m "feat(ai): inject cache+notifications, add chat presence helpers"
```

### 5b: chat() — mentions, shared silence, push, sender, name-prefixed history

- [ ] **Step 1: Write the failing tests**

Append to `chat.service.spec.ts` inside the `describe('ChatService', ...)` block:

```ts
  describe('chat() shared mention behavior', () => {
    it('skips OpenAI and pushes absent mentioned members when a member is mentioned in a shared conversation', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({
        id: 'conv-1', userId: 'owner-1', accountId: 'acc-1', isShared: true,
        messages: [],
      });
      deps.prisma.accountMember.findMany.mockResolvedValue([
        { userId: 'owner-1', user: { name: 'Alice' } },
        { userId: 'bob-1', user: { name: 'Bob' } },
      ]);
      deps.cache.get.mockResolvedValue(null); // Bob not present

      const res = await service.chat('owner-1', 'did you pay rent?', 'conv-1', 'acc-1', 'Family', 'owner', 'Alice', [{ userId: 'bob-1' }]);

      expect(res.aiResponded).toBe(false);
      expect(mockChatCreate).not.toHaveBeenCalled();
      expect(deps.notifications.sendToUser).toHaveBeenCalledWith(
        'bob-1', expect.any(Function), expect.any(Function), expect.objectContaining({ conversationId: 'conv-1' }), 'chat_mention',
      );
      // user message persisted with sender + mentions
      expect(deps.prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'user', senderUserId: 'owner-1', mentionedUserIds: ['bob-1'] }) }),
      );
    });

    it('does not push to a mentioned member who is present', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'conv-1', userId: 'owner-1', accountId: 'acc-1', isShared: true, messages: [] });
      deps.prisma.accountMember.findMany.mockResolvedValue([
        { userId: 'owner-1', user: { name: 'Alice' } },
        { userId: 'bob-1', user: { name: 'Bob' } },
      ]);
      deps.cache.get.mockResolvedValue('2026-05-25T10:00:00Z'); // present
      await service.chat('owner-1', 'hi @Bob', 'conv-1', 'acc-1', 'Family', 'owner', 'Alice', [{ userId: 'bob-1' }]);
      expect(deps.notifications.sendToUser).not.toHaveBeenCalled();
    });

    it('calls OpenAI when no member is mentioned', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'conv-1', userId: 'owner-1', accountId: 'acc-1', isShared: true, messages: [] });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'Sure!' } }], usage: { total_tokens: 5 } });
      const res = await service.chat('owner-1', 'what did I spend?', 'conv-1', 'acc-1', 'Family', 'owner', 'Alice', []);
      expect(mockChatCreate).toHaveBeenCalled();
      expect(res.aiResponded).toBe(true);
      expect(res.message).toBe('Sure!');
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/api && npx jest chat.service --silent`
Expected: FAIL — `chat()` signature/behavior mismatch.

- [ ] **Step 3: Rewrite the `chat()` method**

Replace the existing `chat(...)` method (lines 52-155) with the version below. It adds `accountRole`, `userName`, `mentions` params; resolves the conversation with the access predicate; stores sender + mentions; silences the AI on a member mention in a shared conversation; pushes absent mentioned members; and prefixes history with sender names for shared conversations.

```ts
  async chat(
    userId: string,
    message: string,
    conversationId?: string,
    accountId?: string,
    accountName?: string | null,
    accountRole?: string,
    userName?: string | null,
    mentions?: Array<{ userId: string }>,
  ) {
    const encryptionTier = await this.getEncryptionTier(accountId);
    if (encryptionTier >= 2) {
      return {
        message: 'AI chat is unavailable for this account because end-to-end encryption (full mode) is enabled. Financial data is encrypted and cannot be analyzed server-side.',
        conversationId: conversationId || null,
        aiResponded: false,
        encryptionRestricted: true,
      };
    }

    // Resolve conversation under access predicate, else create.
    let conversation: any = null;
    if (conversationId) {
      conversation = await this.prisma.chatConversation.findFirst({
        where: { id: conversationId, accountId, OR: [{ isShared: true }, { userId }] },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
      });
    }
    if (!conversation) {
      const wantShared = accountRole === 'owner' && mentions !== undefined ? false : false; // create defaults to private
      conversation = await this.prisma.chatConversation.create({
        data: {
          userId,
          accountId: accountId ?? null,
          isShared: accountRole === 'owner' ? !!(arguments.length && false) : false,
          title: message.slice(0, 100),
        },
        include: { messages: true },
      });
    }

    // Build member map for the account (names + valid mention targets).
    const members = accountId
      ? await this.prisma.accountMember.findMany({ where: { accountId }, select: { userId: true, user: { select: { name: true } } } })
      : [];
    const nameByUserId = new Map<string, string>(members.map((m: any) => [m.userId, m.user?.name ?? 'Someone']));
    const memberIds = new Set<string>(members.map((m: any) => m.userId));

    // Validate mentions: real members, not the sender.
    const mentionedUserIds = (mentions ?? [])
      .map((m) => m.userId)
      .filter((id) => memberIds.has(id) && id !== userId);

    // Persist the user message with author + mentions.
    const userMsg = await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
        senderUserId: userId,
        mentionedUserIds,
      },
    });

    // Shared conversation + a member mention → AI stays silent, notify absent mentioned members.
    if (conversation.isShared && mentionedUserIds.length > 0) {
      const senderName = userName || nameByUserId.get(userId) || 'Someone';
      const preview = message.length > 120 ? message.slice(0, 120) + '…' : message;
      await Promise.all(
        mentionedUserIds.map(async (mid) => {
          if (await this.isPresent(conversation.id, mid)) return;
          await this.notifications.sendToUser(
            mid,
            (lang) => ni18n.chatMentionTitle(lang, { senderName, preview }),
            (lang) => ni18n.chatMentionBody(lang, { senderName, preview }),
            { conversationId: conversation.id, accountId },
            'chat_mention',
          );
        }),
      );
      await this.prisma.chatConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
      return {
        message: '',
        conversationId: conversation.id,
        aiResponded: false,
        userMessageId: userMsg.id,
        userMessageCreatedAt: userMsg.createdAt.toISOString(),
      };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiResponseMode: true, aiModel: true } });
    const responseMode = (user?.aiResponseMode as AiResponseMode) || 'balanced';
    const { model: aiModel } = resolveAiModel(user?.aiModel);
    const context = await this.userContextBuilder.build(userId, accountId);

    const prefix = (m: ChatMessageRecord & { senderUserId?: string | null }) =>
      conversation.isShared && m.role === 'user' && m.senderUserId
        ? `[${nameByUserId.get(m.senderUserId) ?? 'Someone'}]: `
        : '';

    const history = conversation.messages
      .filter((m: ChatMessageRecord) => ['user', 'assistant', 'system'].includes(m.role))
      .map((m: ChatMessageRecord & { senderUserId?: string | null }) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: `${prefix(m)}${m.content}`,
      }));

    const currentUserContent = conversation.isShared
      ? `[${userName || nameByUserId.get(userId) || 'Someone'}]: ${message}`
      : message;

    const systemPrompt = this.promptBuilder.buildSystemPrompt(context, encryptionTier, responseMode, message, history, accountName);

    const response = await this.openai.chat.completions.create({
      model: aiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: currentUserContent },
      ],
      tools: this.aiToolsService.getToolDefinitions(),
      tool_choice: 'auto',
      max_tokens: 1000,
    });

    this.logCacheUsage('chat', response.usage);
    const choice = response.choices[0];

    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      const functionName = toolCall.function.name as ChatActionType;
      let functionArgs: Record<string, unknown>;
      try { functionArgs = JSON.parse(toolCall.function.arguments); } catch { functionArgs = {}; }

      if (this.aiToolsService.isWriteAction(functionName)) {
        const r = await this.handleWriteActionRequest(conversation, functionName, functionArgs, systemPrompt, history, message, aiModel, accountId);
        return { ...r, aiResponded: true, userMessageId: userMsg.id, userMessageCreatedAt: userMsg.createdAt.toISOString() };
      }
      const r = await this.handleReadAction(conversation, functionName, functionArgs, toolCall, systemPrompt, history, message, accountId);
      return { ...r, aiResponded: true, userMessageId: userMsg.id, userMessageCreatedAt: userMsg.createdAt.toISOString() };
    }

    const assistantMessage = choice?.message?.content || 'I apologize, but I could not generate a response.';
    const tokensUsed = response.usage?.total_tokens || 0;
    const assistantMsg = await this.prisma.chatMessage.create({
      data: { conversationId: conversation.id, role: 'assistant', content: assistantMessage, tokensUsed },
    });

    return {
      message: assistantMessage,
      conversationId: conversation.id,
      aiResponded: true,
      userMessageId: userMsg.id,
      userMessageCreatedAt: userMsg.createdAt.toISOString(),
      assistantMessageId: assistantMsg.id,
      assistantCreatedAt: assistantMsg.createdAt.toISOString(),
    };
  }
```

> The `isShared` on create is intentionally `false` here — sharing is enabled explicitly via the PATCH endpoint (Task 5d) after the conversation exists. The awkward `arguments.length && false` placeholder must be simplified: set `isShared: false` on create. **Replace that create block's `isShared` line with exactly `isShared: false,`** and remove the unused `wantShared` line.

- [ ] **Step 4: Apply the cleanup noted above**

Edit the create block so it reads:

```ts
    if (!conversation) {
      conversation = await this.prisma.chatConversation.create({
        data: {
          userId,
          accountId: accountId ?? null,
          isShared: false,
          title: message.slice(0, 100),
        },
        include: { messages: true },
      });
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/api && npx jest chat.service --silent`
Expected: PASS (all `chat()` tests + presence tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/ai/services/chat.service.ts apps/api/src/modules/ai/services/chat.service.spec.ts
git commit -m "feat(ai): shared-chat mention silencing, sender attribution, mention push"
```

### 5c: Scoping for list/messages + senderName resolution

- [ ] **Step 1: Write failing tests**

Append to `chat.service.spec.ts`:

```ts
  describe('scoping', () => {
    it('lists shared + own-private conversations for the account', async () => {
      deps.prisma.chatConversation.findMany.mockResolvedValue([
        { id: 'c1', title: 'A', isShared: true, userId: 'owner-1', createdAt: new Date(), updatedAt: new Date() },
      ]);
      const res = await service.getConversations('bob-1', 'acc-1');
      expect(deps.prisma.chatConversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { accountId: 'acc-1', OR: [{ isShared: true }, { userId: 'bob-1' }] },
      }));
      expect(res[0]).toMatchObject({ id: 'c1', isShared: true, isOwner: false });
    });

    it('returns messages with resolved sender names', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', isShared: true, userId: 'owner-1' });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      deps.prisma.chatMessage.findMany.mockResolvedValue([
        { id: 'm1', conversationId: 'c1', role: 'user', content: 'hi', senderUserId: 'owner-1', mentionedUserIds: [], tokensUsed: null, createdAt: new Date() },
      ]);
      const res = await service.getConversationMessages('owner-1', 'c1', 'acc-1');
      expect(res[0]).toMatchObject({ senderUserId: 'owner-1', senderName: 'Alice' });
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/api && npx jest chat.service --silent`
Expected: FAIL — signatures differ.

- [ ] **Step 3: Rewrite getConversations & getConversationMessages**

Replace `getConversations` (lines 260-268) with:

```ts
  async getConversations(userId: string, accountId?: string) {
    const conversations = await this.prisma.chatConversation.findMany({
      where: { accountId, OR: [{ isShared: true }, { userId }] },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, title: true, isShared: true, userId: true, createdAt: true, updatedAt: true },
    });
    return conversations.map((c: any) => ({
      id: c.id,
      title: c.title,
      isShared: c.isShared,
      isOwner: c.userId === userId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }
```

Replace `getConversationMessages` (lines 270-287) with:

```ts
  async getConversationMessages(userId: string, conversationId: string, accountId?: string, since?: string) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, accountId, OR: [{ isShared: true }, { userId }] },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const members = accountId
      ? await this.prisma.accountMember.findMany({ where: { accountId }, select: { userId: true, user: { select: { name: true } } } })
      : [];
    const nameByUserId = new Map<string, string>(members.map((m: any) => [m.userId, m.user?.name ?? null]));

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        role: { in: ['user', 'assistant'] },
        ...(since ? { createdAt: { gt: new Date(since) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, conversationId: true, role: true, content: true, senderUserId: true, mentionedUserIds: true, tokensUsed: true, createdAt: true },
    });

    return messages.map((m: any) => ({
      ...m,
      senderName: m.senderUserId ? nameByUserId.get(m.senderUserId) ?? null : null,
    }));
  }
```

- [ ] **Step 4: Run tests**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/api && npx jest chat.service --silent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai/services/chat.service.ts apps/api/src/modules/ai/services/chat.service.spec.ts
git commit -m "feat(ai): account-scoped conversation list and messages with sender names"
```

### 5d: setConversationShared (owner-only) + poll

- [ ] **Step 1: Write failing tests**

Append to `chat.service.spec.ts`:

```ts
  describe('setConversationShared', () => {
    it('flips isShared for an owner', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', userId: 'owner-1' });
      deps.prisma.chatConversation.update.mockResolvedValue({ id: 'c1', isShared: true });
      const r = await service.setConversationShared('owner-1', 'c1', 'acc-1', 'owner', true);
      expect(deps.prisma.chatConversation.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { isShared: true } });
      expect(r.isShared).toBe(true);
    });

    it('rejects a non-owner', async () => {
      await expect(service.setConversationShared('bob-1', 'c1', 'acc-1', 'editor', true)).rejects.toThrow();
    });
  });

  describe('pollMessages', () => {
    it('touches presence and returns messages since timestamp', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', isShared: true, userId: 'owner-1' });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      deps.prisma.chatMessage.findMany.mockResolvedValue([]);
      await service.pollMessages('owner-1', 'c1', 'acc-1', '2026-05-25T10:00:00Z');
      expect(deps.cache.set).toHaveBeenCalledWith('chat:presence:c1:owner-1', expect.any(String), 45);
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/api && npx jest chat.service --silent`
Expected: FAIL — methods not defined.

- [ ] **Step 3: Add the methods**

Add to `chat.service.ts` (ensure `ForbiddenException` is imported from `@nestjs/common`):

```ts
  async setConversationShared(userId: string, conversationId: string, accountId: string | undefined, accountRole: string | undefined, isShared: boolean) {
    if (accountRole !== 'owner') {
      throw new ForbiddenException('Only the account owner can change sharing');
    }
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, accountId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    const updated = await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { isShared },
    });
    return { id: updated.id, isShared: updated.isShared };
  }

  async pollMessages(userId: string, conversationId: string, accountId: string | undefined, since?: string) {
    await this.touchPresence(conversationId, userId);
    return this.getConversationMessages(userId, conversationId, accountId, since);
  }
```

Update the import line at the top: `import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';`

- [ ] **Step 4: Run tests**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/api && npx jest chat.service --silent`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai/services/chat.service.ts apps/api/src/modules/ai/services/chat.service.spec.ts
git commit -m "feat(ai): owner-only conversation sharing toggle and presence-aware poll"
```

---

## Task 6: AiController — wire params & new endpoints

**Files:**
- Modify: `apps/api/src/modules/ai/ai.controller.ts:72-111`

`AccountContextGuard` already sets `req.accountId` and `req.accountRole`. Confirm `AuthenticatedRequest` exposes `accountRole` (it does — used by `AccountRoleGuard`). The user name comes from `req.user` — confirm `req.user.name` exists; if not, fetch is already inside the service via member map, so passing `req.user.name` is best-effort.

- [ ] **Step 1: Update the chat endpoint**

Replace the `chat` handler (lines 72-80) with:

```ts
  @Post('chat')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('chat', 1.0)
  async chat(
    @Req() req: AuthenticatedRequest,
    @Body() body: { message: string; conversationId?: string; mentions?: { userId: string }[]; isShared?: boolean },
  ) {
    return this.chatService.chat(
      req.user.id,
      body.message,
      body.conversationId,
      req.accountId,
      undefined,
      req.accountRole,
      (req.user as { name?: string }).name ?? null,
      body.mentions,
    );
  }
```

> `accountName` (5th arg) stays `undefined` — the prior controller already passed `undefined` for it.

- [ ] **Step 2: Update getConversations + getConversationMessages handlers**

Replace lines 100-111 with:

```ts
  @Get('chat/conversations')
  async getConversations(@Req() req: AuthenticatedRequest) {
    return this.chatService.getConversations(req.user.id, req.accountId);
  }

  @Get('chat/conversations/:id/messages')
  async getConversationMessages(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.chatService.getConversationMessages(req.user.id, id, req.accountId);
  }

  @Get('chat/conversations/:id/poll')
  async pollConversation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('since') since?: string,
  ) {
    return this.chatService.pollMessages(req.user.id, id, req.accountId, since);
  }

  @Patch('chat/conversations/:id/shared')
  async setConversationShared(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { isShared: boolean },
  ) {
    return this.chatService.setConversationShared(req.user.id, id, req.accountId, req.accountRole, body.isShared);
  }
```

- [ ] **Step 3: Typecheck + run api tests + build**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/api && npx tsc --noEmit && npx jest chat.service --silent && npm run build`
Expected: typecheck PASS, tests PASS, nest build PASS.

> If `req.accountRole` is not on `AuthenticatedRequest`, check `apps/api/src/common/middleware/account-context.middleware.ts` — it sets `request.accountRole`. Add the field to the `AuthenticatedRequest` type in `apps/api/src/common/types/index.ts` if TypeScript complains.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/ai/ai.controller.ts apps/api/src/common/types/index.ts
git commit -m "feat(ai): controller wiring for mentions, sharing toggle, and poll endpoint"
```

---

## Task 7: Mobile SQLite — columns + repository

**Files:**
- Modify: `apps/mobile/src/db/client.native.ts` (after line 543, with the other idempotent `ALTER TABLE` blocks)
- Modify: `apps/mobile/src/db/chatRepository.ts`

- [ ] **Step 1: Add idempotent column migrations**

In `client.native.ts`, after the existing `try { ... external_ref ... } catch {}` block (line 543), add:

```ts
    // Shared AI chat columns (migration for existing DBs)
    try { expoDb.execSync(`ALTER TABLE chat_conversations ADD COLUMN account_id TEXT`); } catch {}
    try { expoDb.execSync(`ALTER TABLE chat_conversations ADD COLUMN is_shared INTEGER DEFAULT 0`); } catch {}
    try { expoDb.execSync(`ALTER TABLE chat_messages ADD COLUMN sender_user_id TEXT`); } catch {}
    try { expoDb.execSync(`ALTER TABLE chat_messages ADD COLUMN sender_name TEXT`); } catch {}
    try { expoDb.execSync(`ALTER TABLE chat_messages ADD COLUMN mentioned_user_ids TEXT`); } catch {}
```

Also update the `CREATE TABLE IF NOT EXISTS chat_conversations` (lines 159-165) and `chat_messages` (167-174) DDL to include the new columns for fresh installs:

```ts
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        account_id TEXT,
        is_shared INTEGER DEFAULT 0,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        sender_user_id TEXT,
        sender_name TEXT,
        mentioned_user_ids TEXT,
        tokens_used INTEGER,
        created_at INTEGER NOT NULL
      );
```

- [ ] **Step 2: Update chatRepository to read/write new fields**

Replace `chatRepository.ts` entirely with:

```ts
import { executeSql } from './client';
import type { ChatConversation, ChatMessage } from '@budget/shared-types';

interface ConversationRow {
  id: string;
  user_id: string;
  account_id: string | null;
  is_shared: number | null;
  title: string | null;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  sender_user_id: string | null;
  sender_name: string | null;
  mentioned_user_ids: string | null;
  tokens_used: number | null;
  created_at: number;
}

function rowToConversation(row: ConversationRow): ChatConversation {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id ?? undefined,
    isShared: row.is_shared === 1,
    title: row.title ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as 'user' | 'assistant' | 'system',
    content: row.content,
    senderUserId: row.sender_user_id ?? undefined,
    senderName: row.sender_name ?? undefined,
    mentionedUserIds: row.mentioned_user_ids ? JSON.parse(row.mentioned_user_ids) : [],
    tokensUsed: row.tokens_used ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

export async function getConversations(userId: string): Promise<ChatConversation[]> {
  const rows = await executeSql<ConversationRow>(
    'SELECT * FROM chat_conversations WHERE user_id = ? OR is_shared = 1 ORDER BY updated_at DESC LIMIT 20',
    [userId],
  );
  return rows.map(rowToConversation);
}

export async function upsertConversation(conversation: ChatConversation): Promise<void> {
  await executeSql(
    `INSERT INTO chat_conversations (id, user_id, account_id, is_shared, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       account_id = excluded.account_id,
       is_shared = excluded.is_shared,
       title = excluded.title,
       updated_at = excluded.updated_at`,
    [
      conversation.id,
      conversation.userId,
      conversation.accountId ?? null,
      conversation.isShared ? 1 : 0,
      conversation.title ?? null,
      conversation.createdAt.getTime(),
      conversation.updatedAt.getTime(),
    ],
  );
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const rows = await executeSql<MessageRow>(
    'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [conversationId],
  );
  return rows.map(rowToMessage);
}

export async function upsertMessage(message: ChatMessage): Promise<void> {
  await executeSql(
    `INSERT INTO chat_messages (id, conversation_id, role, content, sender_user_id, sender_name, mentioned_user_ids, tokens_used, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       sender_name = excluded.sender_name,
       tokens_used = excluded.tokens_used`,
    [
      message.id,
      message.conversationId,
      message.role,
      message.content,
      message.senderUserId ?? null,
      message.senderName ?? null,
      JSON.stringify(message.mentionedUserIds ?? []),
      message.tokensUsed ?? null,
      message.createdAt.getTime(),
    ],
  );
}
```

- [ ] **Step 3: Typecheck mobile**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/mobile && npx tsc --noEmit`
Expected: errors only in files updated in later tasks (chatStore/chat.tsx/ai.api). `chatRepository.ts` + `client.native.ts` clean.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/db/client.native.ts apps/mobile/src/db/chatRepository.ts
git commit -m "feat(mobile-db): persist account, shared flag, sender and mentions for chat"
```

---

## Task 8: Mobile API client — chat params, poll, setShared

**Files:**
- Modify: `apps/mobile/src/services/ai.api.ts:29-95`

- [ ] **Step 1: Update the `chat` method**

Replace the `chat(...)` method (lines 29-49) with:

```ts
  chat(message: string, conversationId?: string, mentions?: { userId: string }[], isShared?: boolean) {
    return httpClient.request<{
      message: string;
      conversationId: string;
      aiResponded: boolean;
      userMessageId: string;
      userMessageCreatedAt: string;
      assistantMessageId?: string;
      assistantCreatedAt?: string;
      pendingAction?: { id: string; actionType: string; data: Record<string, unknown>; displaySummary: string };
      actionResult?: { actionType: string; success: boolean; data?: Record<string, unknown>; errorMessage?: string };
    }>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId, mentions, isShared }),
    });
  },
```

- [ ] **Step 2: Update conversation list + messages types, add poll + setShared**

Replace `getChatConversations` and `getChatConversationMessages` (lines 77-95) with:

```ts
  getChatConversations() {
    return httpClient.request<Array<{
      id: string;
      title: string | null;
      isShared: boolean;
      isOwner: boolean;
      createdAt: string;
      updatedAt: string;
    }>>('/ai/chat/conversations');
  },

  getChatConversationMessages(conversationId: string) {
    return httpClient.request<Array<{
      id: string;
      conversationId: string;
      role: string;
      content: string;
      senderUserId: string | null;
      senderName: string | null;
      mentionedUserIds: string[];
      tokensUsed: number | null;
      createdAt: string;
    }>>(`/ai/chat/conversations/${conversationId}/messages`);
  },

  pollChatMessages(conversationId: string, since?: string) {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    return httpClient.request<Array<{
      id: string;
      conversationId: string;
      role: string;
      content: string;
      senderUserId: string | null;
      senderName: string | null;
      mentionedUserIds: string[];
      tokensUsed: number | null;
      createdAt: string;
    }>>(`/ai/chat/conversations/${conversationId}/poll${qs}`);
  },

  setChatConversationShared(conversationId: string, isShared: boolean) {
    return httpClient.request<{ id: string; isShared: boolean }>(
      `/ai/chat/conversations/${conversationId}/shared`,
      { method: 'PATCH', body: JSON.stringify({ isShared }) },
    );
  },
```

- [ ] **Step 3: Typecheck**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/mobile && npx tsc --noEmit`
Expected: errors now only in `chatStore.ts`/`chat.tsx` (next tasks).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/ai.api.ts
git commit -m "feat(mobile-api): chat mentions, sharing toggle, and poll client methods"
```

---

## Task 9: Mobile chatStore — fields, mentions, polling, sharing

**Files:**
- Modify: `apps/mobile/src/stores/chatStore.ts`

- [ ] **Step 1: Extend the ChatMessage type and state**

Replace the `ChatMessage` interface (lines 10-19) with:

```ts
export interface ChatMessage {
  id: string;
  conversationId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  senderUserId?: string;
  senderName?: string;
  mentionedUserIds?: string[];
  tokensUsed?: number;
  createdAt: Date;
  pendingAction?: ChatPendingAction;
  actionResult?: ChatActionResult;
}
```

Add to the `ChatState` interface (after `error: string | null;`, line 27):

```ts
  currentIsShared: boolean;
  currentIsOwner: boolean;
  lastSyncedAt: string | null;
  isPolling: boolean;
```

And to the actions block (after `clearMessages`, line 38):

```ts
  sendMessage: (content: string, mentions?: { userId: string }[]) => Promise<void>;
  setConversationShared: (isShared: boolean) => Promise<void>;
  pollNewMessages: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
```

> Note: `sendMessage` already exists in the interface — replace its signature with the one above rather than adding a duplicate.

Initialize new state in the `create(...)` initial object (after `error: null,`):

```ts
  currentIsShared: false,
  currentIsOwner: false,
  lastSyncedAt: null,
  isPolling: false,
```

Add a module-level timer handle near the top of the file (after imports):

```ts
let pollTimer: ReturnType<typeof setInterval> | null = null;
```

- [ ] **Step 2: Rewrite sendMessage for mentions + id reconciliation + aiResponded**

Replace the `sendMessage` implementation (lines 49-109) with:

```ts
  sendMessage: async (content: string, mentions?: { userId: string }[]) => {
    const { currentConversationId, currentIsShared } = get();

    const tempId = generateUUID();
    const userMessage: ChatMessage = {
      id: tempId,
      conversationId: currentConversationId || undefined,
      role: 'user',
      content,
      mentionedUserIds: mentions?.map((m) => m.userId) ?? [],
      createdAt: new Date(),
    };

    set((state) => ({ messages: [...state.messages, userMessage], isLoading: true, error: null }));

    try {
      const response = await api.chat(
        content,
        currentConversationId || undefined,
        mentions,
        currentConversationId ? undefined : currentIsShared || undefined,
      );

      if (!currentConversationId && response.conversationId) {
        set({ currentConversationId: response.conversationId });
      }

      // Reconcile optimistic user message with the server id/timestamp.
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === tempId
            ? { ...m, id: response.userMessageId, conversationId: response.conversationId, createdAt: new Date(response.userMessageCreatedAt) }
            : m,
        ),
        lastSyncedAt: response.userMessageCreatedAt,
      }));

      if (response.aiResponded) {
        const assistantMessage: ChatMessage = {
          id: response.assistantMessageId ?? generateUUID(),
          conversationId: response.conversationId,
          role: 'assistant',
          content: response.message,
          createdAt: response.assistantCreatedAt ? new Date(response.assistantCreatedAt) : new Date(),
          pendingAction: response.pendingAction as ChatPendingAction | undefined,
          actionResult: response.actionResult as ChatActionResult | undefined,
        };
        set((state) => ({
          messages: [...state.messages, assistantMessage],
          isLoading: false,
          lastSyncedAt: response.assistantCreatedAt ?? state.lastSyncedAt,
        }));
      } else {
        set({ isLoading: false });
      }

      useSubscriptionStore.getState().loadUsage();
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: generateUUID(),
        role: 'assistant',
        content: i18n.t('errors.chatError'),
        createdAt: new Date(),
      };
      set((state) => ({
        messages: [...state.messages, errorMessage],
        error: error instanceof Error ? error.message : i18n.t('errors.sendMessageFailed'),
        isLoading: false,
      }));
    }
  },
```

- [ ] **Step 3: Add polling + sharing actions; update loadConversations/loadConversation**

In `loadConversations`, map the new fields. Replace the `.map((c) => ({...}))` block (lines 219-225) with:

```ts
      const conversations: import('@budget/shared-types').ChatConversation[] = remote.map((c) => ({
        id: c.id,
        userId,
        accountId: undefined,
        isShared: c.isShared,
        title: c.title ?? undefined,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
      }));
```

> Keep an in-memory map of `isOwner` per conversation if the history UI needs it; the simplest path is to store `isOwner` on selection (see `loadConversation` below) using the conversation summary. For the history list we only need `isShared` (for the group icon).

In `loadConversation`, set shared/owner state and seed `lastSyncedAt`. Replace the method (lines 238-282) with:

```ts
  loadConversation: async (conversationId: string) => {
    set({ isLoading: true, error: null, currentConversationId: conversationId });

    try {
      const cached = await chatRepository.getMessages(conversationId);
      if (cached.length > 0) {
        set({
          messages: cached.map((m) => ({
            id: m.id,
            conversationId: m.conversationId,
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
            senderUserId: m.senderUserId,
            senderName: m.senderName,
            mentionedUserIds: m.mentionedUserIds,
            tokensUsed: m.tokensUsed,
            createdAt: m.createdAt,
          })),
        });
      }

      // Determine shared/owner from the cached conversation list.
      const conv = get().conversations.find((c) => c.id === conversationId);
      const isShared = conv?.isShared ?? false;

      const remote = await api.getChatConversationMessages(conversationId);
      const messages: ChatMessage[] = remote.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        senderUserId: m.senderUserId ?? undefined,
        senderName: m.senderName ?? undefined,
        mentionedUserIds: m.mentionedUserIds,
        tokensUsed: m.tokensUsed ?? undefined,
        createdAt: new Date(m.createdAt),
      }));

      const lastSyncedAt = messages.length > 0 ? messages[messages.length - 1].createdAt.toISOString() : null;
      set({ messages, isLoading: false, currentIsShared: isShared, lastSyncedAt });

      for (const msg of messages) {
        if (msg.conversationId) {
          await chatRepository.upsertMessage(msg as import('@budget/shared-types').ChatMessage);
        }
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : i18n.t('errors.loadConversationFailed'), isLoading: false });
    }
  },
```

> The `isOwner` flag for the toggle is read in the UI from `accountStore.isOwner()` (account-level owner === conversation owner permission per spec), so a per-conversation owner flag is not strictly required in the store. Set `currentIsOwner` from `accountStore` in the UI layer.

Add these new actions to the store object (after `clearMessages`, before the closing `}))`):

```ts
  setConversationShared: async (isShared: boolean) => {
    const { currentConversationId } = get();
    if (!currentConversationId) {
      set({ currentIsShared: isShared }); // applied when the conversation is created
      return;
    }
    try {
      const res = await api.setChatConversationShared(currentConversationId, isShared);
      set((state) => ({
        currentIsShared: res.isShared,
        conversations: state.conversations.map((c) => (c.id === currentConversationId ? { ...c, isShared: res.isShared } : c)),
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : i18n.t('errors.chatError') });
    }
  },

  pollNewMessages: async () => {
    const { currentConversationId, lastSyncedAt, messages } = get();
    if (!currentConversationId) return;
    try {
      const remote = await api.pollChatMessages(currentConversationId, lastSyncedAt ?? undefined);
      if (remote.length === 0) return;
      const existingIds = new Set(messages.map((m) => m.id));
      const fresh = remote
        .filter((m) => !existingIds.has(m.id))
        .map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          senderUserId: m.senderUserId ?? undefined,
          senderName: m.senderName ?? undefined,
          mentionedUserIds: m.mentionedUserIds,
          tokensUsed: m.tokensUsed ?? undefined,
          createdAt: new Date(m.createdAt),
        }));
      if (fresh.length === 0) return;
      const newest = remote[remote.length - 1].createdAt;
      set((state) => ({ messages: [...state.messages, ...fresh], lastSyncedAt: newest }));
      for (const msg of fresh) {
        if (msg.conversationId) await chatRepository.upsertMessage(msg as import('@budget/shared-types').ChatMessage);
      }
    } catch {
      // non-fatal
    }
  },

  startPolling: () => {
    const { isPolling } = get();
    if (isPolling || pollTimer) return;
    set({ isPolling: true });
    pollTimer = setInterval(() => { get().pollNewMessages(); }, 4000);
  },

  stopPolling: () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    set({ isPolling: false });
  },
```

Also reset shared/poll state in `startNewConversation` (lines 197-203) and `clearMessages` (lines 284-289): add `currentIsShared: false, currentIsOwner: false, lastSyncedAt: null` to both `set({...})` calls.

- [ ] **Step 4: Typecheck**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/mobile && npx tsc --noEmit`
Expected: errors only in `chat.tsx` (next task).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/stores/chatStore.ts
git commit -m "feat(mobile-store): mentions, polling, sharing toggle, id reconciliation"
```

---

## Task 10: Mobile chat UI — badge/toggle, attribution, mention bar

**Files:**
- Modify: `apps/mobile/app/(tabs)/chat.tsx`

This screen is large; make targeted additions. The mention bar appears when the input text's current token starts with `@`; selecting a member inserts `@Name ` and records `{ userId }`.

- [ ] **Step 1: Pull new store + account state**

In the `useChatStore()` destructure (lines 35-47) add: `currentIsShared, setConversationShared, pollNewMessages, startPolling, stopPolling`.

Add near the top of the component (after `const styles = useStyles(createStyles);`):

```tsx
  const { currentAccount, isOwner, members, loadMembers } = useAccountStore();
  const account = currentAccount();
  const accountMembers = account ? (members[account.id] ?? []) : [];
  const hasOtherMembers = accountMembers.length > 1;
  const canToggleShared = isOwner() && hasOtherMembers;
  const userId = useAuthStore((s) => s.user?.id);
  const [pendingMentions, setPendingMentions] = useState<{ userId: string }[]>([]);
```

Add imports at the top:

```tsx
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
```

Add an effect to load members and to poll while focused on a shared conversation:

```tsx
  useEffect(() => {
    if (account?.id) loadMembers(account.id);
  }, [account?.id, loadMembers]);

  useFocusEffect(
    useCallback(() => {
      if (currentIsShared) startPolling();
      return () => stopPolling();
    }, [currentIsShared, startPolling, stopPolling]),
  );
```

Add `useFocusEffect` to the expo-router import: `import { useFocusEffect } from 'expo-router';` (or `@react-navigation/native` if that is what the project uses elsewhere — grep `useFocusEffect` to match the existing import source).

- [ ] **Step 2: Add the shared toggle/badge to the top bar**

In the `topBar` View (lines 311-324), add before the history button:

```tsx
        {hasOtherMembers && (
          canToggleShared ? (
            <TouchableOpacity
              style={styles.sharedToggle}
              onPress={() => setConversationShared(!currentIsShared)}
            >
              <Ionicons
                name={currentIsShared ? 'people' : 'person'}
                size={16}
                color={currentIsShared ? theme.colors.primary : theme.colors.textSecondary}
              />
              <Text style={[styles.sharedToggleText, currentIsShared && { color: theme.colors.primary }]}>
                {currentIsShared ? t('chat.shared') : t('chat.private')}
              </Text>
            </TouchableOpacity>
          ) : currentIsShared ? (
            <View style={styles.sharedToggle}>
              <Ionicons name="people" size={16} color={theme.colors.primary} />
              <Text style={[styles.sharedToggleText, { color: theme.colors.primary }]}>{t('chat.shared')}</Text>
            </View>
          ) : null
        )}
```

- [ ] **Step 3: Show sender name on other members' messages**

In `renderMessage` (lines 188-239), compute whether the message is from another member and render a name label. Replace the `const isUser = item.role === 'user';` line with:

```tsx
    const isOwnMessage = item.role === 'user' && (!item.senderUserId || item.senderUserId === userId);
    const isOtherMember = item.role === 'user' && !!item.senderUserId && item.senderUserId !== userId;
    const isUser = isOwnMessage;
```

After the opening `<View style={[styles.messageContainer, ...]}>`, for other members render a small avatar with initial and put their name above the bubble. Inside the bubble block, before the `<Text>`/`<Markdown>`, add:

```tsx
            {isOtherMember && item.senderName && (
              <Text style={styles.senderLabel}>{item.senderName}</Text>
            )}
```

And ensure other-member messages render as plain text (left-aligned, not the AI markdown). Change the content branch to:

```tsx
            {isUser || isOtherMember ? (
              <Text style={[styles.messageText, isUser && styles.userMessageText]}>{item.content}</Text>
            ) : (
              <Markdown style={markdownStyles}>{item.content}</Markdown>
            )}
```

- [ ] **Step 4: Add the mention suggestion bar + input wiring**

Add a helper above the `return (`:

```tsx
  const mentionQuery = (() => {
    const m = inputText.match(/(?:^|\s)@(\w*)$/);
    return m ? m[1].toLowerCase() : null;
  })();
  const mentionCandidates = currentIsShared && mentionQuery !== null
    ? accountMembers
        .filter((mem) => mem.userId !== userId)
        .filter((mem) => (mem.user?.name ?? '').toLowerCase().includes(mentionQuery))
    : [];

  const insertMention = (mem: { userId: string; user?: { name?: string } }) => {
    const name = mem.user?.name ?? 'member';
    setInputText((prev) => prev.replace(/@\w*$/, `@${name} `));
    setPendingMentions((prev) => (prev.some((p) => p.userId === mem.userId) ? prev : [...prev, { userId: mem.userId }]));
  };
```

Render the bar just above the `inputContainer` View (line 362):

```tsx
        {mentionCandidates.length > 0 && (
          <View style={styles.mentionBar}>
            {mentionCandidates.map((mem) => (
              <TouchableOpacity key={mem.userId} style={styles.mentionChip} onPress={() => insertMention(mem)}>
                <Text style={styles.mentionChipText}>@{mem.user?.name ?? 'member'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
```

Update `handleSend` (lines 152-158) to pass mentions whose `@Name` still appears in the text, then clear them:

```tsx
  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;
    const text = inputText.trim();
    const stillMentioned = pendingMentions.filter((pm) => {
      const name = accountMembers.find((m) => m.userId === pm.userId)?.user?.name;
      return name ? text.includes(`@${name}`) : false;
    });
    setInputText('');
    setPendingMentions([]);
    await sendMessage(text, currentIsShared ? stillMentioned : undefined);
  };
```

- [ ] **Step 5: Add styles**

In `createStyles` add:

```tsx
  sharedToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  sharedToggleText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  senderLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
    fontWeight: '600' as const,
    marginBottom: theme.spacing[1],
  },
  mentionBar: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  mentionChip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius['2xl'],
    backgroundColor: theme.colors.primaryLight,
  },
  mentionChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
```

- [ ] **Step 6: Mark shared conversations in the history list**

In `renderConversationItem` (lines 241-270), add a group icon when `item.isShared`. After the `chatbubble-ellipses-outline` Ionicons, add:

```tsx
          {item.isShared && (
            <Ionicons name="people" size={14} color={theme.colors.primary} style={{ marginLeft: 4 }} />
          )}
```

- [ ] **Step 7: Typecheck + lint**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/mobile && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 8: Manual smoke (web)**

Run from project root: `npm run dev:web`. Confirm: in a personal account the chat looks unchanged (no toggle); the app boots without errors. (Full multi-member behavior needs two real devices/accounts — note this in the PR as a manual test plan.)

- [ ] **Step 9: Commit**

```bash
git add "apps/mobile/app/(tabs)/chat.tsx"
git commit -m "feat(mobile): shared chat badge/toggle, member attribution, mention bar"
```

---

## Task 11: i18n — chat.* keys in all 8 locales

**Files:**
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be}.ts`

- [ ] **Step 1: Add keys to en.ts (source)**

Find the `chat:` namespace object and add:

```ts
    shared: 'Shared',
    private: 'Private',
    mentionHint: 'Mention a member to message them directly',
```

- [ ] **Step 2: Add the translated equivalents to the other 7 locales**

Use these values for the `chat.shared` / `chat.private` / `chat.mentionHint` keys:

```
de: 'Geteilt' / 'Privat' / 'Erwähne ein Mitglied, um ihm direkt zu schreiben'
es: 'Compartido' / 'Privado' / 'Menciona a un miembro para escribirle directamente'
fr: 'Partagé' / 'Privé' / 'Mentionnez un membre pour lui écrire directement'
pl: 'Wspólny' / 'Prywatny' / 'Wspomnij członka, aby napisać do niego bezpośrednio'
ru: 'Общий' / 'Личный' / 'Упомяните участника, чтобы написать ему напрямую'
ua: 'Спільний' / 'Особистий' / 'Згадайте учасника, щоб написати йому напряму'
be: 'Агульны' / 'Асабісты' / 'Згадайце ўдзельніка, каб напісаць яму напрамую'
```

- [ ] **Step 3: Verify locale parity**

Run: `cd D:/Work/micode/ai-budget-assistant/apps/mobile && npx tsc --noEmit`
Expected: PASS. (If the repo has an i18n parity check script, run it; otherwise confirm each of the 8 files has all 3 new keys.)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(i18n): shared chat strings in all 8 locales"
```

---

## Task 12: Docs + ABA issue

**Files:**
- Modify: `CLAUDE.md` (AI module section + mobile Screens/Components)
- Help section via the help workflow (optional but per project convention)

- [ ] **Step 1: Update CLAUDE.md**

In the **AI module features** block, add a bullet describing shared conversations: per-conversation `isShared` (owner-only toggle, default off), `@mention` silences the AI in shared conversations, absent mentioned members get a `chat_mention` push (gated by `notifySharedActivity`, presence tracked in Redis via `CacheService` key `chat:presence:{conversationId}:{userId}` TTL 45s), mobile polls `GET /ai/chat/conversations/:id/poll?since=` every 4s while a shared conversation is focused. Note new endpoints `PATCH /ai/chat/conversations/:id/shared` and the poll route, and the `ChatConversation.accountId/isShared` + `ChatMessage.senderUserId/mentionedUserIds` columns.

- [ ] **Step 2: Run the finish-aba-task skill**

Use the `finish-aba-task` skill to create the `ABA-{N}` GitHub issue (English) and finalize doc updates per project convention.

- [ ] **Step 3: Final full check**

Run: `cd D:/Work/micode/ai-budget-assistant && npm run typecheck && cd apps/api && npx jest --silent`
Expected: typecheck PASS across packages; api tests PASS.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md user_docs
git commit -m "docs: document shared AI chat (ABA-NNN)"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Behavior model (mention silence, AI reply default) → Task 5b. ✓
- Per-conversation `isShared`, owner-only, default off → Tasks 2, 5b (create=false), 5d (PATCH owner-only), 10 (toggle gated by `isOwner()`). ✓
- Scoping (shared + own private) → Task 5c, 7 (SQLite read). ✓
- Presence + push (`chat_mention`, `notifySharedActivity`, Redis) → Tasks 3, 4, 5a, 5b. ✓
- Poll-while-open delivery → Tasks 5d (endpoint), 8 (client), 9 (store timer), 10 (focus effect). ✓
- Data model + backfill → Tasks 1, 2. ✓
- Mobile attribution + mention bar + history group icon → Task 10. ✓
- i18n + docs + ABA issue → Tasks 11, 12. ✓

**Placeholder scan:** The 5b create block had an awkward expression; Step 4 of 5b explicitly replaces it with `isShared: false`. No other placeholders.

**Type consistency:** `aiResponded`, `userMessageId`, `userMessageCreatedAt`, `assistantMessageId`, `assistantCreatedAt` are produced by `chat.service.chat()` (Task 5b), typed in DTO (Task 1) and api-client (Task 8), and consumed in the store (Task 9). `isShared`/`isOwner` on the conversation summary are produced in 5c, typed in 1/8, consumed in 9/10. `senderUserId`/`senderName`/`mentionedUserIds` flow consistently across service → DTO → api-client → store → repository → UI. Presence key format `chat:presence:{conversationId}:{userId}` is identical in 5a and the docs.
