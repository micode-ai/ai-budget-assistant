import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { TelegramService } from '../telegram/telegram.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { ReportClientErrorDto } from './dto';
import {
  CLIENT_ERROR_LIMITS as L,
  clientErrorFingerprint,
  escapeTelegramHtml,
  firstStackFrame,
  redactClientText,
  truncate,
} from './client-error.util';

/** One ops alert per fingerprint per day: a crash on every launch must not flood the channel. */
export const CLIENT_ERROR_ALERT_TTL_SEC = 24 * 60 * 60;
const ALERT_MESSAGE_CHARS = 300;

const clean = (value: string | undefined, max: number): string =>
  truncate(redactClientText(value ?? ''), max);

/**
 * Stores a client-side error (ABA-832) and pings the ops channel the first time
 * a fingerprint is seen in 24 hours. The mobile app has no crash-reporting SDK,
 * so this is the only way a render crash on a user's phone reaches us.
 */
@Injectable()
export class ClientErrorsService {
  private readonly logger = new Logger(ClientErrorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly telegram: TelegramService,
  ) {}

  async report(userId: string, dto: ReportClientErrorDto): Promise<void> {
    const message = clean(dto.message, L.message);
    const stack = clean(dto.stack, L.stack);
    const fingerprint = clientErrorFingerprint(message, stack);
    const row = {
      userId,
      platform: truncate(dto.platform, L.platform),
      appVersion: truncate(dto.appVersion, L.appVersion),
      message,
      stack,
      componentStack: clean(dto.componentStack, L.componentStack),
      route: dto.route ? clean(dto.route, L.route) : null,
      fatal: dto.fatal === true,
      locale: dto.locale ? truncate(dto.locale, L.locale) : null,
      fingerprint,
    };

    try {
      await this.prisma.clientError.create({ data: row });
    } catch (err) {
      // The client never retries and has nothing to do with a failure; the alert
      // below still carries the error, so a storage outage does not hide it.
      this.logger.warn(`ClientErrorsService.report store failed: ${(err as Error).message}`);
    }

    void this.alertIfNew(row).catch(logFireAndForget(this.logger, 'ClientErrorsService.alertIfNew'));
  }

  /**
   * `setIfAbsent` returns false on a Redis outage as well as on a repeat, so an
   * outage means no alert rather than an alert per report — the row is still stored.
   */
  async alertIfNew(row: {
    userId: string;
    platform: string;
    appVersion: string;
    message: string;
    stack: string;
    fatal: boolean;
    fingerprint: string;
  }): Promise<void> {
    const isNew = await this.cache.setIfAbsent(
      `client-error:${row.fingerprint}`,
      CLIENT_ERROR_ALERT_TTL_SEC,
    );
    if (!isNew) return;

    const frame = firstStackFrame(row.stack);
    const lines = [
      `🐞 <b>New client error</b>${row.fatal ? ' (fatal)' : ''}`,
      '',
      `Platform: ${escapeTelegramHtml(row.platform)} ${escapeTelegramHtml(row.appVersion)}`,
      `User: <code>${escapeTelegramHtml(row.userId)}</code>`,
      `Fingerprint: <code>${row.fingerprint.slice(0, 12)}</code>`,
      '',
      `<code>${escapeTelegramHtml(truncate(row.message, ALERT_MESSAGE_CHARS))}</code>`,
    ];
    if (frame) lines.push(`<code>${escapeTelegramHtml(truncate(frame, ALERT_MESSAGE_CHARS))}</code>`);
    await this.telegram.sendMessage(lines.join('\n'));
  }
}
