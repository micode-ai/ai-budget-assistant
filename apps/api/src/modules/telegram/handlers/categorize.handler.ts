import { Injectable, Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { CategorizeBotService } from '../../ai/services/categorize-bot.service';
import { BotCategorizeStep } from '../../ai/utils/categorize-bot-plan.util';
import { CacheService } from '../../../common/cache/cache.service';
import { BotContext } from '../types';
import { t } from '../helpers/i18n';

const SESSION_TTL_SEC = 1800;
const sessionKey = (telegramUserId: string) => `telegram:catz:${telegramUserId}`;

interface CategorizeSession {
  accountId: string;
  steps: BotCategorizeStep[];
  cursor: number;
  totalCandidates: number;
  appliedGroups: number;
  appliedExpenses: number;
}

/**
 * `/categorize` — a bot-facing, sequential Yes/Skip/Stop variant of the app's
 * batched categorize-uncategorized review (see docs/wiki/features/
 * bot-categorize-command.md). All the actual work (the model call, the daily
 * ceiling, creating a category, bulk-updating expenses) is CategorizeBotService;
 * this class only owns Telegram presentation + the Redis-backed session, same
 * split as ChatHandler/PhotoHandler in this module.
 */
@Injectable()
export class CategorizeHandler {
  private readonly logger = new Logger(CategorizeHandler.name);

  constructor(
    private readonly categorizeBotService: CategorizeBotService,
    private readonly cache: CacheService,
  ) {}

  async handle(ctx: BotContext): Promise<void> {
    try {
      const state = ctx.userState;
      if (!state) {
        await ctx.reply(t('linkFirst', ctx.from?.language_code), { parse_mode: 'HTML' });
        return;
      }
      const { language: lang, accountRole, accountId, telegramUserId } = state;

      if (accountRole === 'viewer') {
        await ctx.reply(t('viewerRestricted', lang));
        return;
      }

      const plan = await this.categorizeBotService.buildPlan(accountId);
      if (plan.steps.length === 0) {
        await ctx.reply(t('categorizeNothingToDo', lang));
        return;
      }

      const session: CategorizeSession = {
        accountId,
        steps: plan.steps,
        cursor: 0,
        totalCandidates: plan.totalCandidates,
        appliedGroups: 0,
        appliedExpenses: 0,
      };
      await this.cache.set(sessionKey(telegramUserId), session, SESSION_TTL_SEC);

      let intro = t('categorizeIntro', lang, {
        groups: String(plan.steps.length),
        count: String(plan.totalCandidates),
      });
      if (plan.limitReached) intro += t('categorizeLimitNote', lang);
      await ctx.reply(intro, { parse_mode: 'HTML' });

      await this.presentStep(ctx, lang, session);
    } catch (error) {
      this.logger.error(`Error in /categorize: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  async handleYes(ctx: BotContext, stepIndex: number): Promise<void> {
    await this.handleStep(ctx, stepIndex, 'apply');
  }

  async handleNo(ctx: BotContext, stepIndex: number): Promise<void> {
    await this.handleStep(ctx, stepIndex, 'skip');
  }

  async handleStop(ctx: BotContext, stepIndex: number): Promise<void> {
    await this.handleStep(ctx, stepIndex, 'stop');
  }

  private async handleStep(
    ctx: BotContext,
    stepIndex: number,
    action: 'apply' | 'skip' | 'stop',
  ): Promise<void> {
    try {
      const state = ctx.userState;
      if (!state) {
        await ctx.answerCbQuery();
        return;
      }
      const { language: lang, telegramUserId, userId } = state;
      const key = sessionKey(telegramUserId);
      const session = await this.cache.get<CategorizeSession>(key);

      if (!session || session.cursor !== stepIndex) {
        await ctx.answerCbQuery();
        await ctx.reply(t('categorizeAlreadyHandled', lang));
        return;
      }

      await ctx.answerCbQuery();
      const step = session.steps[session.cursor];

      if (action === 'stop') {
        await this.finish(ctx, lang, session, 'categorizeStoppedSummary');
        await this.cache.del(key);
        return;
      }

      if (action === 'apply') {
        const { categoryName, count } = await this.categorizeBotService.applyStep(
          session.accountId,
          userId,
          step,
        );
        session.appliedGroups += 1;
        session.appliedExpenses += count;
        await ctx.reply(t('categorizeApplied', lang, { count: String(count), name: categoryName }), {
          parse_mode: 'HTML',
        });
      } else {
        await ctx.reply(t('categorizeSkipped', lang, { name: step.name }), { parse_mode: 'HTML' });
      }

      session.cursor += 1;
      if (session.cursor >= session.steps.length) {
        await this.finish(ctx, lang, session, 'categorizeDone');
        await this.cache.del(key);
        return;
      }

      await this.cache.set(key, session, SESSION_TTL_SEC);
      await this.presentStep(ctx, lang, session);
    } catch (error) {
      this.logger.error(`Error handling categorize step: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  private async presentStep(ctx: BotContext, lang: string | undefined, session: CategorizeSession): Promise<void> {
    const step = session.steps[session.cursor];
    const key = step.isNew ? 'categorizeGroupPromptNew' : 'categorizeGroupPromptExisting';
    const text = t(key, lang, { count: String(step.expenseIds.length), name: step.name });
    const n = session.cursor;

    await ctx.reply(
      text,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(t('categorizeYesBtn', lang), `catz_y:${n}`),
            Markup.button.callback(t('categorizeNoBtn', lang), `catz_n:${n}`),
            Markup.button.callback(t('categorizeStopBtn', lang), `catz_s:${n}`),
          ],
        ]),
      },
    );
  }

  private async finish(
    ctx: BotContext,
    lang: string | undefined,
    session: CategorizeSession,
    key: 'categorizeDone' | 'categorizeStoppedSummary',
  ): Promise<void> {
    const remaining = session.totalCandidates - session.appliedExpenses;
    await ctx.reply(
      t(key, lang, {
        appliedExpenses: String(session.appliedExpenses),
        appliedGroups: String(session.appliedGroups),
        remaining: String(Math.max(0, remaining)),
      }),
    );
  }
}
