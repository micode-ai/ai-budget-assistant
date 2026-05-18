import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppUserState } from '../types';

@Injectable()
export class ChatHandler {
  private readonly logger = new Logger(ChatHandler.name);

  async handleText(_text: string, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('ChatHandler.handleText: not implemented');
  }
  async handleConfirmCallback(_shortId: string, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('ChatHandler.handleConfirmCallback: not implemented');
  }
  async handleRejectCallback(_shortId: string, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('ChatHandler.handleRejectCallback: not implemented');
  }
}
