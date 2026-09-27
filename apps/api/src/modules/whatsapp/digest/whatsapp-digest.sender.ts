import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { VoiceDigestChannel } from '@budget/shared-types';
import {
  DigestBlockedError,
  DigestChannelRegistry,
  DigestPayload,
  DigestSender,
  DigestUnavailableError,
} from '../../voice-digest/digest-channel.registry';
import { templateLanguage } from '../../voice-digest/digest-text.util';
import { WhatsAppClientService, WhatsAppGraphError } from '../whatsapp-client.service';
import { WhatsAppLinkService } from '../whatsapp-link.service';
import { WA_REDIS } from '../types';

/** Meta Graph error codes relevant to the digest send. */
const GRAPH_CODE_RECIPIENT_BLOCKED = 131026;
const GRAPH_CODE_OUTSIDE_WINDOW = 131047; // "re-engagement message" — 24h window closed

/** The WhatsApp customer-service window: a free-form message is only allowed
 * within 24h of the user's last inbound message. Kept at 23h (not 24h) as a
 * safety margin against clock skew between us and Meta. */
const CUSTOMER_SERVICE_WINDOW_MS = 23 * 60 * 60 * 1000;

/** TTL for a pending digest awaiting the "Listen" quick reply: 48h. */
const PENDING_DIGEST_TTL_SEC = 172800;

/** TTL for the wamid → userId map read by async `statuses[]` webhooks: 3 days. */
const DIGEST_MESSAGE_TTL_SEC = 259200;

interface PendingDigest {
  text: string;
  audioB64: string | null;
}

function pendingKey(userId: string): string {
  return `wa:vd:${userId}`;
}

function messageKey(wamid: string): string {
  return `wa:vdmsg:${wamid}`;
}

@Injectable()
export class WhatsAppDigestSender implements DigestSender, OnModuleInit {
  readonly channel: VoiceDigestChannel = 'whatsapp';

  constructor(
    private readonly registry: DigestChannelRegistry,
    private readonly client: WhatsAppClientService,
    private readonly linkService: WhatsAppLinkService,
    private readonly config: ConfigService,
    @Inject(WA_REDIS) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async isLinked(userId: string): Promise<boolean> {
    const link = await this.linkService.getLinkByUserId(userId);
    return link !== null;
  }

  async accountIdFor(userId: string): Promise<string | null> {
    const link = await this.linkService.getLinkByUserId(userId);
    return link?.defaultAccountId ?? null;
  }

  async send(payload: DigestPayload): Promise<'sent' | 'template'> {
    if (!this.client.isConfigured()) {
      throw new DigestUnavailableError('WhatsApp client not configured');
    }

    const link = await this.linkService.getLinkByUserId(payload.userId);
    if (!link) {
      throw new DigestUnavailableError('No active WhatsApp link for user');
    }

    const withinWindow =
      link.lastInboundAt !== null && Date.now() - link.lastInboundAt.getTime() <= CUSTOMER_SERVICE_WINDOW_MS;

    if (withinWindow) {
      try {
        await this.deliverDirect(payload.userId, link.waPhoneNumber, payload.text, payload.audio);
        return 'sent';
      } catch (err) {
        const code = err instanceof WhatsAppGraphError ? err.code : null;
        if (code === GRAPH_CODE_RECIPIENT_BLOCKED) {
          throw new DigestBlockedError('WhatsApp recipient blocked the bot');
        }
        if (code !== GRAPH_CODE_OUTSIDE_WINDOW) {
          throw err;
        }
        // Meta disagrees with our window estimate — fall through to the
        // template path below, same as the "outside window" branch.
      }
    }

    return this.sendViaTemplate(link.waPhoneNumber, payload);
  }

  /**
   * Meta usually reports a block (131026) asynchronously, in a `statuses[]`
   * webhook carrying only the wamid. Returns the digest recipient for a wamid
   * this sender sent — once (`GETDEL`, so a redelivered status can't
   * disable/push twice) — or null for any message that was not a digest.
   */
  async takeDigestRecipient(wamid: string): Promise<string | null> {
    return this.redis.getdel(messageKey(wamid));
  }

  /**
   * Task 10 routes the "Listen" quick-reply callback here. Returns false when
   * the pending digest already expired (or was never queued) in Redis, or
   * when another concurrent tap already claimed it (see `getdel` below).
   *
   * The take is atomic (`GETDEL`, one round trip) rather than a separate
   * GET+DEL: two "Listen" taps (or a webhook redelivery) arriving together
   * must result in exactly one delivery, not two. If delivery then fails
   * (a transient Graph/network error) the entry is restored with a fresh
   * TTL and the error is rethrown, so a transient failure doesn't silently
   * lose the digest — a retried tap can still deliver it.
   */
  async deliverPending(userId: string): Promise<boolean> {
    if (!this.client.isConfigured()) {
      throw new DigestUnavailableError('WhatsApp client not configured');
    }

    const key = pendingKey(userId);
    const raw = await this.redis.getdel(key);
    if (!raw) return false;

    const link = await this.linkService.getLinkByUserId(userId);
    if (!link) return false;

    const pending = JSON.parse(raw) as PendingDigest;
    const audio = pending.audioB64 ? Buffer.from(pending.audioB64, 'base64') : null;

    try {
      await this.deliverDirect(userId, link.waPhoneNumber, pending.text, audio);
    } catch (err) {
      await this.redis.set(key, raw, 'EX', PENDING_DIGEST_TTL_SEC);
      throw err;
    }

    return true;
  }

  private async deliverDirect(userId: string, to: string, text: string, audio: Buffer | null): Promise<void> {
    if (audio) {
      const mediaId = await this.client.uploadMedia(audio, 'audio/ogg', 'digest.ogg');
      await this.rememberMessage(await this.client.sendAudio(to, mediaId), userId);
    }
    await this.rememberMessage(await this.client.sendText(to, text), userId);
  }

  private async rememberMessage(wamid: string | undefined, userId: string): Promise<void> {
    if (!wamid) return;
    await this.redis.set(messageKey(wamid), userId, 'EX', DIGEST_MESSAGE_TTL_SEC);
  }

  private async sendViaTemplate(to: string, payload: DigestPayload): Promise<'template'> {
    const templateName = this.config.get<string>('WHATSAPP_DIGEST_TEMPLATE');
    if (!templateName) {
      throw new DigestUnavailableError('WHATSAPP_DIGEST_TEMPLATE is not configured');
    }

    const pending: PendingDigest = {
      text: payload.text,
      audioB64: payload.audio ? payload.audio.toString('base64') : null,
    };
    await this.redis.set(pendingKey(payload.userId), JSON.stringify(pending), 'EX', PENDING_DIGEST_TTL_SEC);

    try {
      const wamid = await this.client.sendTemplate(to, templateName, templateLanguage(payload.lang), 'vd--listen');
      await this.rememberMessage(wamid, payload.userId);
    } catch (err) {
      const code = err instanceof WhatsAppGraphError ? err.code : null;
      if (code === GRAPH_CODE_RECIPIENT_BLOCKED) {
        throw new DigestBlockedError('WhatsApp recipient blocked the bot');
      }
      throw err;
    }

    return 'template';
  }
}
