import { Module } from '@nestjs/common';
import { RecentlyDeletedController } from './recently-deleted.controller';
import { RecentlyDeletedService } from './recently-deleted.service';

@Module({
  controllers: [RecentlyDeletedController],
  providers: [RecentlyDeletedService],
})
export class RecentlyDeletedModule {}
