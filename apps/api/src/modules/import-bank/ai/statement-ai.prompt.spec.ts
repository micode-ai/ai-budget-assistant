import { buildMappingPrompt, buildExtractionPrompt, MAX_CELL_CHARS, MAX_SAMPLE_ROWS } from './statement-ai.prompt';

describe('buildMappingPrompt', () => {
  const headers = ['Data operacji', 'Kwota', 'Opis operacji'];

  it('includes every header verbatim', () => {
    const prompt = buildMappingPrompt(headers, [['2026-01-01', '-12,00', 'Sklep']]);
    headers.forEach((h) => expect(prompt).toContain(h));
  });

  it('caps the number of sample rows', () => {
    const rows = Array.from({ length: 50 }, (_, i) => [`row${i}`, '-1,00', 'x']);
    const prompt = buildMappingPrompt(headers, rows);
    expect(prompt).toContain('row0');
    expect(prompt).toContain(`row${MAX_SAMPLE_ROWS - 1}`);
    expect(prompt).not.toContain(`row${MAX_SAMPLE_ROWS}`);
  });

  it('truncates long cells', () => {
    const long = 'x'.repeat(500);
    const prompt = buildMappingPrompt(headers, [[long, '-1,00', 'y']]);
    expect(prompt).not.toContain(long);
    expect(prompt).toContain('x'.repeat(MAX_CELL_CHARS));
  });

  it('instructs the model to choose only from the given headers', () => {
    const prompt = buildMappingPrompt(headers, []);
    expect(prompt).toContain('must appear in the HEADERS list above, character for character');
    expect(prompt).toContain('Do not translate, reformat, trim or invent one');
  });
});

describe('buildExtractionPrompt', () => {
  it('includes the page text and asks for ISO dates', () => {
    const prompt = buildExtractionPrompt('01.02.2026 BIEDRONKA -50,00 PLN');
    expect(prompt).toContain('BIEDRONKA');
    expect(prompt).toContain('YYYY-MM-DD');
  });
});
