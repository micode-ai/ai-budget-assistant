import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { SlackLinkService } from './slack-link.service';
import { SlackClientService } from './slack-client.service';
import { CommandHandler } from './handlers/command.handler';
import { ChatHandler } from './handlers/chat.handler';
import { ExpenseHandler } from './handlers/expense.handler';
import { IncomeHandler } from './handlers/income.handler';
import { CategoryHandler } from './handlers/category.handler';
import { VoiceHandler } from './handlers/voice.handler';
import { PhotoHandler } from './handlers/photo.handler';
import { parseCommand } from './helpers/parse-command';
import { t } from './helpers/i18n';
import {
  SLACK_REDIS,
  SlackEventCallback,
  SlackMessageEvent,
  SlackBlockActionsPayload,
  SlackUserState,
} from './types';

@Injectable()
export class SlackBotService {
  private readonly logger = new Logger(SlackBotService.name);

  constructor(
    private readonly linkService: SlackLinkService,
    private readonly client: SlackClientService,
    private readonly commandHandler: CommandHandler,
    private readonly chatHandler: ChatHandler,
    private readonly expenseHandler: ExpenseHandler,
    private readonly incomeHandler: IncomeHandler,
    private readonly categoryHandler: CategoryHandler,
    private readonly voiceHandler: VoiceHandler,
    private readonly photoHandler: PhotoHandler,
    @Inject(SLACK_REDIS) private readonly redis: Redis,
  ) {}

  /** Events API callback (DM messages). */
  async handleEvent(body: SlackEventCallback): Promise<void> {
    const event = body.event;
    if (!event || event.type !== 'message') return;

    // Loop guard: ignore bot/self messages and edit/delete/system subtypes.
    // `file_share` is the subtype Slack puts on a message when a user uploads or
    // pastes a file (image/voice/PDF) — it must pass through so the file gets
    // dispatched, otherwise receipt photos silently do nothing.
    if (event.bot_id) return;
    if (event.subtype && event.subtype !== 'file_share') return;
    const botUserId = await this.client.getBotUserId(body.team_id);
    if (event.user && botUserId && event.user === botUserId) return;
    if (!event.user || !event.channel) return;

    // Idempotency (Slack retries with X-Slack-Retry-Num): dedup by event_id
    const setOk = await this.redis.set(`slack:msg:${body.event_id}`, '1', 'EX', 86400, 'NX');
    if (setOk !== 'OK') {
      this.logger.debug(`Duplicate inbound dropped: ${body.event_id}`);
      return;
    }

    const userState = await this.resolveUserState(event.user, body.team_id, event.channel);
    if (userState) void this.linkService.updateLastInbound(event.user);

    try {
      await this.dispatchMessage(event, body.team_id, userState);
    } catch (err) {
      this.logger.error(`Handler crash on event ${body.event_id}: ${err instanceof Error ? err.stack || err.message : err}`);
      try {
        await this.client.sendText(body.team_id, event.channel, t('somethingWrong', userState?.language));
      } catch {
        // last-ditch reply failed — already logged
      }
    }
  }

  /** Block Kit interactivity (button taps). */
  async handleInteractivity(payload: SlackBlockActionsPayload): Promise<void> {
    if (payload.type !== 'block_actions') return;
    const action = payload.actions?.[0];
    if (!action) return;

    const channelId = payload.channel?.id;
    if (!channelId) return;
    const teamId = payload.user.team_id;

    const userState = await this.resolveUserState(
      payload.user.id,
      teamId,
      channelId,
    );
    if (!userState) {
      await this.client.sendText(teamId, channelId, t('linkFirst'));
      return;
    }

    try {
      await this.routeCallback(action.action_id, userState);
    } catch (err) {
      this.logger.error(`Interactivity crash: ${err instanceof Error ? err.stack || err.message : err}`);
    }
  }

