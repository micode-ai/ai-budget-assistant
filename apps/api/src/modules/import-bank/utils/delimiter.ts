import * as Papa from 'papaparse';

const CANDIDATES = [';', ',', '\t', '|'];

/**
 * Pick the delimiter that parses the first few lines into the most columns
 * with a consistent column count. Papa's own auto-detection is not used
 * directly because it is not exposed as a standalone call and we need the
 * chosen value to pass on to UniversalParser.
 */
export function sniffDelimiter(text: string): string {
  if (!text.trim()) return ';';

  let best = ';';
  let bestScore = 0;

  for (const delimiter of CANDIDATES) {
    const result = Papa.parse<string[]>(text, {
      skipEmptyLines: true,
      delimiter,
      preview: 5,
    });
    const rows = result.data.filter((r) => Array.isArray(r));
    if (rows.length === 0) continue;

    const counts = rows.map((r) => r.length);
    const first = counts[0];
    if (first < 2) continue;
    // Every previewed row must agree on the column count, or this delimiter
    // is splitting inside quoted content.
    if (!counts.every((c) => c === first)) continue;

    if (first > bestScore) {
      bestScore = first;
      best = delimiter;
    }
  }

  return best;
}
