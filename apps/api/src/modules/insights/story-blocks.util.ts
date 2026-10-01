/**
 * Strict-mode JSON schema for Spending Story output, plus null stripping.
 *
 * Story block `content` varies by block type. Strict structured outputs need a
 * fixed shape, so `content` is the union of every field a block can carry, each
 * nullable; `stripNulls` then removes the unused ones so the stored/returned
 * blocks keep the original sparse shape (`StoryBlock` in shared-types).
 */

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, 'null'], ...extra });

export const STORY_BLOCK_TYPES = ['hero_metric', 'narrative_text', 'chart', 'comparison', 'callout', 'achievement'] as const;
export const STORY_TONES = ['positive', 'neutral', 'warning', 'celebration'] as const;
export const STORY_CHART_TYPES = ['bar', 'donut', 'line'] as const;

export const STORY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: [...STORY_BLOCK_TYPES] },
          order: { type: 'integer' },
          content: {
            type: 'object',
            properties: {
              title: nullable('string'),
              text: nullable('string'),
              icon: nullable('string'),
              tone: { type: ['string', 'null'], enum: [...STORY_TONES, null] },
              metrics: {
                type: ['array', 'null'],
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'string' },
                    change: nullable('number'),
                  },
                  required: ['label', 'value', 'change'],
                  additionalProperties: false,
                },
              },
              chartConfig: {
                type: ['object', 'null'],
                properties: {
                  chartType: { type: 'string', enum: [...STORY_CHART_TYPES] },
                  title: { type: 'string' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        label: { type: 'string' },
                        value: { type: 'number' },
                        color: nullable('string'),
                      },
                      required: ['label', 'value', 'color'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['chartType', 'title', 'data'],
                additionalProperties: false,
              },
            },
            required: ['title', 'text', 'icon', 'tone', 'metrics', 'chartConfig'],
            additionalProperties: false,
          },
        },
        required: ['type', 'order', 'content'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string' },
  },
  required: ['blocks', 'summary'],
  additionalProperties: false,
} as const;

/** Recursively drops null-valued object keys (array elements are kept). */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripNulls(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null) continue;
      out[k] = stripNulls(v);
    }
    return out as T;
  }
  return value;
}
