import { Module } from '@nestjs/common';
import { IncomesController } from './incomes.controller';
import { IncomesService } from './incomes.service';
import { GamificationModule } from '../gamification/gamification.module';
import { FamilyFeedModule } from '../family-feed/family-feed.module';

@Module({
  imports: [GamificationModule, FamilyFeedModule],
  controllers: [IncomesController],
  providers: [IncomesService],
  exports: [IncomesService],
})
export class IncomesModule {}
