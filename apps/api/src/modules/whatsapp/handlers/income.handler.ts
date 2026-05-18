import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppUserState } from '../types';

@Injectable()
export class IncomeHandler {
  private readonly logger = new Logger(IncomeHandler.name);

  async handle(_args: string, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('IncomeHandler.handle: not implemented');
  }
}
