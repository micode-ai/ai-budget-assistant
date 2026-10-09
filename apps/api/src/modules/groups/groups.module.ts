import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { GroupGuestController } from './group-guest.controller';
import { GroupGuestService } from './group-guest.service';
import { GroupMemberGuard } from './guards/group-member.guard';
import { GroupOwnerGuard } from './guards/group-owner.guard';
import { GroupActiveGuard } from './guards/group-active.guard';
import { GroupOwnershipService } from './group-ownership.service';

// PrismaService, CacheService and NotificationsService are @Global().
@Module({
  controllers: [GroupsController, GroupGuestController],
  providers: [GroupsService, GroupGuestService, GroupOwnershipService, GroupMemberGuard, GroupOwnerGuard, GroupActiveGuard],
  // GroupOwnershipService: UsersService / AdminService hand groups on before an account goes away.
  exports: [GroupsService, GroupOwnershipService],
})
export class GroupsModule {}
