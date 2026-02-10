import {
  Controller,
  Post,
  Req,
  Res,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SubscriptionsService } from './subscriptions.service';

@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post('stripe')
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event;
    try {
      // req.body is the raw Buffer when rawBody is enabled for this route
      const rawBody = (req as any).rawBody || req.body;
      event = this.subscriptionsService.constructWebhookEvent(
        rawBody,
        signature,
      );
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException('Webhook signature verification failed');
    }

    await this.subscriptionsService.handleWebhookEvent(event);

    res.json({ received: true });
  }
}
