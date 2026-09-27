import { Injectable, OnModuleInit } from '@nestjs/common';
import type { VoiceDigestChannel } from '@budget/shared-types';
import {
  DigestBlockedError,
  DigestChannelRegistry,
  DigestPayload,
  DigestSender,
  DigestUnavailableError,
} from '../../voice-digest/digest-channel.registry';
import { SlackClientService } from '../slack-client.service';
import { SlackLinkService } from '../slack-link.service';

/**
 * Slack `WebAPIPlatformError` `data.error` codes that mean "this DM is
 * permanently unreachable" — the user removed the app, deactivated their
 * account, or the workspace revoked/uninstalled it.
 */
const BLOCKED_ERROR_CODES = new Set([
  'channel_not_found',
  'is_archived',
  'account_inactive',
  'not_in_channel',
  'user_not_found',
  'invalid_auth',
  'token_revoked',
]);

@Injectable()
export class SlackDigestSender implements DigestSender, OnModuleInit {
  readonly channel: VoiceDigestChannel = 'slack';

  constructor(
    private readonly registry: DigestChannelRegistry,
    private readonly client: SlackClientService,
    private readonly linkService: SlackLinkService,
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
    const link = await this.linkService.getLinkByUserId(payload.userId);
    if (!link) {
      throw new DigestUnavailableError('No active Slack link for user');
    }

    try {
      const channelId = await this.client.openDm(link.slackTeamId, link.slackUserId);
      if (payload.audio) {
        await this.client.uploadAudio(link.slackTeamId, channelId, payload.audio, payload.text);
      } else {
        await this.client.sendText(link.slackTeamId, channelId, payload.text);
      }
      return 'sent';
    } catch (err) {
      if (this.isBlocked(err)) {
        throw new DigestBlockedError('Slack recipient is unreachable');
      }
      throw err;
    }
  }

  private isBlocked(err: unknown): boolean {
    const code = (err as { data?: { error?: string } } | null)?.data?.error;
    return typeof code === 'string' && BLOCKED_ERROR_CODES.has(code);
  }
}
