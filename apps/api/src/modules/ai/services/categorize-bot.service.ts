import { Injectable } from '@nestjs/common';
import { CategorizeSuggestionsService } from './categorize-suggestions.service';
import { CategoriesService } from '../../categories/categories.service';
import { ExpenseBulkService } from '../../expenses/expense-bulk.service';
import { BotCategorizeStep, buildBotSteps } from '../utils/categorize-bot-plan.util';

export interface BotCategorizePlan {
  steps: BotCategorizeStep[];
  /** Sum of every step's expenseIds.length — the app-review's "candidate" count. */
  totalCandidates: number;
  /** response.unassigned.length — never touched by this feature, only reported. */
  unassignedCount: number;
  limitReached: boolean;
}

/**
 * The one place all three bots (Telegram/WhatsApp/Slack) call into for the
 * `/categorize` command — mirrors how every bot's ChatHandler calls the same
 * shared ChatService rather than tripling business logic. Presentation
 * (buttons, message text, session storage) stays in each bot's own
 * CategorizeHandler; this service only knows about accounts and categories.
 */
@Injectable()
export class CategorizeBotService {
  constructor(
    private readonly categorizeSuggestions: CategorizeSuggestionsService,
    private readonly categoriesService: CategoriesService,
    private readonly expenseBulk: ExpenseBulkService,
  ) {}

  async buildPlan(accountId: string): Promise<BotCategorizePlan> {
    const response = await this.categorizeSuggestions.suggest(accountId);
    const categories = await this.categoriesService.findAll(accountId);
    const namesById = new Map<string, string>(categories.map((c: { id: string; name: string }) => [c.id, c.name]));

    const steps = buildBotSteps(response, namesById);
    return {
      steps,
      totalCandidates: steps.reduce((sum, s) => sum + s.expenseIds.length, 0),
      unassignedCount: response.unassigned.length,
      limitReached: response.limitReached,
    };
  }

  /**
   * Applies one step: creates the category first when it's a new proposal,
   * then bulk-updates the step's expenses. Always uses the category row's
   * OWN id/name from the create call for a new step (never `step.categoryId`,
   * which is null there) — the resolved-PK rule ([[client-id-resolution]]
   * class of bug, ABA-419): CategoriesService.create may return an existing
   * row (idempotent on name+type) with different casing than requested.
   */
  async applyStep(
    accountId: string,
    userId: string,
    step: BotCategorizeStep,
  ): Promise<{ categoryName: string; count: number }> {
    let categoryId = step.categoryId;
    let categoryName = step.name;

    if (step.isNew) {
      const category = await this.categoriesService.create(accountId, userId, {
        name: step.name,
        type: 'expense',
      });
      categoryId = category.id;
      categoryName = category.name;
    }

    const result = await this.expenseBulk.bulkUpdate(accountId, {
      ids: step.expenseIds,
      categoryId: categoryId as string,
    });

    return { categoryName, count: result.updated };
  }
}
