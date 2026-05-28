import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import { CategoriesService } from '../../categories/categories.service';
import { WhatsAppClientService } from '../whatsapp-client.service';
import { WhatsAppUserState, WA_REDIS } from '../types';
import { t } from '../helpers/i18n';

@Injectable()
export class CategoryHandler {
  private readonly logger = new Logger(CategoryHandler.name);

  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly whatsappClient: WhatsAppClientService,
    @Inject(WA_REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Handles `category [type] <name>`.
   * - If type (expense/income) is present → create immediately.
   * - If only name → stash in Redis and send a 2-button type picker.
   * - If empty → send usage hint.
   */
  async handle(args: string, userState: WhatsAppUserState): Promise<void> {
    try {
      const { waPhoneNumber, language } = userState;

      if (userState.accountRole === 'viewer') {
        await this.whatsappClient.sendText(waPhoneNumber, t('viewerRestricted', language));
        return;
      }

      if (!args || !args.trim()) {
        await this.whatsappClient.sendText(
          waPhoneNumber,
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
          await this.whatsappClient.sendText(
            waPhoneNumber,
            t('categoryNameRequired', language),
          );
          return;
        }
      } else {
        name = args.trim();
      }

      if (name.length > 50) {
        await this.whatsappClient.sendText(
          waPhoneNumber,
          t('categoryNameTooLong', language),
        );
        return;
      }

      if (type) {
        await this.createCategory(type, name, userState);
      } else {
        // Stash name in Redis with a short ID to avoid encoding issues in callback IDs
        const shortId = randomUUID().slice(0, 8);
        await this.redis.set(`wa:cat:${shortId}`, name, 'EX', 600);

        await this.whatsappClient.sendButtons(
          waPhoneNumber,
          t('categoryChooseType', language, { name }),
          [
            { id: `cat_e--${shortId}`, title: t('categoryExpenseBtn', language) },
            { id: `cat_i--${shortId}`, title: t('categoryIncomeBtn', language) },
          ],
        );
      }
    } catch (error) {
      this.logger.error(`Error in CategoryHandler.handle: ${error}`);
      await this.whatsappClient.sendText(
        userState.waPhoneNumber,
        t('somethingWrong', userState.language),
      );
    }
  }

  /**
   * Handles `categories` — list all categories with delete options.
   * Degrades gracefully when > 10 categories (WhatsApp list limit).
   */
  async handleList(userState: WhatsAppUserState): Promise<void> {
    try {
      const { waPhoneNumber, language } = userState;

      const categories = await this.categoriesService.findAll(userState.accountId);

      if (categories.length === 0) {
        await this.whatsappClient.sendText(waPhoneNumber, t('categoryNone', language));
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
        await this.whatsappClient.sendText(
          waPhoneNumber,
          `*${t('categoriesTitle', language)}*\n\n${lines.join('\n')}`,
        );
        return;
      }

      if (custom.length > 10) {
        // WhatsApp list-message row limit is 10 — fall back to plain text
        await this.whatsappClient.sendText(
          waPhoneNumber,
          t('categoryTooMany', language, { count: String(custom.length) }),
        );
        return;
      }

      // Send an interactive list where each row is a deletable custom category
      await this.whatsappClient.sendList(
        waPhoneNumber,
        t('categoriesTitle', language),
        t('categoryDeleteBtn', language),
        custom.map((c) => ({
          id: `cat_d--${c.id}`,
          title: `${c.type === 'expense' ? '💰' : '📈'} ${c.name}`.slice(0, 24),
          description: c.type === 'expense'
            ? t('categoryTypeExpense', language)
            : t('categoryTypeIncome', language),
        })),
      );
    } catch (error) {
      this.logger.error(`Error in CategoryHandler.handleList: ${error}`);
      await this.whatsappClient.sendText(
        userState.waPhoneNumber,
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
    userState: WhatsAppUserState,
  ): Promise<void> {
    try {
      const { waPhoneNumber, language } = userState;

      const name = await this.redis.get(`wa:cat:${shortId}`);
      if (!name) {
        await this.whatsappClient.sendText(
          waPhoneNumber,
          t('categoryExpired', language),
        );
        return;
      }

      await this.createCategory(type, name, userState);
      await this.redis.del(`wa:cat:${shortId}`);
    } catch (error) {
      this.logger.error(`Error in CategoryHandler.handleTypeCallback: ${error}`);
      await this.whatsappClient.sendText(
        userState.waPhoneNumber,
        t('somethingWrong', userState.language),
      );
    }
  }

  /**
   * Handles the delete callback from the categories list.
   */
  async handleDeleteCallback(categoryId: string, userState: WhatsAppUserState): Promise<void> {
    try {
      const { waPhoneNumber, language } = userState;

      await this.categoriesService.remove(userState.accountId, categoryId);
      await this.whatsappClient.sendText(waPhoneNumber, t('categoryDeleted', language));
    } catch (error) {
      this.logger.error(`Error in CategoryHandler.handleDeleteCallback: ${error}`);
      await this.whatsappClient.sendText(
        userState.waPhoneNumber,
        t('somethingWrong', userState.language),
      );
    }
  }

  // ---------------------------------------------------------------------------

  private async createCategory(
    type: 'expense' | 'income',
    name: string,
    userState: WhatsAppUserState,
  ): Promise<void> {
    const { waPhoneNumber, language, accountId, userId } = userState;
    try {
      const category = await this.categoriesService.create(accountId, userId, { name, type });
      const emoji = type === 'expense' ? '💰' : '📈';
      await this.whatsappClient.sendText(
        waPhoneNumber,
        t('categoryCreated', language, { emoji, name: category.name, type }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        await this.whatsappClient.sendText(
          waPhoneNumber,
          t('categoryAlreadyExists', language, { name, type }),
        );
        return;
      }
      throw error;
    }
  }
}