  private async resolveUserState(
    slackUserId: string,
    teamId: string,
    channel: string,
  ): Promise<SlackUserState | undefined> {
    const link = await this.linkService.getLink(slackUserId);
    if (!link) return undefined;
    return {
      userId: link.userId,
      accountId: link.defaultAccountId,
      accountRole: link.accountRole,
      conversationId: link.conversationId,
      currencyCode: link.user.currencyCode,
      language: link.user.language || 'en',
      slackUserId,
      slackTeamId: teamId,
      channel,
    };
  }

  private async dispatchMessage(
    event: SlackMessageEvent,
    teamId: string,
    userState: SlackUserState | undefined,
  ): Promise<void> {
    const channel = event.channel;

    // Files (voice / image / document)
    const file = event.files?.[0];
    if (file) {
      if (!userState) {
        await this.client.sendText(teamId, channel, t('linkFirst'));
        return;
      }
      const ft = (file.filetype || file.mimetype || '').toLowerCase();
      if (file.mimetype.startsWith('audio/') || ft.includes('mp3') || ft.includes('m4a') || ft.includes('wav') || ft.includes('ogg')) {
        await this.voiceHandler.handle(file, userState);
        return;
      }
      if (file.mimetype.startsWith('image/')) {
        await this.photoHandler.handleImage(file, userState);
        return;
      }
      if (file.mimetype === 'application/pdf') {
        await this.photoHandler.handleDocument(file, userState);
        return;
      }
      // Unknown file type — fall through to any text
    }

    const text = event.text?.trim();
    if (!text) return;

    const parsed = parseCommand(text);

    // `link CODE` works before linking
    if (parsed?.command === 'link') {
      await this.commandHandler.handleLink(event.user!, teamId, parsed.args, channel);
      return;
    }

    if (!userState) {
      await this.client.sendText(teamId, channel, t('linkFirst'));
      return;
    }

    // Photo handler may be awaiting a date
    const consumed = await this.photoHandler.handleDateInput(text, userState);
    if (consumed) return;

    if (parsed) {
      switch (parsed.command) {
        case 'expense': return this.expenseHandler.handle(parsed.args, userState);
        case 'income': return this.incomeHandler.handle(parsed.args, userState);
        case 'help': return this.commandHandler.handleHelp(userState);
        case 'unlink': return this.commandHandler.handleUnlink(userState);
        case 'account':
        case 'menu': return this.commandHandler.handleAccount(userState);
        case 'newchat': return this.commandHandler.handleNewChat(userState);
        case 'usage': return this.commandHandler.handleUsage(userState);
        case 'category': return this.categoryHandler.handle(parsed.args, userState);
        case 'categories': return this.categoryHandler.handleList(userState);
      }
    }

    await this.chatHandler.handleText(text, userState);
  }

  private async routeCallback(actionId: string, userState: SlackUserState): Promise<void> {
    const sepIdx = actionId.indexOf(':');
    if (sepIdx < 0) {
      this.logger.warn(`Callback id missing ':' separator: ${actionId}`);
      return;
    }
    const prefix = actionId.slice(0, sepIdx);
    const payload = actionId.slice(sepIdx + 1);

    switch (prefix) {
      case 'ca': return this.chatHandler.handleConfirmCallback(payload, userState);
      case 'ra': return this.chatHandler.handleRejectCallback(payload, userState);
      case 'account': return this.commandHandler.handleAccountCallback(payload, userState);
      case 'cat_e': return this.categoryHandler.handleTypeCallback('expense', payload, userState);
      case 'cat_i': return this.categoryHandler.handleTypeCallback('income', payload, userState);
      case 'cat_d': return this.categoryHandler.handleDeleteCallback(payload, userState);
      case 'receipt_add': return this.photoHandler.handleReceiptAddCallback(payload, userState);
      case 'receipt_date': return this.photoHandler.handleDateCallback(payload, userState);
      case 'receipt_cancel': return this.photoHandler.handleReceiptCancelCallback(payload, userState);
      default: this.logger.warn(`Unknown callback prefix: ${prefix}`);
    }
  }
}
