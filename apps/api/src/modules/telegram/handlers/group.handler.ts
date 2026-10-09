import { Injectable, Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { GroupBotService, type GroupBotPlatform, type GroupBotReply } from '../../groups/group-bot.service';
import { BotContext } from '../types';
import { t } from '../helpers/i18n';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Drafts live under `telegram:grp:{draftId}` (CacheService, 1800 s TTL; never a module Map). */
const PLATFORM: GroupBotPlatform = { keyPrefix: 'telegram:grp', t, escape: escapeHtml, command: '/group' };

/**
 * `/group <amount> [currency] [description]` — an expense in a shared group (ABA-658). The flow and
 * every check live in `GroupBotService`; this only renders. Callback data: `gp:{draftId}:{index}`
 * (picker), `gc:{draftId}` (confirm), `gx:{draftId}` (cancel), all well under Telegram's 64 bytes.
 *
 * The account viewer role is deliberately NOT checked here, unlike the other write handlers: groups
 * are not account-scoped (see GroupBotService).
 */
@Injectable()
export class GroupHandler {
  private readonly logger = new Logger(GroupHandler.name);

  constructor(private readonly groupBot: GroupBotService) {}

  async handle(ctx: BotContext): Promise<void> {
    const lang = ctx.userState?.language ?? ctx.from?.language_code;
    try {
      // Private chats only: a group chat would show the card (and the group names) to everyone in it.
      if (ctx.chat?.type !== 'private') {
        await ctx.reply(t('groupPrivateOnly', lang));
        return;
      }
      if (!ctx.userState) {
        await ctx.reply(t('linkFirst', lang), { parse_mode: 'HTML' });
        return;
      }
      const message = ctx.message && 'text' in ctx.message ? ctx.message : null;
      const args = (message?.text ?? '').replace(/^\/group(@\w+)?\s*/i, '');
      // The platform's own message id: a redelivered update and a double-tapped Confirm both hit the
      // createExpense dedup and create one expense.
      const messageKey = `${ctx.chat?.id ?? ctx.from?.id}:${message?.message_id ?? Date.now()}`;
      const reply = await this.groupBot.start(PLATFORM, this.caller(ctx), args, messageKey);
      await this.send(ctx, reply, false);
    } catch (error) {
      this.logger.error(`Error in /group: ${error}`);
      await ctx.reply(t('somethingWrong', lang));
    }
  }

  async handlePick(ctx: BotContext, payload: string): Promise<void> {
    const [draftId, index] = payload.split(':');
    await this.callback(ctx, () => this.groupBot.pick(PLATFORM, this.caller(ctx), draftId ?? '', index ?? ''));
  }

  async handleConfirm(ctx: BotContext, draftId: string): Promise<void> {
    await this.callback(ctx, () => this.groupBot.confirm(PLATFORM, this.caller(ctx), draftId));
  }

  async handleCancel(ctx: BotContext, draftId: string): Promise<void> {
    await this.callback(ctx, () => this.groupBot.cancel(PLATFORM, this.caller(ctx), draftId));
  }

  private caller(ctx: BotContext) {
    return { userId: ctx.userState!.userId, language: ctx.userState!.language };
  }

  private async callback(ctx: BotContext, run: () => Promise<GroupBotReply>): Promise<void> {
    try {
      if (ctx.chat?.type !== 'private') {
        await ctx.answerCbQuery(t('groupPrivateOnly', ctx.userState?.language ?? ctx.from?.language_code));
        return;
      }
      if (!ctx.userState) {
        await ctx.answerCbQuery(t('linkFirst', ctx.from?.language_code));
        return;
      }
      await ctx.answerCbQuery();
      await this.send(ctx, await run(), true);
    } catch (error) {
      this.logger.error(`Error in a /group callback: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  /** `edit` = replace the message the button was on, so a used card cannot be tapped again. */
  private async send(ctx: BotContext, reply: GroupBotReply, edit: boolean): Promise<void> {
    let extra: Record<string, unknown> = { parse_mode: 'HTML' };
    if (reply.kind === 'picker') {
      extra = {
        ...extra,
        ...Markup.inlineKeyboard(
          reply.options.map((o) => [Markup.button.callback(o.label.slice(0, 60), `gp:${reply.draftId}:${o.index}`)]),
        ),
      };
    } else if (reply.kind === 'confirm') {
      extra = {
        ...extra,
        ...Markup.inlineKeyboard([
          Markup.button.callback(reply.confirmLabel, `gc:${reply.draftId}`),
          Markup.button.callback(reply.cancelLabel, `gx:${reply.draftId}`),
        ]),
      };
    }
    if (edit) {
      await ctx.editMessageText(reply.text, extra);
      return;
    }
    await ctx.reply(reply.text, extra);
  }
}
