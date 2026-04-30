import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { bestMatch } from '../utils/cosine';

const EMBED_MODEL = 'text-embedding-3-small';
const DEFAULT_THRESHOLD = 0.72;
const MAX_INPUT_LEN = 1000;

interface CategoryMatch {
  categoryId: string;
  categoryName: string;
  similarity: number;
}

interface TagMatch {
  tagId: string;
  tagName: string;
  similarity: number;
}

interface ProjectMatch {
  projectId: string;
  projectName: string;
  similarity: number;
}

@Injectable()
export class EmbeddingService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: EMBED_MODEL,
      input: text.trim().slice(0, MAX_INPUT_LEN),
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.openai.embeddings.create({
      model: EMBED_MODEL,
      input: texts.map((t) => t.trim().slice(0, MAX_INPUT_LEN)),
    });
    return response.data.map((d) => d.embedding);
  }

  async matchCategory(
    accountId: string,
    text: string,
    threshold = DEFAULT_THRESHOLD,
  ): Promise<CategoryMatch | null> {
    const queryVec = await this.embed(text);
    const categories = await this.prisma.category.findMany({
      where: { OR: [{ isSystem: true }, { accountId }], type: 'expense', isDeleted: false },
      select: { id: true, name: true, embedding: true },
    });

    const candidates = categories
      .filter((c): c is typeof c & { embedding: number[] } => Array.isArray(c.embedding) && (c.embedding as unknown[]).length > 0)
      .map((c) => ({ id: c.id, vector: c.embedding as number[], meta: c.name }));

    const match = bestMatch(queryVec, candidates, threshold);
    if (!match) return null;
    return { categoryId: match.id, categoryName: match.meta as string, similarity: match.similarity };
  }

  async matchTag(
    accountId: string,
    text: string,
    threshold = DEFAULT_THRESHOLD,
  ): Promise<TagMatch | null> {
    const queryVec = await this.embed(text);
    const tags = await this.prisma.tag.findMany({
      where: { accountId, isDeleted: false },
      select: { id: true, name: true, embedding: true },
    });
    const candidates = tags
      .filter((t): t is typeof t & { embedding: number[] } => Array.isArray(t.embedding) && (t.embedding as unknown[]).length > 0)
      .map((t) => ({ id: t.id, vector: t.embedding as number[], meta: t.name }));
    const match = bestMatch(queryVec, candidates, threshold);
    if (!match) return null;
    return { tagId: match.id, tagName: match.meta as string, similarity: match.similarity };
  }

  async matchProject(
    accountId: string,
    text: string,
    threshold = DEFAULT_THRESHOLD,
  ): Promise<ProjectMatch | null> {
    const queryVec = await this.embed(text);
    const projects = await this.prisma.project.findMany({
      where: { accountId, isDeleted: false, isArchived: false },
      select: { id: true, name: true, embedding: true },
    });
    const candidates = projects
      .filter((p): p is typeof p & { embedding: number[] } => Array.isArray(p.embedding) && (p.embedding as unknown[]).length > 0)
      .map((p) => ({ id: p.id, vector: p.embedding as number[], meta: p.name }));
    const match = bestMatch(queryVec, candidates, threshold);
    if (!match) return null;
    return { projectId: match.id, projectName: match.meta as string, similarity: match.similarity };
  }

  /**
   * Compute and persist an embedding for a single row. Fire-and-forget; logs
   * failures but does not throw, so a failed embed never blocks the user's
   * create/update flow.
   */
  async embedAndStore(table: 'category' | 'tag' | 'project', id: string, text: string): Promise<void> {
    try {
      const vector = await this.embed(text);
      if (table === 'category') {
        await this.prisma.category.update({ where: { id }, data: { embedding: vector } });
      } else if (table === 'tag') {
        await this.prisma.tag.update({ where: { id }, data: { embedding: vector } });
      } else {
        await this.prisma.project.update({ where: { id }, data: { embedding: vector } });
      }
    } catch (err) {
      this.logger.warn(`embed ${table}:${id} failed: ${(err as Error).message}`);
    }
  }
}
