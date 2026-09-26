import { searchHelpSections } from '../helpSearch';
import type { HelpSection } from '../content';

function section(overrides: Partial<HelpSection> & { id: string }): HelpSection {
  return {
    title: 'Untitled',
    description: 'No description',
    body: 'No body',
    ...overrides,
  };
}

describe('searchHelpSections', () => {
  const sections: HelpSection[] = [
    section({
      id: 'a-budgets',
      title: 'Budgets',
      description: 'Set spending limits per category',
      body: 'Create a budget and track progress toward it.',
    }),
    section({
      id: 'b-receipts',
      title: 'Scanning receipts',
      description: 'Use your camera to log an expense',
      body: 'Every receipt line item can carry a deposit (kaucja) amount that is tracked separately from the item price.',
    }),
    section({
      id: 'c-anchor',
      title: 'Financial month',
      description: 'Pick an anchor day for your budgets to start counting the month from',
      body: 'The anchor day shifts every period boundary.',
    }),
  ];

  it('returns every section, in original order, tier "none" for an empty query', () => {
    const result = searchHelpSections(sections, '');
    expect(result.map((r) => r.section.id)).toEqual(['a-budgets', 'b-receipts', 'c-anchor']);
    expect(result.every((r) => r.tier === 'none' && r.snippet === null)).toBe(true);
  });

  it('returns every section, unchanged, for a whitespace-only query', () => {
    const result = searchHelpSections(sections, '   ');
    expect(result.map((r) => r.section.id)).toEqual(['a-budgets', 'b-receipts', 'c-anchor']);
  });

  it('ranks a description match above a body-only match for the same query', () => {
    // "anchor" is absent from c-anchor's title ("Financial month") but present
    // in both its description and its body — description tier wins over body.
    const result = searchHelpSections(sections, 'anchor');
    expect(result).toHaveLength(1);
    expect(result[0].section.id).toBe('c-anchor');
    expect(result[0].tier).toBe('description');
    expect(result[0].snippet).toBeNull();
  });

  it('matches on the title when the query is present there', () => {
    const result = searchHelpSections(sections, 'financial month');
    expect(result).toHaveLength(1);
    expect(result[0].section.id).toBe('c-anchor');
    expect(result[0].tier).toBe('title');
  });

  it('falls back to a body match with a snippet when title/description miss', () => {
    const result = searchHelpSections(sections, 'kaucja');
    expect(result).toHaveLength(1);
    expect(result[0].section.id).toBe('b-receipts');
    expect(result[0].tier).toBe('body');
    expect(result[0].snippet).toContain('kaucja');
  });

  it('truncates the snippet with an ellipsis on both sides when the match is mid-body', () => {
    const long = section({
      id: 'd-long',
      title: 'Long article',
      description: 'no match here',
      body: `${'x'.repeat(100)} needle ${'y'.repeat(100)}`,
    });
    const result = searchHelpSections([long], 'needle');
    expect(result[0].snippet).toMatch(/^…x+ needle y+…$/);
  });

  it('is case-insensitive', () => {
    const result = searchHelpSections(sections, 'BUDGETS');
    expect(result.map((r) => r.section.id)).toContain('a-budgets');
  });

  it('returns an empty array when nothing matches', () => {
    const result = searchHelpSections(sections, 'zzz-not-present');
    expect(result).toEqual([]);
  });

  it('groups results by tier: all title matches, then description, then body', () => {
    const mixed: HelpSection[] = [
      section({ id: 'body-only', title: 'X', description: 'Y', body: 'shared word here' }),
      section({ id: 'title-match', title: 'shared word', description: 'Y', body: 'Z' }),
      section({ id: 'desc-match', title: 'X', description: 'shared word', body: 'Z' }),
    ];
    const result = searchHelpSections(mixed, 'shared word');
    expect(result.map((r) => r.section.id)).toEqual(['title-match', 'desc-match', 'body-only']);
  });
});
