import { buildInsightsResponseSchema } from './insight-schema.util';

describe('buildInsightsResponseSchema', () => {
  const check = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.properties) {
      expect(node.additionalProperties).toBe(false);
      expect([...node.required].sort()).toEqual(Object.keys(node.properties).sort());
      Object.values(node.properties).forEach(check);
    }
    if (node.items) check(node.items);
  };

  it('is strict-mode compliant and carries the given enums', () => {
    const schema = buildInsightsResponseSchema(['a', 'b'], ['bar', 'donut']);
    check(schema);
    const item = schema.properties.insights.items.properties;
    expect(item.insightType.enum).toEqual(['a', 'b']);
    expect(item.chartConfig.properties.chartType.enum).toEqual(['bar', 'donut']);
    expect(item.severity.enum).toEqual(['info', 'warning', 'critical']);
  });
});
