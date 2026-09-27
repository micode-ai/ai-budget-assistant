import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
  private readonly logger = new Logger(SlackDigestSender.name);

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
        try {
          await this.client.uploadAudio(link.slackTeamId, channelId, payload.audio, payload.text);
        } catch (uploadErr) {
          if (this.isBlocked(uploadErr)) throw uploadErr;
          // Upload failed for a non-permanent reason — most often `missing_scope`
          // on a workspace installed before `files:write` was requested. The
          // text always goes out; the audio degrades away, same as a TTS failure.
          this.logger.warn(
            `Slack digest audio upload failed for user ${payload.userId} (${this.errorCode(uploadErr)}); sending text only`,
          );
          await this.client.sendText(link.slackTeamId, channelId, payload.text);
        }
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
    const code = this.errorCode(err);
    return typeof code === 'string' && BLOCKED_ERROR_CODES.has(code);
  }

  private errorCode(err: unknown): string | undefined {
    const code = (err as { data?: { error?: string } } | null)?.data?.error;
    return typeof code === 'string' ? code : undefined;
  }
}
