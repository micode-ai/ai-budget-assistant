import { Controller, Logger, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { SlackBotService } from './slack-bot.service';
import { verifySlackSignature } from './helpers/verify-signature';
import { SlackBlockActionsPayload, SlackWebhookBody } from './types';

@Controller('slack')
export class SlackBotController {
  private readonly logger = new Logger(SlackBotController.name);
  private readonly signingSecret: string;

  constructor(
    private readonly botService: SlackBotService,
    config: ConfigService,
  ) {
    this.signingSecret = config.get<string>('SLACK_SIGNING_SECRET') || '';
  }

  private verify(req: Request): boolean {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const ts = req.headers['x-slack-request-timestamp'] as string | undefined;
    const sig = req.headers['x-slack-signature'] as string | undefined;
    return Boolean(rawBody) && verifySlackSignature(rawBody as Buffer, ts, sig, this.signingSecret);
  }

  /** Events API endpoint (JSON). */
  @Post('events')
  async events(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (!this.verify(req)) {
      this.logger.warn('Rejected /slack/events: invalid signature');
      res.status(401).send();
      return;
    }

    const body = req.body as SlackWebhookBody;

    // URL verification handshake
    if (body?.type === 'url_verification') {
      res.status(200).send(body.challenge);
      return;
    }

    // ACK fast (Slack retries on non-200 within 3s), dispatch async
    res.sendStatus(200);

    if (body?.type === 'event_callback') {
      this.botService.handleEvent(body).catch((err) => {
        this.logger.error(`handleEvent error: ${err instanceof Error ? err.stack || err.message : err}`);
      });
    }
  }

  /** Block Kit interactivity endpoint (urlencoded; payload in `payload`). */
  @Post('interactivity')
  async interactivity(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (!this.verify(req)) {
      this.logger.warn('Rejected /slack/interactivity: invalid signature');
      res.status(401).send();
      return;
    }

    res.sendStatus(200);

    try {
      const payload = JSON.parse((req.body as { payload?: string }).payload || '{}') as SlackBlockActionsPayload;
      this.botService.handleInteractivity(payload).catch((err) => {
        this.logger.error(`handleInteractivity error: ${err instanceof Error ? err.stack || err.message : err}`);
      });
    } catch (err) {
      this.logger.error(`Failed to parse interactivity payload: ${err}`);
    }
  }
}
