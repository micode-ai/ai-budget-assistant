import { Request } from 'express';

export type AccountRole = 'owner' | 'editor' | 'viewer';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  currencyCode: string;
  defaultAccountId?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  accountId: string;
  accountRole: AccountRole;
  /** 1..31, or null for the calendar month. Set by AccountContextGuard. */
  monthAnchorDay: number | null;
}
