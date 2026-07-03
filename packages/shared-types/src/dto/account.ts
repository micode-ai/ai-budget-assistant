import type { AccountType, AccountRole, Currency } from '../entities';

export interface CreateAccountDto {
  name: string;
  type: AccountType;
  currencyCode?: Currency;
  icon?: string;
  tripStartDate?: string;
  tripEndDate?: string; // required by the API when type === 'trip'
}

export interface UpdateAccountDto {
  name?: string;
  currencyCode?: Currency;
  icon?: string;
}

export interface CreateInvitationDto {
  email?: string;
  invitedUserId?: string;
  role?: AccountRole;
  expiresInDays?: number;
}

export interface AcceptInvitationDto {
  inviteCode: string;
}

export interface UpdateMemberRoleDto {
  role: AccountRole;
}
