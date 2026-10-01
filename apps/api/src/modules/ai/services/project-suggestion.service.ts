import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { resolveCheapModel } from './model-resolver';
import { sanitizeForPrompt } from '../utils/sanitize';
import { EmbeddingService } from './embedding.service';
import { logCacheUsage } from '../utils/log-cache-usage';

const PROJECT_MATCH_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'project_match',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectIndex', 'confidence'],
      properties: {
        projectIndex: { type: ['integer', 'null'] },
        confidence: { type: 'number' },
      },
    },
  },
};

/**
 * Maps the model's `projectIndex` back to a position in the numbered list.
 * Anything that is not an integer inside `[0, count)` is rejected (null).
 */
export function resolveProjectIndex(raw: unknown, count: number): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  if (raw < 0 || raw >= count) return null;
  return raw;
}

@Injectable()
export class ProjectSuggestionService {
  private readonly logger = new Logger(ProjectSuggestionService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async suggestProject(
    accountId: string,
    expense: { description: string | null; date: string; locationName?: string },
    userId?: string,
  ): Promise<{ projectId?: string; projectName?: string; confidence: number } | null> {
    // Cannot suggest projects without a description (e.g. encrypted under E2EE)
    if (!expense.description) return null;

    // Get active (non-archived) projects
    const activeProjects = await this.prisma.project.findMany({
      where: {
        accountId,
        isDeleted: false,
        isArchived: false,
      },
      include: {
        projectExpenses: {
          where: { isDeleted: false },
          include: { expense: { select: { description: true } } },
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (activeProjects.length === 0) return null;

    // 1. Check date range match
    const expenseDate = new Date(expense.date);
    for (const project of activeProjects) {
      if (project.startDate && project.endDate) {
        if (expenseDate >= project.startDate && expenseDate <= project.endDate) {
          // Date fits — check if description is related
          const isRelated = await this.isExpenseRelatedToProject(
            expense.description,
            project.name,
            project.projectExpenses.map((pe: { expense: { description: string | null } }) => pe.expense.description || ''),
          );
          if (isRelated) {
            return { projectId: project.id, projectName: project.name, confidence: 0.8 };
          }
        }
      }
    }

    // 2. Try semantic similarity via embeddings (cheap, no LLM)
    try {
      const embeddingMatch = await this.embeddingService.matchProject(accountId, expense.description);
      if (embeddingMatch) {
        return {
          projectId: embeddingMatch.projectId,
          projectName: embeddingMatch.projectName,
          confidence: embeddingMatch.similarity,
        };
      }
    } catch {
      // Embedding lookup failed — fall through to LLM.
    }

    // 3. Use AI to match
    const projectDescriptions = activeProjects.map((p: typeof activeProjects[number]) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      recentExpenses: p.projectExpenses.map((pe: { expense: { description: string | null } }) => pe.expense.description).filter(Boolean).slice(0, 5),
    }));

    // Cheap model: project matching is short structured classification.
    void userId;
    const aiModel = resolveCheapModel();

    try {
      const safeExpenseDesc = sanitizeForPrompt(expense.description, 200);
      const safeLoc = expense.locationName ? sanitizeForPrompt(expense.locationName, 100) : null;
      const safeProjectData = projectDescriptions.map((p: { id: string; name: string; description: string | null; recentExpenses: (string | null)[] }) => ({
        name: sanitizeForPrompt(p.name, 100),
        description: p.description ? sanitizeForPrompt(p.description, 200) : null,
        recentExpenses: p.recentExpenses
          .map((d: string | null) => d ? sanitizeForPrompt(d, 80) : '')
          .filter(Boolean)
          .slice(0, 5),
      }));

      const prompt = `Given this expense: "${safeExpenseDesc}"${safeLoc ? ` at "${safeLoc}"` : ''}

Active projects (numbered from 0):
${safeProjectData.map((p, i) => `${i}: ${JSON.stringify(p)}`).join('\n')}

Does this expense belong to any of these projects? Answer with "projectIndex" (the integer number of the project, or null if none) and "confidence" (0.0-1.0).
Only suggest if confidence >= 0.6.`;

      const response = await this.openai.chat.completions.create({
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: PROJECT_MATCH_FORMAT,
        max_tokens: 100,
      });
      logCacheUsage(this.logger, 'project-suggestion', response.usage);

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      const idx = resolveProjectIndex(result.projectIndex, activeProjects.length);
      if (idx !== null && typeof result.confidence === 'number' && result.confidence >= 0.6) {
        return {
          projectId: activeProjects[idx].id,
          projectName: activeProjects[idx].name,
          confidence: result.confidence,
        };
      }
    } catch {
      // AI failed, return null
    }

    return null;
  }

  private async isExpenseRelatedToProject(
    expenseDescription: string,
    projectName: string,
    existingDescriptions: string[],
  ): Promise<boolean> {
    const desc = expenseDescription.toLowerCase();
    const projName = projectName.toLowerCase();

    // Simple keyword matching
    const projWords = projName.split(/\s+/).filter(w => w.length > 2);
    if (projWords.some(word => desc.includes(word))) return true;

    // Check similarity with existing project expenses
    for (const existing of existingDescriptions) {
      const existingWords = existing.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const descWords = desc.split(/\s+/).filter(w => w.length > 2);
      const overlap = descWords.filter(w => existingWords.includes(w));
      if (overlap.length >= 2) return true;
    }

    return false;
  }
}
