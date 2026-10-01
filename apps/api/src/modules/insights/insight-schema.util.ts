/**
 * Strict-mode JSON schemas shared by the AI insight generators
 * (`ai-insights.service.ts` and `investments/investment-insights.service.ts`).
 * Optional fields are expressed as nullable (strict mode requires every property
 * in `required`); callers run `stripNulls` on the parsed chartConfig before
 * persisting so stored charts keep the original sparse shape.
 */

export const INSIGHT_SEVERITIES = ['info', 'warning', 'critical'] as const;

export function buildInsightsResponseSchema(insightTypes: readonly string[], chartTypes: readonly string[]) {
  return {
    type: 'object',
    properties: {
      insights: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            insightType: { type: 'string', enum: [...insightTypes] },
            title: { type: 'string' },
            description: { type: 'string' },
            severity: { type: 'string', enum: [...INSIGHT_SEVERITIES] },
            chartConfig: {
              type: 'object',
              properties: {
                chartType: { type: 'string', enum: [...chartTypes] },
                title: { type: 'string' },
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string' },
                      value: { type: 'number' },
                      color: { type: ['string', 'null'] },
                    },
                    required: ['label', 'value', 'color'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['chartType', 'title', 'data'],
              additionalProperties: false,
            },
            actionSuggestion: { type: 'string' },
          },
          required: ['insightType', 'title', 'description', 'severity', 'chartConfig', 'actionSuggestion'],
          additionalProperties: false,
        },
      },
    },
    required: ['insights'],
    additionalProperties: false,
  } as const;
}
