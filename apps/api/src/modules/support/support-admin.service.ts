import { ConflictException, Inject, Injectable, Logger, NotFoundException, Optional, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupportMessage, SupportThread } from '@prisma/client';
import type { AdminSupportMessageView, AdminSupportThreadSummary, AdminUpdateSupportThreadDto, SupportContext } from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { AdminGateway } from '../admin/admin.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { SupportTranslationService } from './support-translation.service';
import { supportReplyTitle } from './support-i18n';
import { developerUnreadTotal } from './support-unread';
import { toSupportMessageView } from './support.service';

type ThreadWithUser = SupportThread & {
  user: { id: string; name: string; email: string; language: string; isActive: boolean };
  messages?: { body: string }[];
};

const PUSH_BODY_MAX = 120;

function userLang(lang: string | null | undefined): string {
  return lang && lang.trim() ? lang : 'en';
}

function toAdminMessageView(m: SupportMessage): AdminSupportMessageView {
  return {
    ...toSupportMessageView(m),
    via: m.via as AdminSupportMessageView['via'],
    context: (m.context as unknown as SupportContext | null) ?? null,
  };
}

@Injectable()
export class SupportAdminService {
  private readonly logger = new Logger(SupportAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly translation: SupportTranslationService,
    private readonly notifications: NotificationsService,
    @Optional() @Inject(forwardRef(() => AdminGateway))
    private readonly adminGateway?: AdminGateway | null,
  ) {}

  async listThreads(filter: 'open' | 'closed' | 'muted'): Promise<AdminSupportThreadSummary[]> {
    // setAutoTranslate can create a thread with no messages; those are not conversations.
    const where =
      filter === 'muted'
        ? { muted: true, messages: { some: {} } }
        : { muted: false, status: filter, messages: { some: {} } };
    const rows = await this.prisma.supportThread.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, language: true, isActive: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
    const summaries = rows.map((r) => ({ unread: r.developerUnreadCount > 0, row: r }));
    // Stable sort keeps the lastMessageAt-desc order inside each group.
    summaries.sort((a, b) => Number(b.unread) - Number(a.unread) || b.row.lastMessageAt.getTime() - a.row.lastMessageAt.getTime());
    return summaries.map((s) => this.toSummary(s.row as ThreadWithUser));
  }

  async getThread(threadId: string): Promise<{ summary: AdminSupportThreadSummary; messages: AdminSupportMessageView[] }> {
    let thread = await this.loadThread(threadId);
    if (!thread.muted) {
      const readAt = new Date();
      // Emit only when something changed: the client refetches on this event, so an
      // unconditional emit here would loop while a thread is open.
      const hadUnread = thread.developerUnreadCount > 0;
      const [, updated] = await this.prisma.$transaction([
        this.prisma.supportMessage.updateMany({ where: { threadId, author: 'user', readAt: null }, data: { readAt } }),
        this.prisma.supportThread.update({ where: { id: threadId }, data: { developerUnreadCount: 0 } }),
      ]);
      thread = { ...thread, developerUnreadCount: (updated as SupportThread)?.developerUnreadCount ?? 0 };
      if (hadUnread) this.emitUnread();
    }
    const messages = await this.prisma.supportMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' } });
    return { summary: this.toSummary(thread), messages: messages.map(toAdminMessageView) };
  }

  async reply(threadId: string, body: string, via: 'admin' | 'telegram'): Promise<AdminSupportMessageView> {
    const thread = await this.loadThread(threadId);
    if (thread.user.isActive === false) throw new ConflictException('user_inactive');

    const lang = userLang(thread.user.language);
    const { detectedLang, translation } = await this.translation.translate(body, lang, thread.userId);

    const ops = [
      this.prisma.supportMessage.create({
        data: {
          threadId,
          author: 'developer',
          body,
          bodyLang: detectedLang,
          translatedBody: translation,
          translatedLang: translation ? lang : null,
          via,
        },
      }),
      this.prisma.supportThread.update({
        where: { id: threadId },
        data: {
          status: 'open',
          lastMessageAt: new Date(),
          userUnreadCount: { increment: 1 },
          // A muted thread must stay invisible: no read receipts, counter untouched.
          ...(thread.muted ? {} : { developerUnreadCount: 0 }),
        },
      }),
      ...(thread.muted
        ? []
        : [this.prisma.supportMessage.updateMany({ where: { threadId, author: 'user', readAt: null }, data: { readAt: new Date() } })]),
    ];
    const [message] = (await this.prisma.$transaction(ops as never)) as unknown as [SupportMessage];

    const pushBody = (message.translatedBody ?? message.body).slice(0, PUSH_BODY_MAX);
    void this.notifications
      .sendToUser(thread.userId, (l) => supportReplyTitle(l), () => pushBody, { threadId }, 'support_reply')
      .catch(logFireAndForget(this.logger, 'SupportAdminService.pushReply'));
    this.adminGateway?.emitSupportMessage({ threadId, messageId: message.id, author: 'developer' });
    this.emitUnread();
    return toAdminMessageView(message);
  }

  async updateThread(threadId: string, dto: AdminUpdateSupportThreadDto): Promise<AdminSupportThreadSummary> {
    await this.loadThread(threadId);
    const data: { status?: string; muted?: boolean } = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.muted !== undefined) data.muted = dto.muted;
    await this.prisma.supportThread.update({ where: { id: threadId }, data });
    this.emitUnread();
    return this.toSummary(await this.loadThread(threadId));
  }

  async retranslate(messageId: string): Promise<AdminSupportMessageView> {
    const message = await this.prisma.supportMessage.findUnique({
      where: { id: messageId },
      include: { thread: { include: { user: { select: { id: true, name: true, email: true, language: true, isActive: true } } } } },
    });
    if (!message) throw new NotFoundException('Message not found');
    const target =
      message.author === 'user'
        ? this.config.get<string>('SUPPORT_DEVELOPER_LANGUAGE') || 'ru'
        : userLang(message.thread.user.language);
    const { detectedLang, translation } = await this.translation.translate(message.body, target, message.thread.userId);
    const updated = await this.prisma.supportMessage.update({
      where: { id: messageId },
      data: {
        bodyLang: detectedLang,
        translatedBody: translation,
        translatedLang: translation ? target : null,
      },
    });
    return toAdminMessageView(updated);
  }

  unreadTotal(): Promise<number> {
    return developerUnreadTotal(this.prisma);
  }

  private async loadThread(threadId: string): Promise<ThreadWithUser> {
    const thread = await this.prisma.supportThread.findUnique({
      where: { id: threadId },
      include: {
        user: { select: { id: true, name: true, email: true, language: true, isActive: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true } },
      },
    });
    if (!thread) throw new NotFoundException('Thread not found');
    return thread as ThreadWithUser;
  }

  private toSummary(t: ThreadWithUser): AdminSupportThreadSummary {
    return {
      id: t.id,
      userId: t.userId,
      userName: t.user.name,
      userEmail: t.user.email,
      userLanguage: t.user.language,
      status: t.status as AdminSupportThreadSummary['status'],
      muted: t.muted,
      developerUnreadCount: t.developerUnreadCount,
      lastMessageAt: t.lastMessageAt.toISOString(),
      lastMessagePreview: (t.messages?.[0]?.body ?? '').slice(0, 120),
    };
  }

  private emitUnread(): void {
    const gateway = this.adminGateway;
    if (!gateway) return;
    void developerUnreadTotal(this.prisma)
      .then((total) => gateway.emitSupportUnread({ total }))
      .catch(logFireAndForget(this.logger, 'SupportAdminService.emitUnread'));
  }
}
