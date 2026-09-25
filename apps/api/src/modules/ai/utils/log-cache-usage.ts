import type OpenAI from 'openai';
import type { Logger } from '@nestjs/common';

/**
 * Logs the OpenAI prompt-cache hit ratio for a single completion call. Pure
 * logging side effect, no return value — shared between ChatService and
 * ChatActionLifecycleService so the two OpenAI-calling services log this in
 * the exact same format.
 */
export function logCacheUsage(logger: Logger, label: string, usage: OpenAI.Completions.CompletionUsage | undefined): void {
  if (!usage) return;
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const total = usage.prompt_tokens ?? 0;
  const ratio = total > 0 ? (cached / total).toFixed(2) : '0.00';
  logger.log(`[ai/${label}] prompt_tokens=${total} cached_tokens=${cached} hit_ratio=${ratio}`);
}
