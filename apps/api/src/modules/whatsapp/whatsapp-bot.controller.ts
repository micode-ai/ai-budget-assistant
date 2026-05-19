import { Controller, Get, Logger, Post, Query, Req, Res } from '@nestjs/common';
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
    this.verifyToken = config.get<string>('WHATSAPP_VERIFY_TOKEN') || '';
    this.appSecret = config.get<string>('WHATSAPP_APP_SECRET') || '';
  }

  /**
   * Meta sends a GET handshake on webhook setup. We must echo the challenge
   * back IFF mode=subscribe and the verify-token matches the one configured
   * here AND in the Meta dashboard.
   */
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

  /**
   * Inbound event. Verify HMAC against rawBody (made globally available by
   * main.ts's express.json verify callback), then ACK 200 IMMEDIATELY and
   * dispatch async — Meta retries on any non-200, so we must respond fast.
   */
  @Post('webhook')
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (!rawBody || !verifySignature(rawBody, signature, this.appSecret)) {
      this.logger.warn('Rejected inbound webhook: invalid signature');
      res.status(401).send();
      return;
    }

    res.sendStatus(200);

    // Fire-and-forget; controller errors must never propagate to the client.
    this.botService.handleUpdate(req.body).catch((err) => {
      this.logger.error(
        `Handler error: ${err instanceof Error ? err.stack || err.message : err}`,
      );
    });
  }
}
