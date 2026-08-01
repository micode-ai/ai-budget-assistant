import type { Currency, AccountType, AccountRole, InvitationStatus, TripStatus, SettleMethod } from './primitives';
import type { User } from './user';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currencyCode: Currency;
  ownerId: string;
  icon?: string;
  isActive: boolean;
  tripStartDate?: string;
  tripEndDate?: string;
  tripStatus?: TripStatus;
  /** 1..31, or null/undefined for the calendar month. See the financial-month util. */
  monthAnchorDay?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountMember {
  id: string;
  accountId: string;
  userId: string;
  role: AccountRole;
  joinedAt: Date;
  paymentMethod?: SettleMethod;
  paymentHandle?: string;
  user?: Pick<User, 'id' | 'name' | 'email'>;
}

export interface AccountInvitation {
  id: string;
  accountId: string;
  invitedBy: string;
  invitedEmail?: string;
  invitedUserId?: string;
  inviteCode: string;
  role: AccountRole;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedBy?: string;
  createdAt: Date;
}
