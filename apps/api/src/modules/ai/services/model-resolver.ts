export const AI_MODEL_MAP: Record<string, string> = {
  fast: 'gpt-4o-mini',
  balanced: 'gpt-4o',
  quality: 'gpt-4.1',
};

export const AI_MAX_TOKENS_MAP: Record<string, number> = {
  fast: 1500,
  balanced: 2000,
  quality: 3000,
};

export const AI_COST_MULTIPLIER: Record<string, number> = {
  fast: 0.75,
  balanced: 1.0,
  quality: 1.5,
};

export function resolveAiModel(pref?: string): { model: string; maxTokens: number } {
  const key = pref && pref in AI_MODEL_MAP ? pref : 'balanced';
  return {
    model: AI_MODEL_MAP[key],
    maxTokens: AI_MAX_TOKENS_MAP[key],
  };
}

export function getAiCostMultiplier(pref?: string): number {
  return AI_COST_MULTIPLIER[pref || 'balanced'] ?? 1.0;
}

/**
 * Model used for low-reasoning tasks where output is short, structured, and
 * largely classification: confirmation rendering, single-field categorization,
 * tag/project picking, split assignment. Independent of user's aiModel
 * preference — that preference is reserved for the main chat reasoning turn.
 */
export const CHEAP_MODEL = 'gpt-4o-mini';

export function resolveCheapModel(): string {
  return CHEAP_MODEL;
}
