/**
 * Prints the VALUES rows of the category system-key backfill from the catalog:
 *   npx ts-node scripts/generate-category-key-backfill.ts
 * The migration embeds this output; category-key-backfill.spec.ts fails if the
 * two ever differ.
 */
import { catalogNameIndex } from '../src/common/utils/category-catalog';

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

if (require.main === module) {
  process.stdout.write(buildBackfillValues() + '\n');
}
