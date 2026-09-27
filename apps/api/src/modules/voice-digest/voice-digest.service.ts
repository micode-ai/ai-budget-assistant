import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UpdateVoiceDigestDto, VoiceDigestChannel, VoiceDigestSettings } from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DigestBlockedError, DigestChannelRegistry, DigestUnavailableError } from './digest-channel.registry';
import { VoiceDigestFactsService } from './voice-digest-facts.service';
import { VoiceDigestNarratorService } from './voice-digest-narrator.service';
import { TtsService } from './tts.service';
import { assembleDigestFacts } from './digest-facts.util';
import { blockedDigestPushBody, blockedDigestPushTitle } from './voice-digest-blocked-i18n';

export type DigestOutcome = 'sent' | 'template' | 'empty' | 'encrypted' | 'no_channel' | 'unavailable' | 'blocked' | 'failed';

const USAGE_FEATURE_TYPE = 'voice_digest';
const USAGE_COST_UNITS = 0.5;
const ENCRYPTED_TIER_THRESHOLD = 2;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Orchestrates one user's weekly voice digest: resolves their linked channel,
 * gathers + assembles the week's facts, narrates and voices them, sends
 * through the channel's `DigestSender`, and records the outcome (lastSentAt /
 * usage on a real delivery, disabling the digest on a permanent block).
 * Every branch is captured by `DigestOutcome` rather than a thrown error —
 * the cron (and later the `/digest now` command) needs a value to log and
 * count, not an exception to catch per user.
 */
