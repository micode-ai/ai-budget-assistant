import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ProjectSuggestionService {
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async suggestProject(
    accountId: string,
    expense: { description: string; date: string; locationName?: string },
  ): Promise<{ projectId?: string; projectName?: string; confidence: number } | null> {
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
            project.projectExpenses.map(pe => pe.expense.description || ''),
          );
          if (isRelated) {
            return { projectId: project.id, projectName: project.name, confidence: 0.8 };
          }
        }
      }
    }

    // 2. Use AI to match
    const projectDescriptions = activeProjects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      recentExpenses: p.projectExpenses.map(pe => pe.expense.description).filter(Boolean).slice(0, 5),
    }));

    try {
      const prompt = `Given this expense: "${expense.description}"${expense.locationName ? ` at "${expense.locationName}"` : ''}

Active projects:
${projectDescriptions.map(p => `- "${p.name}"${p.description ? `: ${p.description}` : ''} (recent: ${p.recentExpenses.join(', ') || 'none'})`).join('\n')}

Does this expense belong to any of these projects? Return JSON: { "projectId": "id or null", "projectName": "name or null", "confidence": 0.0-1.0 }
Only suggest if confidence >= 0.6.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 100,
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      if (result.confidence >= 0.6 && result.projectId) {
        return {
          projectId: result.projectId,
          projectName: result.projectName,
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
