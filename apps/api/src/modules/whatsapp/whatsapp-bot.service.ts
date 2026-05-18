import { Injectable, Logger } from '@nestjs/common';

/**
 * Placeholder. Real implementation lands in Task 14 (dispatcher).
 */
@Injectable()
export class WhatsAppBotService {
  private readonly logger = new Logger(WhatsAppBotService.name);

  async handleUpdate(_body: unknown): Promise<void> {
    this.logger.debug('WhatsAppBotService.handleUpdate: stub — real dispatcher in Task 14');
  }
}
