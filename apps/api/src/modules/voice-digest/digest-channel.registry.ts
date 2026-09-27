import { Injectable } from '@nestjs/common';
import type { VoiceDigestChannel } from '@budget/shared-types';

/** The user blocked / removed the bot (deactivated the channel, revoked the token, etc.). */
export class DigestBlockedError extends Error {}

/** Channel not usable right now — e.g. the bot isn't started or no template is configured. */
export class DigestUnavailableError extends Error {}

export interface DigestPayload {
  userId: string;
  lang: string;
  text: string;
  audio: Buffer | null;
}

export interface DigestSender {
  readonly channel: VoiceDigestChannel;
  /** Resolves 'sent' (text/voice delivered) or 'template' (WhatsApp waiting for "Listen"). */
  send(payload: DigestPayload): Promise<'sent' | 'template'>;
  /** True when this user has an active link on this channel. */
  isLinked(userId: string): Promise<boolean>;
  /** The link's default account id, or null when the user has no link on this channel. */
  accountIdFor(userId: string): Promise<string | null>;
}

/**
 * Per-channel digest sender directory. Each `DigestSender` registers itself
 * here from its own `onModuleInit` (see the telegram/whatsapp/slack `digest/`
 * providers) rather than the registry knowing about every channel module —
 * keeps `VoiceDigestModule` independent of the bot modules.
 */
@Injectable()
export class DigestChannelRegistry {
  private readonly senders = new Map<VoiceDigestChannel, DigestSender>();

  register(sender: DigestSender): void {
    this.senders.set(sender.channel, sender);
  }

  get(channel: VoiceDigestChannel): DigestSender | undefined {
    return this.senders.get(channel);
  }

  channels(): VoiceDigestChannel[] {
    return [...this.senders.keys()];
  }
}
