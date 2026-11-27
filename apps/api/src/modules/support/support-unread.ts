import type { PrismaService } from '../../database/prisma.service';

/** Sum of developerUnreadCount over non-muted threads (a muted thread must stay invisible). */
export async function developerUnreadTotal(prisma: PrismaService): Promise<number> {
  const agg = await prisma.supportThread.aggregate({ where: { muted: false }, _sum: { developerUnreadCount: true } });
  return agg._sum.developerUnreadCount ?? 0;
}
