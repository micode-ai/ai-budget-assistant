import type { Currency, AccountType, AccountRole, InvitationStatus } from './primitives';
import type { User } from './user';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currencyCode: Currency;
  ownerId: string;
  icon?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountMember {
  id: string;
  accountId: string;
  userId: string;
  role: AccountRole;
  joinedAt: Date;
  user?: Pick<User, 'id' | 'name' | 'email'>;
}

export interface AccountInvitation {
  id: string;
  accountId: string;
  invitedBy: string;
  invitedEmail?: string;
  inviteCode: string;
  role: AccountRole;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedBy?: string;
  createdAt: Date;
}
