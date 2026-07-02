import type { ShareType, SettleMethod, SettleStatus } from './primitives';

export interface TripExpenseShare {
  id: string;
  expenseId: string;
  userId: string;
  shareType: ShareType;
  shareAmount: number;
  createdAt: string;
}

export interface SettleUpTransaction {
  id: string;
  accountId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  method: SettleMethod | null;
  status: SettleStatus;
  confirmedAt: string | null;
  createdAt: string;
}
