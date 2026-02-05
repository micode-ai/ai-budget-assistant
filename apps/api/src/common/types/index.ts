import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  currencyCode: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
