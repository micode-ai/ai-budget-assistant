/**
 * Prints the VALUES rows of the category system-key backfill from the catalog:
 *   npx ts-node scripts/generate-category-key-backfill.ts
 * The migration embeds this output; category-key-backfill.spec.ts fails if the
 * two ever differ.
 */
import { buildBackfillValues } from '../src/common/utils/category-key-backfill';

process.stdout.write(buildBackfillValues() + '\n');
