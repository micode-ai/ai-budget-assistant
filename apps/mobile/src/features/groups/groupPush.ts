/** What a group push carries (`group_activity`, `group_reminder`). Untrusted: it is push payload. */
export interface GroupPushData {
  groupId?: unknown;
  reminder?: unknown;
  fromMemberId?: unknown;
  toMemberId?: unknown;
}

export type GroupPushRoute = string | { pathname: string; params: Record<string, string> };

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

/**
 * Where a group push opens. Groups are not account-scoped, so there is no account to switch to.
 * A balance reminder (ABA-653) opens the settle screen, which since ABA-652 takes any amount up to
 * the balance: a debtor's reminder carries the suggested pair; a creditor's carries none and opens
 * *Record a payment*. The settle screen re-resolves the pair against live balances, so a stale one
 * is harmless.
 */
export function groupPushRoute(type: 'group_activity' | 'group_reminder', data: GroupPushData): GroupPushRoute {
  const groupId = str(data.groupId);
  if (!groupId) return '/groups';
  if (type !== 'group_reminder') return `/groups/${groupId}`;
  const from = str(data.fromMemberId);
  const to = str(data.toMemberId);
  const settle = `/groups/${groupId}/settle`;
  return from && to ? { pathname: settle, params: { from, to } } : settle;
}
