import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { CategorizeBotService } from '../../ai/services/categorize-bot.service';
import { BotCategorizeStep } from '../../ai/utils/categorize-bot-plan.util';
import { SlackClientService } from '../slack-client.service';
import { SlackUserState, SLACK_REDIS } from '../types';
import { t } from '../helpers/i18n';

const SESSION_TTL_SEC = 1800;
const sessionKey = (slackUserId: string) => `slack:catz:${slackUserId}`;

interface CategorizeSession {
  accountId: string;
  steps: BotCategorizeStep[];
  cursor: number;
  totalCandidates: number;
  appliedGroups: number;
  appliedExpenses: number;
}

/**
 * `categorize` — bot-facing sequential Yes/Skip/Stop variant of the app's
 * batched categorize-uncategorized review. Mirrors the Telegram/WhatsApp
 * CategorizeHandler; presentation-only here, all business logic lives in
 * CategorizeBotService (see docs/wiki/features/bot-categorize-command.md).
 */
@Injectable()
export class CategorizeHandler {
  private readonly logger = new Logger(CategorizeHandler.name);

  constructor(
    private readonly categorizeBotService: CategorizeBotService,
    private readonly slackClient: SlackClientService,
    @Inject(SLACK_REDIS) private readonly redis: Redis,
  ) {}

  async handle(userState: SlackUserState): Promise<void> {
    try {
      const { channel, language: lang, accountRole, accountId } = userState;
      const teamId = userState.slackTeamId;

      if (accountRole === 'viewer') {
        await this.slackClient.sendText(teamId, channel, t('viewerRestricted', lang));
        return;
      }

      const plan = await this.categorizeBotService.buildPlan(accountId);
      if (plan.steps.length === 0) {
        await this.slackClient.sendText(teamId, channel, t('categorizeNothingToDo', lang));
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
      await this.redis.set(sessionKey(userState.slackUserId), JSON.stringify(session), 'EX', SESSION_TTL_SEC);

      let intro = t('categorizeIntro', lang, {
        groups: String(plan.steps.length),
        count: String(plan.totalCandidates),
      });
      if (plan.limitReached) intro += t('categorizeLimitNote', lang);
      await this.slackClient.sendText(teamId, channel, intro);

      await this.presentStep(userState, session);
    } catch (error) {
      this.logger.error(`Error in categorize command: ${error}`);
      await this.slackClient.sendText(
        userState.slackTeamId,
        userState.channel,
        t('somethingWrong', userState.language),
      );
    }
  }

  async handleYes(stepIndex: number, userState: SlackUserState): Promise<void> {
    await this.handleStep(stepIndex, 'apply', userState);
  }

  async handleNo(stepIndex: number, userState: SlackUserState): Promise<void> {
    await this.handleStep(stepIndex, 'skip', userState);
  }

  async handleStop(stepIndex: number, userState: SlackUserState): Promise<void> {
    await this.handleStep(stepIndex, 'stop', userState);
  }

  private async handleStep(
    stepIndex: number,
    action: 'apply' | 'skip' | 'stop',
    userState: SlackUserState,
  ): Promise<void> {
    try {
      const { channel, language: lang, userId } = userState;
      const teamId = userState.slackTeamId;
      const key = sessionKey(userState.slackUserId);
      const raw = await this.redis.get(key);
      const session = raw ? (JSON.parse(raw) as CategorizeSession) : null;

      if (!session || session.cursor !== stepIndex) {
        await this.slackClient.sendText(teamId, channel, t('categorizeAlreadyHandled', lang));
        return;
      }

      const step = session.steps[session.cursor];

      if (action === 'stop') {
        await this.finish(userState, session, 'categorizeStoppedSummary');
        await this.redis.del(key);
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
        await this.slackClient.sendText(
          teamId,
          channel,
          t('categorizeApplied', lang, { count: String(count), name: categoryName }),
        );
      } else {
        await this.slackClient.sendText(teamId, channel, t('categorizeSkipped', lang, { name: step.name }));
      }

      session.cursor += 1;
      if (session.cursor >= session.steps.length) {
        await this.finish(userState, session, 'categorizeDone');
        await this.redis.del(key);
        return;
      }

      await this.redis.set(key, JSON.stringify(session), 'EX', SESSION_TTL_SEC);
      await this.presentStep(userState, session);
    } catch (error) {
      this.logger.error(`Error handling categorize step: ${error}`);
      await this.slackClient.sendText(
        userState.slackTeamId,
        userState.channel,
        t('somethingWrong', userState.language),
      );
    }
  }

  private async presentStep(userState: SlackUserState, session: CategorizeSession): Promise<void> {
    const { channel, language: lang } = userState;
    const teamId = userState.slackTeamId;
    const step = session.steps[session.cursor];
    const key = step.isNew ? 'categorizeGroupPromptNew' : 'categorizeGroupPromptExisting';
    const text = t(key, lang, { count: String(step.expenseIds.length), name: step.name });
    const n = session.cursor;

    await this.slackClient.sendButtons(teamId, channel, text, [
      { id: `catz_y:${n}`, title: t('categorizeYesBtn', lang) },
      { id: `catz_n:${n}`, title: t('categorizeNoBtn', lang) },
      { id: `catz_s:${n}`, title: t('categorizeStopBtn', lang) },
    ]);
  }

  private async finish(
    userState: SlackUserState,
    session: CategorizeSession,
    key: 'categorizeDone' | 'categorizeStoppedSummary',
  ): Promise<void> {
    const remaining = session.totalCandidates - session.appliedExpenses;
    await this.slackClient.sendText(
      userState.slackTeamId,
      userState.channel,
      t(key, userState.language, {
        appliedExpenses: String(session.appliedExpenses),
        appliedGroups: String(session.appliedGroups),
        remaining: String(Math.max(0, remaining)),
      }),
    );
  }
}
