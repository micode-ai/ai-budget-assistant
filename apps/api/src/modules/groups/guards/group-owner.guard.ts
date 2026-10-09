import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { GroupRequest } from './group-member.guard';

/** Runs after GroupMemberGuard. Only the group owner passes; an orphaned group (NULL owner) passes nobody. */
@Injectable()
export class GroupOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<GroupRequest>();
    const owner = req.groupMember?.group.ownerUserId ?? null;
    if (owner === null || owner !== req.user.id) {
      throw new ForbiddenException('Only the group owner can do this');
    }
    return true;
  }
}
