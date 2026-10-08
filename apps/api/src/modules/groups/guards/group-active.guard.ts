import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { GroupRequest } from './group-member.guard';

/** Runs after GroupMemberGuard. Blocks writes to an archived group (the TripArchivedGuard equivalent). */
@Injectable()
export class GroupActiveGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<GroupRequest>();
    if (req.groupMember?.group.status === 'archived') {
      throw new ForbiddenException({ code: 'GROUP_ARCHIVED', message: 'This group is archived and read-only' });
    }
    return true;
  }
}
