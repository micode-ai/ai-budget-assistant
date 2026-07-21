import type { Currency, ThemeMode, Account } from '../entities';

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
