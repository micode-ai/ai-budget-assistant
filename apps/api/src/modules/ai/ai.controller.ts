import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AccountRoleGuard, RequireRole, ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AiUsageGuard } from '../subscriptions/guards/ai-usage.guard';
import { TrackAiUsage } from '../subscriptions/decorators/track-ai-usage.decorator';
import { AuthenticatedRequest } from '../../common/types';
import { WhisperService } from './services/whisper.service';
import { ChatService } from './services/chat.service';
import { CategorizationService } from './services/categorization.service';
import { OcrService } from './services/ocr.service';
import { TagSuggestionService } from './services/tag-suggestion.service';
import { ProjectSuggestionService } from './services/project-suggestion.service';
import { SplitSuggestionService } from './services/split-suggestion.service';
import { GoalPlannerService } from './services/goal-planner.service';
import { ScanReceiptRequestSchema } from './utils/sanitize';

@Controller('ai')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class AiController {
  constructor(
    private readonly whisperService: WhisperService,
    private readonly chatService: ChatService,
    private readonly categorizationService: CategorizationService,
    private readonly ocrService: OcrService,
    private readonly tagSuggestionService: TagSuggestionService,
    private readonly projectSuggestionService: ProjectSuggestionService,
    private readonly splitSuggestionService: SplitSuggestionService,
    private readonly goalPlannerService: GoalPlannerService,
  ) {}

  @Post('transcribe')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('voice', 1.0)
  async transcribe(
    @Body() body: { audio: string; language?: string },
  ) {
    const buffer = Buffer.from(body.audio, 'base64');
    return this.whisperService.transcribe(buffer, body.language);
  }

  @Post('parse-expense')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('parse', 1.0)
  async parseExpense(
    @Req() req: AuthenticatedRequest,
    @Body() body: { text: string },
  ) {
    return this.categorizationService.parseExpenseFromText(body.text, req.user.id, req.accountId);
  }

  @Post('parse-income')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('parse', 1.0)
  async parseIncome(
    @Req() req: AuthenticatedRequest,
    @Body() body: { text: string },
  ) {
    return this.categorizationService.parseIncomeFromText(body.text, req.user.id, req.accountId);
  }

  @Post('categorize')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('categorization', 0.5)
  async categorize(
    @Req() req: AuthenticatedRequest,
    @Body() body: { description: string },
  ) {
    return this.categorizationService.categorize(body.description, req.user.id, req.accountId);
  }

  @Post('chat')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('chat', 1.0)
  async chat(
    @Req() req: AuthenticatedRequest,
    @Body() body: { message: string; conversationId?: string; mentions?: { userId: string }[]; isShared?: boolean },
  ) {
    return this.chatService.chat(
      req.user.id,
      body.message,
      body.conversationId,
      req.accountId,
      undefined,
      req.accountRole,
      (req.user as { name?: string }).name ?? null,
      body.mentions,
      body.isShared,
    );
  }

  @Post('chat/confirm')
  @UseGuards(AccountRoleGuard, AiUsageGuard)
  @RequireRole('editor')
  @TrackAiUsage('chat', 0.5)
  async confirmAction(
    @Req() req: AuthenticatedRequest,
    @Body() body: { conversationId: string; actionId: string },
  ) {
    return this.chatService.confirmAction(req.user.id, body.conversationId, body.actionId, req.accountId);
  }

  @Post('chat/reject')
  async rejectAction(
    @Req() req: AuthenticatedRequest,
    @Body() body: { conversationId: string; actionId: string; reason?: string },
  ) {
    return this.chatService.rejectAction(req.user.id, body.conversationId, body.actionId, body.reason, req.accountId);
  }

  @Get('chat/conversations')
  async getConversations(@Req() req: AuthenticatedRequest) {
    return this.chatService.getConversations(req.user.id, req.accountId);
  }

  @Get('chat/conversations/:id/messages')
  async getConversationMessages(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.chatService.getConversationMessages(req.user.id, id, req.accountId);
  }

  @Get('chat/conversations/:id/poll')
  async pollConversation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('since') since?: string,
  ) {
    return this.chatService.pollMessages(req.user.id, id, req.accountId, since);
  }

  @Patch('chat/conversations/:id/shared')
  async setConversationShared(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { isShared: boolean },
  ) {
    return this.chatService.setConversationShared(req.user.id, id, req.accountId, req.accountRole, body.isShared);
  }

  @Post('scan-receipt')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('ocr', 2.0)
  async scanReceipt(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const { imageBase64, userPrompt, mimeType } = ScanReceiptRequestSchema.parse(body);
    if (mimeType === 'application/pdf') {
      return this.ocrService.parseReceiptPdf(
        imageBase64,
        req.user.id,
        req.accountId,
        userPrompt,
      );
    }

    return this.ocrService.parseReceipt(imageBase64, req.user.id, req.accountId, userPrompt);
  }

  @Post('extract-text')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('ocr', 2.0)
  async extractText(@Req() req: AuthenticatedRequest, @Body() body: { imageBase64: string }) {
    return { text: await this.ocrService.extractTextFromImage(body.imageBase64, req.user.id) };
  }

  @Get('suggest-category')
  async suggestCategory(
    @Req() req: AuthenticatedRequest,
    @Query('description') description: string,
  ) {
    const historySuggestion = await this.categorizationService.suggestFromHistory(
      req.accountId,
      description,
    );

    if (historySuggestion) {
      return {
        categoryId: historySuggestion.categoryId,
        categoryName: historySuggestion.categoryName,
        confidence: historySuggestion.confidence,
        source: 'history' as const,
      };
    }

    // Fallback to AI
    const aiResult = await this.categorizationService.categorize(
      description,
      req.user.id,
      req.accountId,
    );

    return {
      categoryId: aiResult.categoryId,
      categoryName: aiResult.categoryName,
      confidence: aiResult.confidence,
      source: 'ai' as const,
    };
  }

  @Get('suggest-tags')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('tag_suggestion', 0.5)
  async suggestTags(
    @Req() req: AuthenticatedRequest,
    @Query('description') description: string,
    @Query('merchant') merchant?: string,
  ) {
    return this.tagSuggestionService.suggestTags(
      req.accountId,
      description,
      merchant,
      req.user.id,
    );
  }

  @Post('suggest-project')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('project_suggestion', 0.5)
  async suggestProject(
    @Req() req: AuthenticatedRequest,
    @Body() body: { description: string; date: string; locationName?: string },
  ) {
    return this.projectSuggestionService.suggestProject(req.accountId, body, req.user.id);
  }

  @Post('suggest-splits')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('split_suggestion', 1.0)
  async suggestSplits(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      id: string;
      description: string;
      amount: number;
      items?: Array<{ description: string; totalPrice: number }>;
    },
  ) {
    return this.splitSuggestionService.suggestSplits(req.accountId, body, req.user.id);
  }

  // ── Savings Goals ──

  @Post('goals')
  @UseGuards(new ViewerBlockGuard(), AiUsageGuard)
  @TrackAiUsage('goal_plan', 2.0)
  async createGoal(
    @Req() req: AuthenticatedRequest,
    @Body() body: { name: string; targetAmount: number; currencyCode: string; deadline: string },
  ) {
    return this.goalPlannerService.createGoal(req.accountId, req.user.id, body);
  }

  @Get('goals')
  async listGoals(@Req() req: AuthenticatedRequest) {
    return this.goalPlannerService.listGoals(req.accountId);
  }

  @Get('goals/:id')
  async getGoal(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.goalPlannerService.getGoal(req.accountId, id);
  }

  @Get('goals/:id/progress')
  async getGoalProgress(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.goalPlannerService.getProgress(req.accountId, id);
  }

  @Patch('goals/:id')
  @UseGuards(new ViewerBlockGuard())
  async updateGoal(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string; targetAmount?: number; deadline?: string; currentAmount?: number; status?: string },
  ) {
    return this.goalPlannerService.updateGoal(req.accountId, id, body, { userId: req.user.id });
  }

  @Delete('goals/:id')
  @UseGuards(new ViewerBlockGuard())
  async deleteGoal(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.goalPlannerService.deleteGoal(req.accountId, id);
  }

  @Get('goals/:id/contributions')
  async getGoalContributions(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.goalPlannerService.getContributions(req.accountId, id);
  }

  @Post('goals/:id/regenerate-plan')
  @UseGuards(new ViewerBlockGuard(), AiUsageGuard)
  @TrackAiUsage('goal_plan', 2.0)
  async regenerateGoalPlan(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.goalPlannerService.generatePlan(req.accountId, id, req.user.id);
  }
}
