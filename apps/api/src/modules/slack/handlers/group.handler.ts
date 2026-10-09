import { Injectable } from '@nestjs/common';
import { GroupBotService, type GroupBotPlatform, type GroupBotReply } from '../../groups/group-bot.service';
import { SlackClientService } from '../slack-client.service';
import { SlackUserState } from '../types';
import { t } from '../helpers/i18n';

/** Slack mrkdwn treats `&`, `<` and `>` as control characters. */
const escapeSlack = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Drafts live under `slack:grp:{draftId}` (CacheService, 1800 s TTL; never a module Map). */
const PLATFORM: GroupBotPlatform = { keyPrefix: 'slack:grp', t, escape: escapeSlack, command: 'group' };

/**
 * `group <amount> [currency] [description]` — an expense in a shared group (ABA-658). The flow and
 * every check live in `GroupBotService`; this only renders. The picker is a `static_select` (it
 * sidesteps the 5-button actions cap): action id `gp:{draftId}`, option value = the index. Confirm
 * and Cancel are buttons `gc:{draftId}` / `gx:{draftId}`. Every reply is a new message; nothing
 * here calls `chat.update`.
 *
 * The account viewer role is deliberately NOT checked here, unlike the other write handlers: groups
 * are not account-scoped (see GroupBotService).
 */
@Injectable()
export class GroupHandler {
  constructor(
    private readonly groupBot: GroupBotService,
    private readonly client: SlackClientService,
  ) {}

  /** `messageTs` is the inbound message's ts: the expense's request id derives from it. */
  async handle(args: string, messageTs: string, userState: SlackUserState): Promise<void> {
    const messageKey = `${userState.slackTeamId}:${userState.channel}:${messageTs}`;
    await this.send(await this.groupBot.start(PLATFORM, this.caller(userState), args, messageKey), userState);
  }

  /** `payload` is `{draftId}:{selected option value}`, assembled by the interactivity router. */
  async handlePick(payload: string, userState: SlackUserState): Promise<void> {
    const [draftId, index] = payload.split(':');
    await this.send(await this.groupBot.pick(PLATFORM, this.caller(userState), draftId ?? '', index ?? ''), userState);
  }

  async handleConfirm(draftId: string, userState: SlackUserState): Promise<void> {
    await this.send(await this.groupBot.confirm(PLATFORM, this.caller(userState), draftId), userState);
  }

  async handleCancel(draftId: string, userState: SlackUserState): Promise<void> {
    await this.send(await this.groupBot.cancel(PLATFORM, this.caller(userState), draftId), userState);
  }

  private caller(userState: SlackUserState) {
    return { userId: userState.userId, language: userState.language };
  }

  private async send(reply: GroupBotReply, userState: SlackUserState): Promise<void> {
    const { slackTeamId: teamId, channel } = userState;
    if (reply.kind === 'picker') {
      await this.client.sendSelect(
        teamId,
        channel,
        reply.text,
        `gp:${reply.draftId}`,
        reply.buttonLabel,
        reply.options.map((o) => ({ value: String(o.index), label: o.label })),
      );
      return;
    }
    if (reply.kind === 'confirm') {
      await this.client.sendButtons(teamId, channel, reply.text, [
        { id: `gc:${reply.draftId}`, title: reply.confirmLabel },
        { id: `gx:${reply.draftId}`, title: reply.cancelLabel },
      ]);
      return;
    }
    await this.client.sendText(teamId, channel, reply.text);
  }
}
