import { buildCategorizeFormat, buildParseFormat } from './categorization.service';

describe('categorization structured-output formats', () => {
  it('constrains category to the listed names (deduped) and is strict', () => {
    const f = buildCategorizeFormat(['Food', 'Fuel', 'Food']);
    expect(f.type).toBe('json_schema');
    expect(f.json_schema.strict).toBe(true);
    const schema: any = f.json_schema.schema;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required.sort()).toEqual(['category', 'confidence']);
    expect(schema.properties.category.enum).toEqual(['Food', 'Fuel']);
  });

  it('falls back to a plain string when there are no categories', () => {
    const schema: any = buildCategorizeFormat([]).json_schema.schema;
    expect(schema.properties.category).toEqual({ type: 'string' });
  });

  it('expense parse requires every property incl. nullable merchant/currency; income has no merchant', () => {
    const exp: any = buildParseFormat('expense', ['A']).json_schema.schema;
    expect(exp.required.sort()).toEqual(['amount', 'category', 'confidence', 'currency', 'description', 'merchant']);
    expect(exp.properties.merchant.type).toEqual(['string', 'null']);
    const inc: any = buildParseFormat('income', ['A']).json_schema.schema;
    expect(inc.required).not.toContain('merchant');
    expect(Object.keys(inc.properties).sort()).toEqual(inc.required.sort());
  });
});
