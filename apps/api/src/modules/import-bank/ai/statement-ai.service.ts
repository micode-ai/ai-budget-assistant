import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { buildMappingPrompt, buildExtractionPrompt } from './statement-ai.prompt';
import {
  validateMappingResponse,
  validateExtractedRows,
  type InferredMapping,
  type ExtractedRow,
} from './statement-ai.validator';

export const INFERENCE_TIMEOUT_MS = 20_000;
export const EXTRACTION_TIMEOUT_MS = 30_000;

const MODEL = 'gpt-4o-mini';

/**
 * LLM access for statement import. Owns its own OpenAI client, following the
 * convention of every other AI service in this repo (ocr, chat, whisper,
 * categorization, embedding, …) — there is no shared provider to inject, and
 * importing AiModule here would drag in its 11 module dependencies.
 *
 * Every public method is fail-silent: import must degrade to the manual
 * mapper, never to an error page.
 */
@Injectable()
export class StatementAiService {
  private readonly logger = new Logger(StatementAiService.name);
  private readonly openai: OpenAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  isEnabled(): boolean {
    return this.openai !== null;
  }

  async inferMapping(headers: string[], sampleRows: string[][]): Promise<InferredMapping | null> {
    const content = await this.complete(
      buildMappingPrompt(headers, sampleRows),
      INFERENCE_TIMEOUT_MS,
    );
    if (!content) return null;
    // The validator lives in a different file; a throw there (today it has
    // none, but this must not depend on that staying true) must degrade the
    // same way an API failure already does, not escape as a rejection.
    try {
      return validateMappingResponse(content, headers);
    } catch (e) {
      this.logger.warn(`Statement mapping validation failed: ${this.describeError(e)}`);
      return null;
    }
  }

  async extractRows(pageTexts: string[]): Promise<ExtractedRow[]> {
    const out: ExtractedRow[] = [];
    for (const pageText of pageTexts) {
      if (!pageText.trim()) continue;
      const content = await this.complete(buildExtractionPrompt(pageText), EXTRACTION_TIMEOUT_MS);
      // A failed page must not discard the pages that worked; completeness is
      // caught downstream by balance reconciliation.
      if (!content) continue;
      try {
        out.push(...validateExtractedRows(content));
      } catch (e) {
        // A throw here must not escape the loop — that would discard every
        // row already collected from earlier successful pages, which is
        // worse than a single page failing outright.
        this.logger.warn(`Statement row validation failed: ${this.describeError(e)}`);
      }
    }
    return out;
  }

  private async complete(prompt: string, timeoutMs: number): Promise<string | null> {
    if (!this.openai) return null;
    try {
      const response = await this.openai.chat.completions.create(
        {
          model: MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          response_format: { type: 'json_object' },
        },
        { timeout: timeoutMs },
      );
      return response.choices?.[0]?.message?.content ?? null;
    } catch (e) {
      this.logger.warn(`Statement AI call failed: ${this.describeError(e)}`);
      return null;
    }
  }

  /** Preserve the stack trace for Error instances instead of stringifying it away. */
  private describeError(e: unknown): string {
    return e instanceof Error ? (e.stack ?? e.message) : String(e);
  }
}
