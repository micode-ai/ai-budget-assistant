#!/usr/bin/env ts-node
/**
 * One-shot: embed every existing category, tag, project that has null
 * embedding. Safe to re-run — only updates rows where embedding IS NULL.
 *
 * Run locally:
 *   npx ts-node apps/api/scripts/backfill-embeddings.ts
 *
 * Run in prod (after migration is applied and new code is deployed):
 *   docker exec budget-api-prod node -r ts-node/register \
 *     /app/apps/api/scripts/backfill-embeddings.ts
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BATCH = 50;
const EMBED_MODEL = 'text-embedding-3-small';

async function embedBatch(texts: string[]): Promise<number[][]> {
  const r = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: texts.map((t) => t.trim().slice(0, 1000)),
  });
  return r.data.map((d) => d.embedding);
}

async function backfill(
  table: 'category' | 'tag' | 'project',
  rows: { id: string; name: string }[],
): Promise<number> {
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const vectors = await embedBatch(slice.map((r) => r.name));
    for (let j = 0; j < slice.length; j++) {
      if (table === 'category') {
        await prisma.category.update({ where: { id: slice[j].id }, data: { embedding: vectors[j] } });
      } else if (table === 'tag') {
        await prisma.tag.update({ where: { id: slice[j].id }, data: { embedding: vectors[j] } });
      } else {
        await prisma.project.update({ where: { id: slice[j].id }, data: { embedding: vectors[j] } });
      }
    }
    done += slice.length;
    console.log(`[${table}] ${done}/${rows.length}`);
  }
  return done;
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required');
    process.exit(1);
  }

  const cats = await prisma.category.findMany({
    where: { embedding: { equals: null }, isDeleted: false },
    select: { id: true, name: true },
  });
  const tags = await prisma.tag.findMany({
    where: { embedding: { equals: null }, isDeleted: false },
    select: { id: true, name: true },
  });
  const projects = await prisma.project.findMany({
    where: { embedding: { equals: null }, isDeleted: false },
    select: { id: true, name: true },
  });
  console.log(`To embed: ${cats.length} categories, ${tags.length} tags, ${projects.length} projects`);

  await backfill('category', cats);
  await backfill('tag', tags);
  await backfill('project', projects);
  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
