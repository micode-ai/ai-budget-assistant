import { ReferralQualificationCron } from './referral-qualification.cron';

function makeCron(overrides: { qualifyPendingReferrals?: jest.Mock } = {}) {
  const referralsService: any = {
    qualifyPendingReferrals: overrides.qualifyPendingReferrals ?? jest.fn().mockResolvedValue(undefined),
  };
  const cron = new ReferralQualificationCron(referralsService);
  return { cron, referralsService };
}

describe('ReferralQualificationCron', () => {
  it('delegates to ReferralsService.qualifyPendingReferrals', async () => {
    const { cron, referralsService } = makeCron();

    await cron.handleQualification();

    expect(referralsService.qualifyPendingReferrals).toHaveBeenCalledTimes(1);
  });

  it('catches a thrown error instead of letting it escape the cron job', async () => {
    const { cron, referralsService } = makeCron({
      qualifyPendingReferrals: jest.fn().mockRejectedValue(new Error('db unavailable')),
    });

    await expect(cron.handleQualification()).resolves.toBeUndefined();
    expect(referralsService.qualifyPendingReferrals).toHaveBeenCalledTimes(1);
  });
});
