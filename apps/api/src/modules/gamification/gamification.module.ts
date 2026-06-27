import { Module } from '@nestjs/common';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';
import { StreakService } from './streak.service';
import { TrackingGapReminderCron } from './tracking-gap-reminder.cron';

@Module({
  controllers: [GamificationController],
  providers: [GamificationService, StreakService, TrackingGapReminderCron],
  exports: [GamificationService, StreakService],
})
export class GamificationModule {}
