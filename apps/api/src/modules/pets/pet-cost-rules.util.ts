import type { Prisma, PrismaClient } from '@prisma/client';
import { PET_COST_KINDS } from './pet-history.util';

type Db = PrismaClient | Prisma.TransactionClient;

export type PetCostKind = (typeof PET_COST_KINDS)[number];

/** A person's "not a pet cost": the row a removal leaves so a category rule does not put it back. */
export const PET_COST_NONE = 'none';

export type PetCategoryRule = {
  categoryId: string;
  kind: PetCostKind;
};

/** Reads `Pet.categoryRules` defensively — it is JSON. */
export function parsePetCategoryRules(value: unknown): PetCategoryRule[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r): r is PetCategoryRule =>
      !!r &&
      typeof (r as PetCategoryRule).categoryId === 'string' &&
      (PET_COST_KINDS as readonly string[]).includes((r as PetCategoryRule).kind),
  );
}

/**
 * A pet's category rule (ABA-833, mirroring the vehicles' ABA-803): every live
 * expense whose own category the pet claims is that pet's cost of the claimed
 * kind. Materialised as `PetCost` rows with `source = 'category'`; idempotent.
 *
 * - Releases rule rows whose expense left the category, was deleted or became
 *   planned, or whose pet no longer claims the category with that kind.
 * - Attributes an expense in a claimed category unless a person decided about
 *   it: a `source = null` cost row, including a `none` tombstone.
 * - When two pets claim one category, the first (oldest) pet wins.
 */
export async function applyPetCategoryRules(
  db: Db,
  accountId: string,
): Promise<{ attributed: number; released: number }> {
  const pets = await db.pet.findMany({
    where: { accountId, isDeleted: false },
    select: { id: true, categoryRules: true },
    orderBy: { createdAt: 'asc' },
  });
  const byCategory = new Map<string, { petId: string; kind: PetCostKind }>();
  for (const p of pets) {
    for (const r of parsePetCategoryRules(p.categoryRules)) {
      if (!byCategory.has(r.categoryId)) byCategory.set(r.categoryId, { petId: p.id, kind: r.kind });
    }
  }

  const ruleRows = await db.petCost.findMany({
    where: { accountId, source: 'category' },
    select: { id: true, petId: true, kind: true, expense: { select: { categoryId: true, isDeleted: true, isPlanned: true } } },
  });
  const stale = ruleRows.filter((r) => {
    if (r.expense.isDeleted || r.expense.isPlanned || !r.expense.categoryId) return true;
    const want = byCategory.get(r.expense.categoryId);
    return !want || want.petId !== r.petId || want.kind !== r.kind;
  });
  if (stale.length > 0) await db.petCost.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });

  let attributed = 0;
  if (byCategory.size > 0) {
    const expenses = await db.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        isPlanned: false,
        isSplitReceivable: false,
        categoryId: { in: [...byCategory.keys()] },
        OR: [{ petCost: { is: null } }, { petCost: { is: { source: 'category' } } }],
      },
      select: { id: true, categoryId: true, petCost: { select: { petId: true, kind: true } } },
    });
    for (const e of expenses) {
      const want = byCategory.get(e.categoryId!)!;
      if (e.petCost && e.petCost.petId === want.petId && e.petCost.kind === want.kind) continue;
      await db.petCost.upsert({
        where: { expenseId: e.id },
        create: { accountId, petId: want.petId, expenseId: e.id, kind: want.kind, source: 'category' },
        update: { petId: want.petId, kind: want.kind, source: 'category' },
      });
      attributed++;
    }
  }
  return { attributed, released: stale.length };
}
