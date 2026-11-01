import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isPublicApiEnabled } from '../oauth.config';

/** Every public-API and OAuth route 404s while PUBLIC_API_ENABLED is off: the surface does not exist. */
@Injectable()
export class PublicApiEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!isPublicApiEnabled(this.config)) throw new NotFoundException();
    return true;
  }
}
