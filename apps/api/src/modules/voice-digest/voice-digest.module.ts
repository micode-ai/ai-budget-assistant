import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InsightsModule } from '../insights/insights.module';
import { ShoppingListModule } from '../shopping-list/shopping-list.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { DigestChannelRegistry } from './digest-channel.registry';
import { VoiceDigestFactsService } from './voice-digest-facts.service';
import { VoiceDigestNarratorService } from './voice-digest-narrator.service';
import { TtsService } from './tts.service';
import { VoiceDigestService } from './voice-digest.service';
import { VoiceDigestCron } from './voice-digest.cron';

/**
 * Global registry that the three bot modules' `digest/` senders register
 * themselves into on `onModuleInit`. Nothing here depends on
 * telegram/whatsapp/slack — they depend on this module instead, so there is
 * no import cycle. Extended (Task 9) with the digest orchestrator
 * (`VoiceDigestService`) and the hourly `VoiceDigestCron` that consumes the
 * registry plus the existing insight/shopping-list/subscription/FX services.
 * None of the imported modules import this one back — verified by grep, and
 * pinned by `__tests__/voice-digest.di.spec.ts` actually resolving the
 * container.
 */
@Global()
@Module({
  imports: [InsightsModule, ShoppingListModule, SubscriptionsModule, CurrencyExchangeModule, ConfigModule],
  providers: [
    DigestChannelRegistry,
    VoiceDigestFactsService,
    VoiceDigestNarratorService,
    TtsService,
    VoiceDigestService,
    VoiceDigestCron,
  ],
  exports: [DigestChannelRegistry, VoiceDigestService],
})
export class VoiceDigestModule {}
