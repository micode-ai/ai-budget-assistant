import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppUserState } from '../types';

@Injectable()
export class ExpenseHandler {
  private readonly logger = new Logger(ExpenseHandler.name);

  async handle(_args: string, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('ExpenseHandler.handle: not implemented');
  }
}
