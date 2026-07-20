import { PrismaService } from '../../database/prisma.service';

/**
 * Resolve categoryId: if it's a valid UUID, use as-is.
 * If it's a category name, find or create by name.
 * If it's a mobile default ID (e.g. "default-exp-food---drinks"), extract name and fuzzy match.
 *
 * Shared by ExpensesService (create/update) and ExpenseBulkService (bulkUpdate) —
 * both resolve a client-supplied categoryId the same way.
 */
export async function resolveExpenseCategoryId(
  prisma: PrismaService,
  categoryId: string | undefined | null,
  accountId: string,
): Promise<string | null> {
  if (!categoryId) return null;
  // UUID v4 pattern — validate ownership before trusting the id
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
    const owned = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, accountId: true },
    });
    return owned?.accountId === accountId ? owned.id : null;
  }
  // Try exact name match scoped to this account
  const category = await prisma.category.findFirst({
    where: { accountId, name: { equals: categoryId, mode: 'insensitive' } },
  });
  if (category) return category.id;

  // Handle mobile default IDs (e.g. "default-exp-bills---utilities" → search "bills", "utilities")
  const defaultMatch = categoryId.match(/^default-(?:exp|inc)-(.+)$/);
  if (defaultMatch) {
    const words = defaultMatch[1].split(/-+/).filter((w) => w.length > 0);
    if (words.length > 0) {
      const matched = await prisma.category.findFirst({
        where: {
          accountId,
          isDeleted: false,
          AND: words.map((word) => ({ name: { contains: word, mode: 'insensitive' as const } })),
        },
      });
      if (matched) return matched.id;
    }
  }

  // Auto-create category if it looks like a real name (not a default ID)
  if (!categoryId.startsWith('default-')) {
    const type = categoryId.toLowerCase().includes('income') ? 'income' : 'expense';
    const created = await prisma.category.create({
      data: { accountId, name: categoryId, type },
    });
    return created.id;
  }

  return null;
}
