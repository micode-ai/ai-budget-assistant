import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { ExchangeRateService } from '../../currency-exchange/exchange-rate.service';
import { SafeToSpendService } from '../../insights/safe-to-spend.service';
import { InflationShieldService } from '../../insights/inflation-shield.service';
import { ShoppingListService } from '../../shopping-list/shopping-list.service';
import { RealSalaryService } from '../../insights/real-salary/real-salary.service';
import { CoicopClassifierService } from '../../insights/real-salary/coicop-classifier.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { DigestChannelRegistry } from '../digest-channel.registry';
import { VoiceDigestFactsService } from '../voice-digest-facts.service';
import { VoiceDigestNarratorService } from '../voice-digest-narrator.service';
import { TtsService } from '../tts.service';
import { VoiceDigestService } from '../voice-digest.service';
import { VoiceDigestCron } from '../voice-digest.cron';

/**
 * Nest boot smoke test: proves the orchestrator and cron resolve through the
 * actual DI container with the real provider list from VoiceDigestModule,
 * every external dependency stubbed. Mirrors
 * insights/real-salary/__tests__/real-salary.di.spec.ts.
 */
describe('voice-digest module DI wiring', () => {
  it('resolves VoiceDigestService and VoiceDigestCron from the container', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DigestChannelRegistry,
        VoiceDigestFactsService,
        VoiceDigestNarratorService,
        TtsService,
        VoiceDigestService,
        VoiceDigestCron,
        { provide: PrismaService, useValue: {} },
        { provide: CacheService, useValue: {} },
        { provide: ExchangeRateService, useValue: {} },
        { provide: SafeToSpendService, useValue: {} },
        { provide: InflationShieldService, useValue: {} },
        { provide: ShoppingListService, useValue: {} },
        { provide: RealSalaryService, useValue: {} },
        { provide: CoicopClassifierService, useValue: {} },
        { provide: SubscriptionsService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    expect(moduleRef.get(VoiceDigestService)).toBeDefined();
    expect(moduleRef.get(VoiceDigestCron)).toBeDefined();
  });
});
