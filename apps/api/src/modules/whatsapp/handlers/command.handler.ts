import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppUserState } from '../types';

@Injectable()
export class CommandHandler {
  private readonly logger = new Logger(CommandHandler.name);

  async handleLink(_waPhoneNumber: string, _code: string, _profileName?: string): Promise<void> {
    this.logger.warn('CommandHandler.handleLink: not implemented');
  }
  async handleHelp(_userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('CommandHandler.handleHelp: not implemented');
  }
  async handleUnlink(_userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('CommandHandler.handleUnlink: not implemented');
  }
  async handleAccount(_userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('CommandHandler.handleAccount: not implemented');
  }
  async handleNewChat(_userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('CommandHandler.handleNewChat: not implemented');
  }
  async handleUsage(_userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('CommandHandler.handleUsage: not implemented');
  }
  async handleAccountCallback(_accountId: string, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('CommandHandler.handleAccountCallback: not implemented');
  }
}
