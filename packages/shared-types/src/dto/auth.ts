import type { Currency, ThemeMode, SettleMethod, Account } from '../entities';

/** Where a signup came from. Captured on the visitor's FIRST arrival at the web app
 * from the query string the marketing generators put on every CTA (see `app_url()` in
 * build_landing.py / build_blog.py) and replayed at registration, which can happen much
 * later — after email verification, or after a round trip through Google.
 *
 * Every field is a closed vocabulary those generators emit, never free text: the values
 * are stored on the user row and later grouped on in the admin, so the API validates them
 * against an allow-list rather than trusting the URL a client happens to send.
 *
 * First touch wins and is never overwritten, so this says where a visit started. It is
 * NOT cross-session attribution and must not be reported as such. */
export interface AcquisitionDto {
  /** Which surface: `landing`, `blog`, `help`. */
  src?: string;
  /** Which section of it: `hero`, `nav`, `band`, `pricing_card`, `footer`, `cta`. */
  loc?: string;
  /** Language of the page that produced the click, BCP-47 (so Ukrainian is `uk`) —
   * the same value the GA4 `language` custom dimension carries, so the click and the
   * signup it caused can be lined up. */
  lang?: string;
  /** Tier of the pricing card clicked, when the click came from one. */
  plan?: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  currencyCode?: Currency;
  timezone?: string;
  referralCode?: string;
  acquisition?: AcquisitionDto;
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
    /** The API always includes this today (login/register/verifyEmail inline,
    * and googleLogin/restore via the shared `buildAuthResponse`) — optional
    * here only so a caller falls back explicitly rather than assuming `true`
    * when reading a value that is, in practice, always present. */
    isVerified?: boolean;
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
