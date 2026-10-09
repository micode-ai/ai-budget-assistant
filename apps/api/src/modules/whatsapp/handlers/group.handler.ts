import { Injectable, Logger } from '@nestjs/common';
import { GroupBotService, type GroupBotPlatform, type GroupBotReply } from '../../groups/group-bot.service';
import { WhatsAppClientService } from '../whatsapp-client.service';
import { WhatsAppUserState } from '../types';
import { t } from '../helpers/i18n';

/**
 * User-controlled labels (group name, description) land inside WhatsApp text: neutralise its formatting
 * characters (`*` `_` `~` backtick) with a zero-width joiner, and break auto-links after `://` and `www.`.
 */
export const escapeWhatsApp = (s: string): string =>
  s
    .replace(/[*_~`]/g, (c) => `${c}\u200d`)
    .replace(/:\/\//g, '://\u200d')
    .replace(/www\./gi, (m) => `${m}\u200d`);

/** Drafts live under `wa:grp:{draftId}` (CacheService, 1800 s TTL; never a module Map). */
const PLATFORM: GroupBotPlatform = { keyPrefix: 'wa:grp', t, escape: escapeWhatsApp, command: 'group' };

/**
 * `group <amount> [currency] [description]` — an expense in a shared group (ABA-658). The flow and
 * every check live in `GroupBotService`; this only renders. The picker is an interactive LIST (its
 * 10-row cap is why the picker shows at most 10 groups); callback ids use `--` because UUIDs and our
 * payloads contain `-`/`:`: `gp--{draftId}:{index}`, `gc--{draftId}`, `gx--{draftId}`.
 *
 * The account viewer role is deliberately NOT checked here, unlike the other write handlers: groups
 * are not account-scoped (see GroupBotService).
 */
@Injectable()
export class GroupHandler {
  private readonly logger = new Logger(GroupHandler.name);

  constructor(
    private readonly groupBot: GroupBotService,
    private readonly client: WhatsAppClientService,
  ) {}

  /** `messageId` is the inbound wamid: the expense's request id derives from it (one expense per message). */
  async handle(args: string, messageId: string, userState: WhatsAppUserState): Promise<void> {
    const reply = await this.groupBot.start(PLATFORM, this.caller(userState), args, messageId);
    await this.send(reply, userState);
  }

  async handlePick(payload: string, userState: WhatsAppUserState): Promise<void> {
    const [draftId, index] = payload.split(':');
    await this.send(await this.groupBot.pick(PLATFORM, this.caller(userState), draftId ?? '', index ?? ''), userState);
  }

  async handleConfirm(draftId: string, userState: WhatsAppUserState): Promise<void> {
    await this.send(await this.groupBot.confirm(PLATFORM, this.caller(userState), draftId), userState);
  }

  async handleCancel(draftId: string, userState: WhatsAppUserState): Promise<void> {
    await this.send(await this.groupBot.cancel(PLATFORM, this.caller(userState), draftId), userState);
  }

  private caller(userState: WhatsAppUserState) {
    return { userId: userState.userId, language: userState.language };
  }

  private async send(reply: GroupBotReply, userState: WhatsAppUserState): Promise<void> {
    const to = userState.waPhoneNumber;
    if (reply.kind === 'picker') {
      await this.client.sendList(
        to,
        reply.text,
        reply.buttonLabel,
        reply.options.map((o) => ({ id: `gp--${reply.draftId}:${o.index}`, title: o.label })),
      );
      return;
    }
    if (reply.kind === 'confirm') {
      await this.client.sendButtons(to, reply.text, [
        { id: `gc--${reply.draftId}`, title: reply.confirmLabel },
        { id: `gx--${reply.draftId}`, title: reply.cancelLabel },
      ]);
      return;
    }
    await this.client.sendText(to, reply.text);
  }
}
