import * as Papa from 'papaparse';

/**
 * Shared by `ImportBankService.parsePreview` (CSV header/mapping/fingerprint
 * resolution) and `ImportBankAiPreviewService.tryAiMapping` (the AI-inference
 * fallback both feed into) — both need the same header/sample-row peeking
 * over the decoded text.
 */
export function peekHeaders(text: string, delimiter = ';'): string[] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimiter,
    preview: 1,
  });
  const first = result.data[0];
  return first ? first.map((h) => String(h).trim()) : [];
}

export function peekSampleRows(text: string, count: number, delimiter = ';'): string[][] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimiter,
    preview: count + 1,
  });
  return result.data.slice(1).map((r) => r.map(String));
}

export function countParseFailures(text: string, importedCount: number): number {
  const totalRows = text.split('\n').filter((l) => l.trim().length > 0).length - 1;
  return Math.max(0, totalRows - importedCount);
}
