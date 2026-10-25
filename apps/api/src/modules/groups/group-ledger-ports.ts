import type { Prisma } from '@prisma/client';
import type { GroupDetail } from '@budget/shared-types';

/** The acting member, re-resolved from the DB. */
export interface GroupActor {
  id: string;
  userId: string | null;
  isOwner: boolean;
}

/**
 * The ledger primitives GroupsService owns and the write collaborators it builds (settlements,
 * itemised expenses) call back into. A type, not a provider: GroupsService is the facade and hands
 * itself over, so there is no injection cycle with GroupItemsService, which injects GroupsService.
 */
export interface GroupLedgerPorts {
  resolveActor(groupId: string, memberId: string): Promise<GroupActor>;
  assertLiveMembers(groupId: string, ids: string[], db?: Prisma.TransactionClient): Promise<void>;
  lockGroup(tx: Prisma.TransactionClient, groupId: string, bump?: boolean): Promise<void>;
  loadState(groupId: string): Promise<{ ledger: { balances: { memberId: string; netAmount: number }[] } }>;
  getDetail(groupId: string, memberId: string): Promise<GroupDetail>;
  notifyActivity(groupId: string, actorMemberId: string): void;
  afterLedgerWrite(groupId: string): void;
}
