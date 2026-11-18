import { SubscriptionsService } from './subscriptions.service';
import { UsageTrackingService } from './usage-tracking.service';
import { StripeBillingService } from './stripe-billing.service';

// Shared fixture for the three subscriptions specs (subscriptions / usage-tracking / stripe-billing).
export function makeServices(prismaOverrides: Record<string, any> = {}, adminGateway?: any) {
  const baseSub = {
    id: 'sub-1',
    userId: 'u1',
    tier: 'free',
    status: 'active',
    aiRequestsUsed: 0,
    aiRequestsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // future
    customAiLimit: null,
    bonusAiRequests: 0,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    cancelAtPeriodEnd: false,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    trialStart: null,
    trialEnd: null,
  };

  const prisma: any = {
    subscription: {
      upsert: jest.fn().mockResolvedValue(baseSub),
      findUnique: jest.fn().mockResolvedValue(baseSub),
      findUniqueOrThrow: jest.fn().mockResolvedValue(baseSub),
      update: jest.fn().mockResolvedValue(baseSub),
    },
    accountMember: {
      count: jest.fn().mockResolvedValue(0),
    },
    usageLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(async (cmds: any) => {
      if (Array.isArray(cmds)) return Promise.all(cmds);
      return cmds();
    }),
    ...prismaOverrides,
  };

  const configService: any = {
    // No STRIPE_SECRET_KEY → service skips constructing a real Stripe client
    get: jest.fn().mockReturnValue(undefined),
  };

  const telegramService: any = { notifyNewSubscription: jest.fn() };
  const notificationsService: any = { sendToUser: jest.fn().mockReturnValue(Promise.resolve()) };

  const subscriptions = new SubscriptionsService(prisma, configService);
  const usage = new UsageTrackingService(prisma, subscriptions);
  const billing = new StripeBillingService(
    prisma,
    configService,
    subscriptions,
    telegramService,
    notificationsService,
    adminGateway,
  );

  return { subscriptions, usage, billing, prisma, configService, telegramService, notificationsService };
}
