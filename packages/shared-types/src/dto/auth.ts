import type { Currency, ThemeMode, SettleMethod, Account } from '../entities';

export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  currencyCode?: Currency;
  timezone?: string;
  referralCode?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    currencyCode: Currency;
    defaultAccountId?: string;
    themeMode?: ThemeMode;
    accentColor?: string | null;
    /** How the user prefers to be paid back — used to build the pay button on a
    * receipt-split guest link. Falls back to the account-member handle (trip
    * settle-up) when unset. */
    paymentMethod?: SettleMethod | null;
    paymentHandle?: string | null;
  };
  accounts: Account[];
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  email: string;
  code: string;
  newPassword: string;
}

export interface MessageResponse {
  message: string;
}
