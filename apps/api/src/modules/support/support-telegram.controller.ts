import { Controller, Logger, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { CacheService } from '../../common/cache/cache.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { SupportTelegramService } from './support-telegram.service';

const DEDUP_TTL_SEC = 86400;

@Controller('support-telegram')
export class SupportTelegramController {
  private readonly logger = new Logger(SupportTelegramController.name);

  constructor(
    private readonly service: SupportTelegramService,
    private readonly cache: CacheService,
  ) {}

  @Post('webhook')
  async handleWebhook(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (!this.service.verifySecret(req.headers['x-telegram-bot-api-secret-token'] as string | undefined)) {
      res.sendStatus(403);
      return;
    }
    // ACK first: translation + DB + Telegram calls are slow and Telegram redelivers on a slow answer.
    res.sendStatus(200);

    const updateId = (req.body as { update_id?: unknown } | undefined)?.update_id;
    if (typeof updateId === 'number') {
      try {
        const first = await this.cache.setIfAbsentStrict(`support-tg:update:${updateId}`, DEDUP_TTL_SEC);
        if (!first) return; // redelivery of an update already handled
      } catch (err) {
        // Redis down: fail open for dedup rather than drop the developer's reply.
        this.logger.warn(`Support Telegram dedup unavailable: ${(err as Error).message}`);
      }
    }
    await this.service
      .handleUpdate(req.body)
      .catch(logFireAndForget(this.logger, 'SupportTelegramController.handleWebhook'));
  }
}
