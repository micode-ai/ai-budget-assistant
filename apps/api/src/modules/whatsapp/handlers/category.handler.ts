import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppUserState } from '../types';

@Injectable()
export class CategoryHandler {
  private readonly logger = new Logger(CategoryHandler.name);

  async handle(_args: string, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('CategoryHandler.handle: not implemented');
  }
  async handleList(_userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('CategoryHandler.handleList: not implemented');
  }
  async handleTypeCallback(_type: 'expense' | 'income', _name: string, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('CategoryHandler.handleTypeCallback: not implemented');
  }
  async handleDeleteCallback(_categoryId: string, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('CategoryHandler.handleDeleteCallback: not implemented');
  }
}
