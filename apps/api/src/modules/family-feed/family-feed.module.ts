import { Module } from '@nestjs/common';
import { FamilyFeedController } from './family-feed.controller';
import { FamilyFeedService } from './family-feed.service';

// PrismaService is @Global() — no explicit DatabaseModule import needed.
@Module({
  controllers: [FamilyFeedController],
  providers: [FamilyFeedService],
  exports: [FamilyFeedService],
})
export class FamilyFeedModule {}
