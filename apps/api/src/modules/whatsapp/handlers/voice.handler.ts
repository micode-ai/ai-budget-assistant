import { Injectable, Logger } from '@nestjs/common';
import { WaMediaMessage, WhatsAppUserState } from '../types';

@Injectable()
export class VoiceHandler {
  private readonly logger = new Logger(VoiceHandler.name);

  async handle(_msg: WaMediaMessage, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('VoiceHandler.handle: not implemented');
  }
}
