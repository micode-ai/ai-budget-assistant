import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isInboundMailEnabled } from '../inbound-mail.config';

/** Every user-facing route 404s while INBOUND_MAIL_ENABLED is off: the surface does not exist. */
@Injectable()
export class InboundMailEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!isInboundMailEnabled(this.config)) throw new NotFoundException();
    return true;
  }
}
