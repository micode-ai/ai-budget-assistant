import { HttpException, HttpStatus, Inject, Injectable, Logger, Optional, ServiceUnavailableException, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupportMessage, SupportThread } from '@prisma/client';
import type { SupportMessageView, SupportThreadView } from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { AdminGateway } from '../admin/admin.gateway';
import { SupportTranslationService } from './support-translation.service';
import { SUPPORT_FORWARDER, SupportForwarder } from './support-forwarder';
import { developerUnreadTotal } from './support-unread';
import { SendSupportMessageDto } from './dto';

const SEND_LIMIT = 10;
const SEND_WINDOW_MS = 24 * 60 * 60 * 1000;

export function toSupportMessageView(
  m: Pick<SupportMessage, 'id' | 'author' | 'body' | 'bodyLang' | 'translatedBody' | 'translatedLang' | 'readAt' | 'createdAt'>,
): SupportMessageView {
  return {
    id: m.id,
    author: m.author as SupportMessageView['author'],
    body: m.body,
    bodyLang: m.bodyLang,
    translatedBody: m.translatedBody,
    translatedLang: m.translatedLang,
    readAt: m.readAt ? m.readAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
  };
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
    private readonly translation: SupportTranslationService,
    @Optional() @Inject(forwardRef(() => AdminGateway))
    private readonly adminGateway?: AdminGateway | null,
    @Optional() @Inject(SUPPORT_FORWARDER)
    private readonly forwarder?: SupportForwarder | null,
  ) {}

  async getThreadForUser(userId: string, before?: string, limit = 50): Promise<SupportThreadView> {
    const thread = await this.prisma.supportThread.findUnique({ where: { userId } });
    if (!thread) return { id: null, autoTranslate: true, userUnreadCount: 0, messages: [], hasMore: false };

    const beforeDate = before ? new Date(before) : null;
    const rows = await this.prisma.supportMessage.findMany({
      where: {
        threadId: thread.id,
        ...(beforeDate && !isNaN(beforeDate.getTime()) ? { createdAt: { lt: beforeDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    return {
      id: thread.id,
      autoTranslate: thread.autoTranslate,
      userUnreadCount: thread.userUnreadCount,
      messages: page.map(toSupportMessageView),
      hasMore,
    };
  }

  async sendUserMessage(userId: string, dto: SendSupportMessageDto): Promise<SupportMessageView> {
    let count: number;
    try {
      count = await this.cache.incrementWindow(`support:send:${userId}`, SEND_WINDOW_MS);
    } catch (err) {
      this.logger.warn(`Support rate limiter unavailable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Please try again later');
    }
    if (count > SEND_LIMIT) {
      throw new HttpException('Too many messages, try again tomorrow', HttpStatus.TOO_MANY_REQUESTS);
    }

    const thread = await this.getOrCreateThread(userId, { status: 'open' });
    const developerLang = this.config.get<string>('SUPPORT_DEVELOPER_LANGUAGE') || 'ru';
    const { detectedLang, translation } = await this.translation.translate(dto.body, developerLang, userId);

    const muted = thread.muted;
    const [message] = await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: {
          threadId: thread.id,
          author: 'user',
          body: dto.body,
          bodyLang: detectedLang,
          translatedBody: translation,
          translatedLang: translation ? developerLang : null,
          context: dto.context as unknown as object,
          via: 'app',
        },
      }),
      this.prisma.supportThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date(), ...(muted ? {} : { developerUnreadCount: { increment: 1 } }) },
      }),
    ]);

    if (!muted) this.notifyDeveloper(message, thread, userId);
    return toSupportMessageView(message);
  }

  async markReadByUser(userId: string): Promise<void> {
    await this.prisma.supportThread.updateMany({ where: { userId }, data: { userUnreadCount: 0, firstUnreadReplyAt: null, lastEmailedAt: null } });
  }

  async setAutoTranslate(userId: string, value: boolean): Promise<void> {
    await this.getOrCreateThread(userId, { autoTranslate: value });
  }

  /** Upsert by userId; a concurrent create loses with P2002, so re-fetch (ABA-314 pattern). */
  private async getOrCreateThread(userId: string, update: { status?: string; autoTranslate?: boolean }): Promise<SupportThread> {
    try {
      return await this.prisma.supportThread.upsert({
        where: { userId },
        create: { userId, status: 'open', ...update },
        update,
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      const existing = await this.prisma.supportThread.findUnique({ where: { userId } });
      if (!existing) throw err;
      return existing;
    }
  }

  private notifyDeveloper(message: SupportMessage, thread: SupportThread, userId: string): void {
    const forwarder = this.forwarder;
    if (forwarder) {
      void this.prisma.user
        .findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, language: true } })
        .then((user) => (user ? forwarder.forwardUserMessage(message, thread, user) : undefined))
        .catch(logFireAndForget(this.logger, 'SupportService.forwardUserMessage'));
    }
    const gateway = this.adminGateway;
    if (gateway) {
      void (async () => {
        gateway.emitSupportMessage({ threadId: thread.id, messageId: message.id, author: 'user' });
        gateway.emitSupportUnread({ total: await developerUnreadTotal(this.prisma) });
      })().catch(logFireAndForget(this.logger, 'SupportService.emitAdminEvents'));
    }
  }
}
