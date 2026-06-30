import { Logger } from '@nestjs/common';
import { PurchaseRequestsService } from '../../purchase-requests/purchase-requests.service';
import { BotContext } from '../types';

// Phase 2: Handles inbound vote callbacks (pr_approve/pr_reject).
// Outbound bot messages (sending buttons on request creation) are deferred to Phase 2.
// The push notification path (NotificationsService) provides text-only notifications for now.
export class PurchaseRequestHandler {
  private readonly logger = new Logger(PurchaseRequestHandler.name);

  constructor(private readonly purchaseRequestsService: PurchaseRequestsService) {}

  async handleCallback(ctx: BotContext, action: string, requestId: string): Promise<void> {
    if (!ctx.userState) {
      await ctx.answerCbQuery('Please link your account first.');
      return;
    }
    const { accountId, userId } = ctx.userState;
    const vote = action === 'pr_approve' ? 'APPROVE' : 'REJECT';

    try {
      await this.purchaseRequestsService.vote(requestId, accountId, userId, { vote });
      const label = vote === 'APPROVE' ? '✅ Approved' : '❌ Rejected';
      await ctx.answerCbQuery(label);
      try {
        const currentText = (ctx.callbackQuery as any)?.message?.text ?? '';
        await ctx.editMessageText(`${currentText}\n\n${label}`);
      } catch {
        // Message may already be deleted or too old to edit — swallow
      }
    } catch (e: any) {
      this.logger.warn(`Purchase request vote error: ${e.message}`);
      await ctx.answerCbQuery(e.message ?? 'Error');
    }
  }
}
