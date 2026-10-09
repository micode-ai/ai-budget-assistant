import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { LastActiveService } from './last-active.service';
import { GroupsModule } from '../groups/groups.module';

@Module({
  // GroupOwnershipService: deactivate() hands owned groups on (ABA-650).
  imports: [GroupsModule],
  controllers: [UsersController],
  providers: [UsersService, LastActiveService],
  exports: [UsersService, LastActiveService],
})
export class UsersModule {}
