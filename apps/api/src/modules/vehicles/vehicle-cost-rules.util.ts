import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Cost kinds (ABA-803). A fill-up with litres and odometer lives in FuelLog; `fuel` here is a fuel
 * purchase known only by its amount (ABA-804) — it counts in the cost of ownership, never in
 * consumption. `none` is a person's "not a car cost".
 */
export const VEHICLE_COST_KINDS = ['fuel', 'service', 'insurance', 'parking', 'tax', 'other'] as const;
export type VehicleCostKind = (typeof VEHICLE_COST_KINDS)[number];

export interface VehicleCategoryRule {
  categoryId: string;
  kind: VehicleCostKind;
}

/** Reads `Vehicle.categoryRules` defensively — it is JSON. */
export function parseCategoryRules(value: unknown): VehicleCategoryRule[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r): r is VehicleCategoryRule =>
      !!r &&
      typeof (r as VehicleCategoryRule).categoryId === 'string' &&
      (VEHICLE_COST_KINDS as readonly string[]).includes((r as VehicleCategoryRule).kind),
  );
}

/**
 * A vehicle's category rule (ABA-803): every live expense whose own category
 * the vehicle claims is that vehicle's cost of the claimed kind. Materialised
 * as `VehicleCost` rows with `source = 'category'`; idempotent.
 *
 * - Releases rule rows whose expense left the category, was deleted or became
 *   planned, or whose vehicle no longer claims the category with that kind.
 * - Attributes an expense in a claimed category unless a person decided about
 *   it: a `source = null` cost row (including a `none` tombstone) or a fill-up.
 * - When two vehicles claim one category, the first (oldest) vehicle wins.
 */
export async function applyVehicleCategoryRules(
  db: Db,
  accountId: string,
): Promise<{ attributed: number; released: number }> {
  const vehicles = await db.vehicle.findMany({
    where: { accountId, isDeleted: false },
    select: { id: true, categoryRules: true },
    orderBy: { createdAt: 'asc' },
  });
  const byCategory = new Map<string, { vehicleId: string; kind: VehicleCostKind }>();
  for (const v of vehicles) {
    for (const r of parseCategoryRules(v.categoryRules)) {
      if (!byCategory.has(r.categoryId)) byCategory.set(r.categoryId, { vehicleId: v.id, kind: r.kind });
    }
  }

  const ruleRows = await db.vehicleCost.findMany({
    where: { accountId, source: 'category' },
    select: { id: true, vehicleId: true, kind: true, expense: { select: { categoryId: true, isDeleted: true, isPlanned: true } } },
  });
  const stale = ruleRows.filter((r) => {
    if (r.expense.isDeleted || r.expense.isPlanned || !r.expense.categoryId) return true;
    const want = byCategory.get(r.expense.categoryId);
    return !want || want.vehicleId !== r.vehicleId || want.kind !== r.kind;
  });
  if (stale.length > 0) await db.vehicleCost.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });

  let attributed = 0;
  if (byCategory.size > 0) {
    const expenses = await db.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        isPlanned: false,
        isSplitReceivable: false,
        categoryId: { in: [...byCategory.keys()] },
        fuelLog: { is: null },
        OR: [{ vehicleCost: { is: null } }, { vehicleCost: { is: { source: 'category' } } }],
      },
      select: { id: true, categoryId: true, vehicleCost: { select: { vehicleId: true, kind: true } } },
    });
    for (const e of expenses) {
      const want = byCategory.get(e.categoryId!)!;
      if (e.vehicleCost && e.vehicleCost.vehicleId === want.vehicleId && e.vehicleCost.kind === want.kind) continue;
      await db.vehicleCost.upsert({
        where: { expenseId: e.id },
        create: { accountId, vehicleId: want.vehicleId, expenseId: e.id, kind: want.kind, source: 'category' },
        update: { vehicleId: want.vehicleId, kind: want.kind, source: 'category' },
      });
      attributed++;
    }
  }
  return { attributed, released: stale.length };
}
