import { AiStatementParser, toParserResult } from './ai-statement.parser';

describe('AiStatementParser', () => {
  const parser = new AiStatementParser();

  it('identifies itself as an ai pdf parser', () => {
    expect(parser.id).toBe('ai');
    expect(parser.format).toBe('pdf');
  });

  it('never auto-detects', () => {
    expect(parser.detect(['anything'], [])).toBe(false);
  });

  it('throws if parse() is called directly', () => {
    expect(() => parser.parse('text')).toThrow('AiStatementParser rows are supplied by StatementAiService');
  });
});

describe('toParserResult', () => {
  it('maps a negative amount to an expense with a positive value', () => {
    const result = toParserResult([
      { date: '2026-01-15', amount: -50.5, currencyCode: 'PLN', description: 'Biedronka', merchant: 'Biedronka' },
    ]);
    expect(result.rows[0]).toEqual({
      idx: 0, kind: 'expense', date: '2026-01-15', amount: 50.5,
      currencyCode: 'PLN', description: 'Biedronka', merchant: 'Biedronka',
      suggestedCategoryName: undefined,
    });
  });

  it('maps a positive amount to an income', () => {
    const result = toParserResult([
      { date: '2026-01-20', amount: 1200, currencyCode: 'PLN', description: 'Salary' },
    ]);
    expect(result.rows[0].kind).toBe('income');
    expect(result.rows[0].amount).toBe(1200);
  });

  it('falls back to the merchant when the description is empty', () => {
    const result = toParserResult([
      { date: '2026-01-15', amount: -5, currencyCode: 'PLN', description: '', merchant: 'Zabka' },
    ]);
    expect(result.rows[0].description).toBe('Zabka');
  });

  it('numbers rows sequentially and reports no headers', () => {
    const result = toParserResult([
      { date: '2026-01-15', amount: -5, currencyCode: 'PLN', description: 'a' },
      { date: '2026-01-16', amount: -6, currencyCode: 'PLN', description: 'b' },
    ]);
    expect(result.rows.map((r) => r.idx)).toEqual([0, 1]);
    expect(result.detectedHeaders).toEqual([]);
  });
});
