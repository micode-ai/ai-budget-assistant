/**
 * The VALUES rows of the category system-key backfill, built from the catalog.
 * Printed by scripts/generate-category-key-backfill.ts; the migration embeds the
 * output and category-key-backfill.spec.ts fails if the two ever differ.
 * Lives under src/ because a spec importing from scripts/ widens the build's
 * rootDir and moves dist/main.js to dist/src/main.js.
 */
import { catalogNameIndex } from './category-catalog';

export function buildBackfillValues(): string {
  const rows: string[] = [];
  for (const [id, key] of catalogNameIndex()) {
    const sep = id.indexOf(':');
    const type = id.slice(0, sep);
    const name = id.slice(sep + 1).replace(/'/g, "''");
    rows.push(`      ('${type}', '${name}', '${key}')`);
  }
  rows.sort();
  return rows.join(',\n');
}
