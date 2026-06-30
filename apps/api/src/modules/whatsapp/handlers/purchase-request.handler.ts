import { Injectable, Logger } from '@nestjs/common';
import { PurchaseRequestsService } from '../../purchase-requests/purchase-requests.service';
import { WhatsAppClientService } from '../whatsapp-client.service';
import { WhatsAppUserState } from '../types';

// Phase 2: Handles inbound vote callbacks (pr_approve/pr_reject).
// Outbound bot messages (sending buttons on request creation) are deferred to Phase 2.
// The push notification path (NotificationsService) provides text-only notifications for now.
@Injectable()
export class PurchaseRequestHandler {
  private readonly logger = new Logger(PurchaseRequestHandler.name);

  constructor(
    private readonly purchaseRequestsService: PurchaseRequestsService,
    private readonly whatsappClient: WhatsAppClientService,
  ) {}

  async handleCallback(
    action: string,
    requestId: string,
    userState: WhatsAppUserState,
  ): Promise<void> {
    const { accountId, userId, waPhoneNumber } = userState;
    const vote = action === 'pr_approve' ? 'APPROVE' : 'REJECT';

    try {
      await this.purchaseRequestsService.vote(requestId, accountId, userId, { vote });
      const label = vote === 'APPROVE' ? '✅ Approved!' : '❌ Rejected';
      await this.whatsappClient.sendText(waPhoneNumber, label);
    } catch (e: any) {
      this.logger.warn(`Purchase request vote error: ${e.message}`);
      await this.whatsappClient.sendText(waPhoneNumber, e.message ?? 'Error');
    }
  }
}
