import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { parseAdminEmails } from './admin-emails.util';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly adminEmails: Set<string>;

  constructor() {
    this.adminEmails = new Set(parseAdminEmails());
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const email = request.user?.email?.toLowerCase();

    if (!email || !this.adminEmails.has(email)) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
