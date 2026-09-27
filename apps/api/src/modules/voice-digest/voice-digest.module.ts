import { Global, Module } from '@nestjs/common';
import { DigestChannelRegistry } from './digest-channel.registry';

/**
 * Global registry that the three bot modules' `digest/` senders register
 * themselves into on `onModuleInit`. Nothing here depends on
 * telegram/whatsapp/slack — they depend on this module instead, so there is
 * no import cycle. Task 9 extends this module with the digest orchestrator
 * (schedule cron, facts/narration wiring) that consumes the registry.
 */
@Global()
@Module({
  providers: [DigestChannelRegistry],
  exports: [DigestChannelRegistry],
})
export class VoiceDigestModule {}
