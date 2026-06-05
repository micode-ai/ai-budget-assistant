import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import { CategoriesService } from '../../categories/categories.service';
import { SlackClientService } from '../slack-client.service';
import { SlackUserState, SLACK_REDIS } from '../types';
import { t } from '../helpers/i18n';

@Injectable()
export class CategoryHandler {
  private readonly logger = new Logger(CategoryHandler.name);

  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly slackClient: SlackClientService,
    @Inject(SLACK_REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Handles `category [type] <name>`.
   * - If type (expense/income) is present → create immediately.
   * - If only name → stash in Redis and send a 2-button type picker.
   * - If empty → send usage hint.
   */
  async handle(args: string, userState: SlackUserState): Promise<void> {
    try {
      const { channel, language } = userState;
      const teamId = userState.slackTeamId;

      if (userState.accountRole === 'viewer') {
        await this.slackClient.sendText(teamId, channel, t('viewerRestricted', language));
        return;
      }

      if (!args || !args.trim()) {
        await this.slackClient.sendText(
          teamId,
          channel,
          t('categoryUsage', language),
        );
        return;
      }

      const parts = args.trim().split(/\s+/);
      const firstWord = parts[0].toLowerCase();

      let type: 'expense' | 'income' | null = null;
      let name: string;

      if (firstWord === 'expense' || firstWord === 'income') {
        type = firstWord as 'expense' | 'income';
        name = parts.slice(1).join(' ').trim();

        if (!name) {
          await this.slackClient.sendText(
            teamId,
            channel,
            t('categoryNameRequired', language),
          );
          return;
        }
      } else {
        name = args.trim();
      }

      if (name.length > 50) {
        await this.slackClient.sendText(
          teamId,
          channel,
          t('categoryNameTooLong', language),
        );
        return;
      }

      if (type) {
        await this.createCategory(type, name, userState);
      } else {
        // Stash name in Redis with a short ID to avoid encoding issues in callback IDs
        const shortId = randomUUID().slice(0, 8);
        await this.redis.set(`slack:cat:${shortId}`, name, 'EX', 600);

        await this.slackClient.sendButtons(
          teamId,
          channel,
          t('categoryChooseType', language, { name }),
          [
            { id: `cat_e:${shortId}`, title: t('categoryExpenseBtn', language) },
            { id: `cat_i:${shortId}`, title: t('categoryIncomeBtn', language) },
          ],
        );
      }
    } catch (error) {
      this.logger.error(`Error in CategoryHandler.handle: ${error}`);
      await this.slackClient.sendText(
        userState.slackTeamId,
        userState.channel,
        t('somethingWrong', userState.language),
      );
    }
  }

  /**
   * Handles `categories` — list all categories with delete options.
   * Uses buttons (up to 20) since Slack has no sendList.
   * Falls back to plain text when there are no deletable custom categories.
   */
  async handleList(userState: SlackUserState): Promise<void> {
    try {
      const { channel, language } = userState;
      const teamId = userState.slackTeamId;

      const categories = await this.categoriesService.findAll(userState.accountId);

      if (categories.length === 0) {
        await this.slackClient.sendText(teamId, channel, t('categoryNone', language));
        return;
      }

      // Separate system and custom; only custom categories can be deleted
      const custom = categories.filter((c) => !c.isSystem);

      if (custom.length === 0) {
        // Only system categories — just list them as text
        const lines = categories.map((c) => {
          const emoji = c.type === 'expense' ? '💰' : '📈';
          return `${emoji} ${c.name}`;
        });
        await this.slackClient.sendText(
          teamId,
          channel,
          `*${t('categoriesTitle', language)}*\n\n${lines.join('\n')}`,
        );
        return;
      }

      if (custom.length > 20) {
        // Slack actions blocks allow up to 25 elements, but cap at 20 to be safe
        // and inform the user about the rest
        const first20 = custom.slice(0, 20);
        const rest = custom.slice(20);
        const restNames = rest.map((c) => `${c.type === 'expense' ? '💰' : '📈'} ${c.name}`).join(', ');

        await this.slackClient.sendButtons(
          teamId,
          channel,
          `*${t('categoriesTitle', language)}*\n${t('categoryTooMany', language, { count: String(custom.length) })}\n\n_Showing first 20. Also: ${restNames}_`,
          first20.map((c) => ({
            id: `cat_d:${c.id}`,
            title: `${c.type === 'expense' ? '💰' : '📈'} ${c.name}`.slice(0, 75),
          })),
        );
        return;
      }

      // Send buttons where each is a deletable custom category
      await this.slackClient.sendButtons(
        teamId,
        channel,
        `*${t('categoriesTitle', language)}* — ${t('categoryDeleteBtn', language)}`,
        custom.map((c) => ({
          id: `cat_d:${c.id}`,
          title: `${c.type === 'expense' ? '💰' : '📈'} ${c.name}`.slice(0, 75),
        })),
      );
    } catch (error) {
      this.logger.error(`Error in CategoryHandler.handleList: ${error}`);
      await this.slackClient.sendText(
        userState.slackTeamId,
        userState.channel,
        t('somethingWrong', userState.language),
      );
    }
  }

  /**
   * Handles the type-picker callback.
   * `shortId` is the Redis key suffix (not the raw category name).
   */
  async handleTypeCallback(
    type: 'expense' | 'income',
    shortId: string,
    userState: SlackUserState,
  ): Promise<void> {
    try {
      const { channel, language } = userState;
      const teamId = userState.slackTeamId;

      const name = await this.redis.get(`slack:cat:${shortId}`);
      if (!name) {
        await this.slackClient.sendText(
          teamId,
          channel,
          t('categoryExpired', language),
        );
        return;
      }

      await this.createCategory(type, name, userState);
      await this.redis.del(`slack:cat:${shortId}`);
    } catch (error) {
      this.logger.error(`Error in CategoryHandler.handleTypeCallback: ${error}`);
      await this.slackClient.sendText(
        userState.slackTeamId,
        userState.channel,
        t('somethingWrong', userState.language),
      );
    }
  }

  /**
   * Handles the delete callback from the categories list.
   */
  async handleDeleteCallback(categoryId: string, userState: SlackUserState): Promise<void> {
    try {
      const { channel, language } = userState;
      const teamId = userState.slackTeamId;

      await this.categoriesService.remove(userState.accountId, categoryId);
      await this.slackClient.sendText(teamId, channel, t('categoryDeleted', language));
    } catch (error) {
      this.logger.error(`Error in CategoryHandler.handleDeleteCallback: ${error}`);
      await this.slackClient.sendText(
        userState.slackTeamId,
        userState.channel,
        t('somethingWrong', userState.language),
      );
    }
  }

  // ---------------------------------------------------------------------------

  private async createCategory(
    type: 'expense' | 'income',
    name: string,
    userState: SlackUserState,
  ): Promise<void> {
    const { channel, language, accountId, userId } = userState;
    const teamId = userState.slackTeamId;
    try {
      const category = await this.categoriesService.create(accountId, userId, { name, type });
      const emoji = type === 'expense' ? '💰' : '📈';
      await this.slackClient.sendText(
        teamId,
        channel,
        t('categoryCreated', language, { emoji, name: category.name, type }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        await this.slackClient.sendText(
          teamId,
          channel,
          t('categoryAlreadyExists', language, { name, type }),
        );
        return;
      }
      throw error;
    }
  }
}
