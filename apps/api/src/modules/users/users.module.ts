import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { LastActiveService } from './last-active.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, LastActiveService],
  exports: [UsersService, LastActiveService],
})
export class UsersModule {}