@Injectable()
export class VoiceDigestService {
  private readonly logger = new Logger(VoiceDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DigestChannelRegistry,
    private readonly factsService: VoiceDigestFactsService,
    private readonly narrator: VoiceDigestNarratorService,
    private readonly tts: TtsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * `opts.channel` overrides `user.voiceDigestChannel` for this run only —
   * used by `/digest now`, which must run over the channel the command
   * arrived on, not whatever channel the user has stored (which may differ,
   * or be unset). `opts.preview` skips the `voiceDigestLastSentAt` stamp (a
   * preview is not the weekly send — the real one must still fire on
   * schedule) while still recording usage, since the narration/TTS cost was
   * incurred either way.
   */
  async runForUser(
    userId: string,
    opts?: { force?: boolean; now?: Date; channel?: VoiceDigestChannel; preview?: boolean },
  ): Promise<DigestOutcome> {
    const now = opts?.now ?? new Date();

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, timezone: true, language: true, currencyCode: true, voiceDigestChannel: true },
      });
      if (!user) return 'no_channel';

      const channel = (opts?.channel ?? user.voiceDigestChannel) as VoiceDigestChannel | null;
      if (!channel) return 'no_channel';

      const sender = this.registry.get(channel);
      if (!sender) return 'no_channel';

      const linked = await sender.isLinked(userId);
      if (!linked) return 'no_channel';

      const linkAccountId = await sender.accountIdFor(userId);
      if (!linkAccountId) return 'no_channel';

      const account = await this.resolveAccountId(userId, linkAccountId);
      if (!account) return 'no_channel';
      const accountId = account.id;

      if (account.encryptionTier >= ENCRYPTED_TIER_THRESHOLD) return 'encrypted';

      const lang = user.language || 'en';
      const inputs = await this.factsService.gather(accountId, userId, user.currencyCode, now);
      const facts = assembleDigestFacts(inputs);
      if (!facts) return 'empty';

      const { text } = await this.narrator.narrate(facts, lang);
      const audio = await this.tts.synthesize(text, lang);

      let result: 'sent' | 'template';
      try {
        result = await sender.send({ userId, lang, text, audio });
      } catch (err) {
        if (err instanceof DigestBlockedError) {
          await this.prisma.user.update({ where: { id: userId }, data: { voiceDigestEnabled: false } });
          this.notifications
            .sendToUser(
              userId,
              (l) => blockedDigestPushTitle(l),
              (l) => blockedDigestPushBody(l, channel),
              { type: 'voice_digest_disabled' },
              'voice_digest_disabled',
            )
            .catch(logFireAndForget(this.logger, 'VoiceDigestService.blockedPush'));
          return 'blocked';
        }
        if (err instanceof DigestUnavailableError) {
          return 'unavailable';
        }
        throw err;
      }

      if (!opts?.preview) {
        await this.prisma.user.update({ where: { id: userId }, data: { voiceDigestLastSentAt: now } });
      }
      await this.subscriptions.recordAdditionalUsage(userId, USAGE_FEATURE_TYPE, USAGE_COST_UNITS, accountId);

      return result;
    } catch (err) {
      this.logger.warn(`VoiceDigestService.runForUser failed for user ${userId}: ${errorMessage(err)}`);
      return 'failed';
    }
  }

  /**
   * The channel link's stored `accountId` can go stale — the user left the
   * account, was removed from it, or it was soft-deleted — and nothing
   * updates the link when that happens (see task-9 review C1). Re-checks
   * active membership before trusting it, falling back once to the user's
   * `defaultAccountId` (itself re-checked the same way) so a stale link
   * degrades to "use my other account" rather than "keep leaking this one".
   */
  private async resolveAccountId(
    userId: string,
    linkAccountId: string,
  ): Promise<{ id: string; encryptionTier: number } | null> {
    const linked = await this.prisma.account.findFirst({
      where: { id: linkAccountId, isActive: true, members: { some: { userId } } },
      select: { id: true, encryptionTier: true },
    });
    if (linked) return linked;

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { defaultAccountId: true } });
    if (!user?.defaultAccountId || user.defaultAccountId === linkAccountId) return null;

    return this.prisma.account.findFirst({
      where: { id: user.defaultAccountId, isActive: true, members: { some: { userId } } },
      select: { id: true, encryptionTier: true },
    });
  }

  async getSettings(userId: string): Promise<VoiceDigestSettings> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { voiceDigestEnabled: true, voiceDigestDay: true, voiceDigestHour: true, voiceDigestChannel: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const availableChannels: VoiceDigestChannel[] = [];
    for (const channel of this.registry.channels()) {
      const sender = this.registry.get(channel);
      if (sender && (await sender.isLinked(userId))) availableChannels.push(channel);
    }

    const whatsappLinked = availableChannels.includes('whatsapp');
    const whatsappTemplateConfigured = this.isWhatsAppTemplateConfigured();

    const storedChannel = user.voiceDigestChannel as VoiceDigestChannel | null;
    const channel = storedChannel && availableChannels.includes(storedChannel) ? storedChannel : null;

    return {
      enabled: user.voiceDigestEnabled,
      day: user.voiceDigestDay,
      hour: user.voiceDigestHour,
      channel,
      availableChannels,
      whatsappAvailable: whatsappLinked && whatsappTemplateConfigured,
    };
  }

  async updateSettings(userId: string, dto: UpdateVoiceDigestDto): Promise<VoiceDigestSettings> {
    if (dto.day !== undefined && (!Number.isInteger(dto.day) || dto.day < 0 || dto.day > 6)) {
      throw new BadRequestException('day must be an integer between 0 and 6');
    }
    if (dto.hour !== undefined && (!Number.isInteger(dto.hour) || dto.hour < 0 || dto.hour > 23)) {
      throw new BadRequestException('hour must be an integer between 0 and 23');
    }

    const current = await this.getSettings(userId);

    if (dto.channel !== undefined && !current.availableChannels.includes(dto.channel)) {
      throw new BadRequestException('channel is not linked for this user');
    }
    if (dto.channel !== undefined && !this.isDeliverable(dto.channel)) {
      throw new BadRequestException('the WhatsApp voice digest is not available yet');
    }

    const data: { voiceDigestDay?: number; voiceDigestHour?: number; voiceDigestChannel?: string; voiceDigestEnabled?: boolean } = {};
    if (dto.day !== undefined) data.voiceDigestDay = dto.day;
    if (dto.hour !== undefined) data.voiceDigestHour = dto.hour;
    if (dto.channel !== undefined) data.voiceDigestChannel = dto.channel;

    const willBeEnabled = dto.enabled ?? current.enabled;
    if (willBeEnabled) {
      const resolvedChannel = dto.channel ?? current.channel;
      if (resolvedChannel && !this.isDeliverable(resolvedChannel)) {
        throw new BadRequestException('the WhatsApp voice digest is not available yet');
      }
      if (!resolvedChannel) {
        const pick = current.availableChannels.find((c) => this.isDeliverable(c));
        if (!pick) throw new BadRequestException('no linked channel available to enable the voice digest');
        data.voiceDigestChannel = pick;
      }
    }
    if (dto.enabled !== undefined) data.voiceDigestEnabled = dto.enabled;

    await this.prisma.user.update({ where: { id: userId }, data });

    return this.getSettings(userId);
  }

  /**
   * Returns false — and changes nothing — when the channel cannot deliver a
   * weekly digest at all: WhatsApp before `WHATSAPP_DIGEST_TEMPLATE` is set,
   * where every send outside the 23 h window would be `'unavailable'` and the
   * user would opt in to silence. The bot replies `digestUnavailable` then.
   */
  async enableFrom(userId: string, channel: VoiceDigestChannel): Promise<boolean> {
    if (!this.isDeliverable(channel)) return false;
    await this.prisma.user.update({
      where: { id: userId },
      data: { voiceDigestEnabled: true, voiceDigestChannel: channel },
    });
    return true;
  }

  private isWhatsAppTemplateConfigured(): boolean {
    return !!this.config.get<string>('WHATSAPP_DIGEST_TEMPLATE');
  }

  /** WhatsApp needs the approved template; the other channels can always deliver. */
  private isDeliverable(channel: VoiceDigestChannel): boolean {
    return channel !== 'whatsapp' || this.isWhatsAppTemplateConfigured();
  }

  async disable(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { voiceDigestEnabled: false } });
  }
}
