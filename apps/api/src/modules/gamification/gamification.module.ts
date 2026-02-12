import { Module } from '@nestjs/common';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';
import { StreakService } from './streak.service';

@Module({
  controllers: [GamificationController],
  providers: [GamificationService, StreakService],
  exports: [GamificationService, StreakService],
})
export class GamificationModule {}
