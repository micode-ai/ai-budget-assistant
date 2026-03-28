import { Module } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';
import { ReferralQualificationCron } from './referral-qualification.cron';

@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService, ReferralQualificationCron],
  exports: [ReferralsService],
})
export class ReferralsModule {}
