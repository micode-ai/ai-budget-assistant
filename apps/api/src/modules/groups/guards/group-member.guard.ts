import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthenticatedRequest } from '../../../common/types';

export interface GroupRequestMember {
  id: string;
  userId: string | null;
  group: { id: string; ownerUserId: string; status: 'active' | 'archived' };
}

export interface GroupRequest extends AuthenticatedRequest {
  groupId: string;
  groupMember: GroupRequestMember;
}

/**
 * Resolves the caller's live membership of `:groupId`. A non-member gets 404 (never 403) so the
 * response does not confirm the group exists. `req.groupId` comes from the FOUND ROW, never from
 * the untrusted URL param.
 */
@Injectable()
export class GroupMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<GroupRequest & { params: Record<string, string> }>();
    const member = await this.prisma.expenseGroupMember.findFirst({
      where: { groupId: req.params.groupId, userId: req.user.id, removedAt: null },
      select: {
        id: true,
        userId: true,
        groupId: true,
        group: { select: { id: true, ownerUserId: true, status: true } },
      },
    });
    if (!member) throw new NotFoundException('Group not found');
    req.groupId = member.groupId;
    req.groupMember = { id: member.id, userId: member.userId, group: member.group };
    return true;
  }
}
