import { PrismaService } from '../../database/prisma.service';
import { paginateById } from '../../common/utils/paginate';
import { normalizeCommunityMerchant } from '../community-prices/community-price.util';

const DAY_MS = 86_400_000;
/** A user is pushed about a chain only when they bought there in this many days. */
export const PUSH_MERCHANT_WINDOW_DAYS = 90;
const BATCH = 500;

export type PushCandidate = { id: string; defaultAccountId: string | null };

/**
 * The community promo push's candidate users, streamed in id order: active, with a push token,
 * `notifyLeafletPromos` on and a default account (the basket's account). Shared by the push cron
 * and the admin "N users will be notified" count, so the two can never disagree on who is eligible.
 */
export function pushCandidatePages(prisma: PrismaService): AsyncGenerator<PushCandidate[]> {
  return paginateById<PushCandidate>(
    (cursor) =>
      prisma.user.findMany({
        where: { isActive: true, pushToken: { not: null }, notifyLeafletPromos: true, defaultAccountId: { not: null } },
        select: { id: true, defaultAccountId: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    BATCH,
  );
}

/**
 * The normalized chains an account bought at in the last 90 days, or `null` when the account is
 * not pushable at all (missing, or item prices encrypted — `encryptionTier >= 2`).
 */
export async function pushableChains(prisma: PrismaService, accountId: string, now: Date): Promise<Set<string> | null> {
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { encryptionTier: true } });
  if (!account || account.encryptionTier >= 2) return null;

  const since = new Date(now.getTime() - PUSH_MERCHANT_WINDOW_DAYS * DAY_MS);
  const merchants = await prisma.expense.findMany({
    where: { accountId, isDeleted: false, date: { gte: since }, merchant: { not: null } },
    select: { merchant: true },
    distinct: ['merchant'],
  });
  const chains = new Set<string>();
  for (const m of merchants) {
    const chain = normalizeCommunityMerchant(m.merchant);
    if (chain) chains.add(chain);
  }
  return chains;
}
