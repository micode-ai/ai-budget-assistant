import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { mergeConversationLists } from '../utils/conversation-list';

@Injectable()
export class ChatConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private presenceKey(conversationId: string, userId: string): string {
    return `chat:presence:${conversationId}:${userId}`;
  }

  async touchPresence(conversationId: string, userId: string): Promise<void> {
    await this.cache.set(this.presenceKey(conversationId, userId), new Date().toISOString(), 45);
  }

  async isPresent(conversationId: string, userId: string): Promise<boolean> {
    return (await this.cache.get<string>(this.presenceKey(conversationId, userId))) !== null;
  }

  async getConversations(userId: string, accountId?: string) {
    // Two queries, not one: `take: 20` ordered by `updatedAt desc` means a
    // conversation pinned three months ago is not in that payload at all, so
    // a client-side (or even server-side) sort of a single query's results
    // can never surface it. The pinned query is therefore separate and
    // deliberately UNBOUNDED (no `take`) — see
    // docs/design/2026-09-07-chat-conversation-management.md, "The pin has to
    // be in the query". Both queries start from `chatConversation` (never the
    // pin table) and select the SAME columns, so exactly one mapper below
    // turns the merged, deduped rows into the response shape — two mappers
    // over the two blocks is how they'd end up disagreeing on shape.
    const where = { accountId, OR: [{ isShared: true }, { userId }] };
    const select = { id: true, title: true, isShared: true, userId: true, createdAt: true, updatedAt: true };

    const [pinned, recent] = await Promise.all([
      this.prisma.chatConversation.findMany({
        where: { ...where, pins: { some: { userId } } },
        orderBy: { updatedAt: 'desc' },
        select,
      }),
      this.prisma.chatConversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select,
      }),
    ]);

    const pinnedIds = new Set(pinned.map((c: any) => c.id));
    const merged = mergeConversationLists(pinned, recent);

    return merged.map((c: any) => ({
      id: c.id,
      title: c.title,
      isShared: c.isShared,
      isOwner: c.userId === userId,
      isPinned: pinnedIds.has(c.id),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

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
    const nameByUserId = new Map<string, string | null>(members.map((m: any) => [m.userId, m.user?.name ?? null]));

    const sinceDate = since ? new Date(since) : null;
    const validSince = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null;

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        role: { in: ['user', 'assistant'] },
        ...(validSince ? { createdAt: { gt: validSince } } : {}),
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

  async setConversationShared(userId: string, conversationId: string, accountId: string | undefined, _accountRole: string | undefined, isShared: boolean) {
    const conversation = await this.prisma.chatConversation.findFirst({ where: { id: conversationId, accountId } });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    // Any account member may share/unshare a conversation THEY created — but not
    // someone else's conversation, even an account owner's.
    if (conversation.userId !== userId) {
      throw new ForbiddenException('Only the conversation creator can change sharing');
    }
    const updated = await this.prisma.chatConversation.update({ where: { id: conversationId, accountId }, data: { isShared } });
    return { id: updated.id, isShared: updated.isShared };
  }

  // Rename mirrors setConversationShared's shape exactly, including the order
  // that matters: findFirst({ id, accountId }) -> 404, THEN the creator check
  // -> 403. That order is deliberate existence non-disclosure (a foreign
  // account's conversation id must 404, never 403) — do not collapse it into
  // one query.
  async renameConversation(userId: string, conversationId: string, accountId: string | undefined, title: string) {
    const conversation = await this.prisma.chatConversation.findFirst({ where: { id: conversationId, accountId } });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException('Only the conversation creator can rename it');
    }
    // A plain `update({ data: { title } })` would let @updatedAt bump
    // updatedAt to now, teleporting a three-week-old conversation to the top
    // of both the rail and the phone's history sheet — unlike sharing (which
    // we DO let bump it), a rename is not itself an activity event. Writing
    // the conversation's own current updatedAt back explicitly is honored by
    // Prisma: verified directly against this repo's exact
    // prisma/@prisma-client version (5.22.0) with a throwaway SQLite schema —
    // an explicit value present in `data` is used as-is; only an ABSENT
    // updatedAt is auto-bumped by the query engine. See
    // docs/design/2026-09-07-chat-conversation-management.md, "What this
    // design leaves unproven".
    const updated = await this.prisma.chatConversation.update({
      where: { id: conversationId, accountId },
      data: { title, updatedAt: conversation.updatedAt },
    });
    return { id: updated.id, title: updated.title };
  }

  // Same predicate and order as rename: 404 before the creator check.
  async deleteConversation(userId: string, conversationId: string, accountId: string | undefined) {
    const conversation = await this.prisma.chatConversation.findFirst({ where: { id: conversationId, accountId } });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException('Only the conversation creator can delete it');
    }
    // ChatMessage.conversation and ChatConversationPin.conversation are both
    // onDelete: Cascade, so its messages and every member's pins on it go
    // with it in one statement. No soft delete, no undo, no bot cleanup:
    // chat() self-heals an unresolvable conversationId by silently creating a
    // new conversation (see the OR-scoped findFirst near the top of chat()),
    // which is what makes a hard delete safe for the three bots that persist
    // a conversationId in their own link state.
    await this.prisma.chatConversation.delete({ where: { id: conversationId, accountId } });
  }

  // NOT a sibling of setConversationShared/rename/delete — its permission is
  // READ VISIBILITY, not the creator rule. Anyone who can see the
  // conversation (its own creator, or any member of a SHARED one) may
  // pin/unpin it for themselves; a creator-only gate would leave the
  // non-creator who reads a shared conversation daily with no way to pin it
  // at all (see "The pin fork" in the design doc). Using the /shared
  // predicate (findFirst({ id, accountId }), no OR) here would let a member
  // pin — and, via the 404-vs-200 response, thereby confirm the existence of
  // — a co-member's PRIVATE conversation.
  async setConversationPinned(userId: string, conversationId: string, accountId: string | undefined, pinned: boolean) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, accountId, OR: [{ isShared: true }, { userId }] },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (pinned) {
      // The composite PK (userId, conversationId) IS the uniqueness
      // constraint and the dedup, so pinning is idempotent as
      // createMany({ skipDuplicates: true }) — the
      // WalletCurrencyService.ensureCurrencies convention. Not run inside a
      // $transaction: a constraint violation there would poison it
      // (ABA-313/401), and there is nothing else to make atomic with it.
      await this.prisma.chatConversationPin.createMany({
        data: [{ userId, conversationId }],
        skipDuplicates: true,
      });
    } else {
      // Idempotent and 404-free: unpinning something never pinned is a no-op.
      await this.prisma.chatConversationPin.deleteMany({ where: { userId, conversationId } });
    }
    return { id: conversationId, isPinned: pinned };
  }

  async pollMessages(userId: string, conversationId: string, accountId: string | undefined, since?: string) {
    await this.touchPresence(conversationId, userId);
    return this.getConversationMessages(userId, conversationId, accountId, since);
  }
}
