import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { GroupRequest } from './group-member.guard';

/** Runs after GroupMemberGuard. Only the group owner passes. */
@Injectable()
export class GroupOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<GroupRequest>();
    if (!req.groupMember || req.groupMember.group.ownerUserId !== req.user.id) {
      throw new ForbiddenException('Only the group owner can do this');
    }
    return true;
  }
}
