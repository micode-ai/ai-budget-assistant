import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReferralsService } from './referrals.service';

@Injectable()
export class ReferralQualificationCron {
  private readonly logger = new Logger(ReferralQualificationCron.name);

  constructor(private readonly referralsService: ReferralsService) {}

  @Cron('0 3 * * *')
  async handleQualification() {
    this.logger.log('Starting referral qualification check...');
    try {
      await this.referralsService.qualifyPendingReferrals();
      this.logger.log('Referral qualification check completed');
    } catch (error) {
      this.logger.error(`Referral qualification failed: ${error}`);
    }
  }
}
