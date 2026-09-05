import { Request } from 'express';

export type AccountRole = 'owner' | 'editor' | 'viewer';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  currencyCode: string;
  /** IANA zone, defaulted to 'UTC' by the schema. Needed wherever a date a
   *  client sent has to be read as a CALENDAR day rather than an instant —
   *  the API runs in UTC, so the server's own getters are one day off for
   *  every user east of it. See common/utils/timezone.ts. */
  timezone: string;
  defaultAccountId?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  accountId: string;
  accountRole: AccountRole;
  /** 1..31, or null for the calendar month. Set by AccountContextGuard. */
  monthAnchorDay: number | null;
}
