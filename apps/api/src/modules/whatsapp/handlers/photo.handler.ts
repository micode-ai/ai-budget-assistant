import { Injectable, Logger } from '@nestjs/common';
import { WaMediaMessage, WhatsAppUserState } from '../types';

@Injectable()
export class PhotoHandler {
  private readonly logger = new Logger(PhotoHandler.name);

  async handleImage(_msg: WaMediaMessage, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('PhotoHandler.handleImage: not implemented');
  }
  async handleDocument(_msg: WaMediaMessage, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('PhotoHandler.handleDocument: not implemented');
  }
  /** Returns true if the text was consumed by the "awaiting date" mode. */
  async handleDateInput(_text: string, _userState: WhatsAppUserState): Promise<boolean> {
    return false;
  }
  async handleReceiptAddCallback(_shortId: string, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('PhotoHandler.handleReceiptAddCallback: not implemented');
  }
  async handleDateCallback(_shortId: string, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('PhotoHandler.handleDateCallback: not implemented');
  }
  async handleReceiptCancelCallback(_shortId: string, _userState: WhatsAppUserState): Promise<void> {
    this.logger.warn('PhotoHandler.handleReceiptCancelCallback: not implemented');
  }
}
