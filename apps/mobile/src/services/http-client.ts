import { secureStorage } from './secureStorage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

export class HttpClient {
  baseUrl: string;
  accountIdGetter: (() => string | null) | null = null;
  logoutHandler: (() => void) | null = null;
  isLoggingOut = false;
  // Single-flight refresh: when an access token expires, MANY parallel API
  // calls 401 at once and each used to fire its own POST /auth/refresh —
  // N redundant network calls per expiry. All concurrent callers now await
  // one shared in-flight refresh promise.
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setAccountIdGetter(getter: () => string | null) {
    this.accountIdGetter = getter;
  }

  setLogoutHandler(handler: () => void) {
    this.logoutHandler = handler;
  }

  async getAuthToken(): Promise<string | null> {
    try {
      return await secureStorage.getItem('accessToken');
    } catch {
      return null;
    }
  }

  async refreshToken(): Promise<boolean> {
    // Coalesce concurrent refreshes into one in-flight call.
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = this.doRefreshToken().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefreshToken(): Promise<boolean> {
    try {
      const refreshToken = await secureStorage.getItem('refreshToken');
      if (!refreshToken) return false;

      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      await secureStorage.setItem('accessToken', data.accessToken);
      // The server now returns a fresh refresh token with every refresh
      // (sliding session) — persist it so an active user's window keeps
      // extending and they are never force-logged-out by the 7-day expiry.
      if (data.refreshToken) {
        await secureStorage.setItem('refreshToken', data.refreshToken);
      }
      return true;
    } catch {
      return false;
    }
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { skipAuth = false, ...fetchOptions } = options;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (!skipAuth) {
      const token = await this.getAuthToken();
      if (token) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
      }

      const accountId = this.accountIdGetter?.();
      if (accountId) {
        (headers as Record<string, string>)['X-Account-Id'] = accountId;
      }
    }

    const url = `${this.baseUrl}${endpoint}`;

    let response: Response;
    try {
      response = await fetch(url, {
        ...fetchOptions,
        headers,
      });
    } catch (e) {
      throw e;
    }

    if (response.status === 401 && !skipAuth) {
      if (this.isLoggingOut) {
        throw new Error('Session expired');
      }

      const refreshed = await this.refreshToken();
      if (refreshed) {
        const newToken = await this.getAuthToken();
        if (newToken) {
          (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
        }
        response = await fetch(url, {
          ...fetchOptions,
          headers,
        });
      } else {
        if (!this.isLoggingOut) {
          this.isLoggingOut = true;
          await secureStorage.removeItem('accessToken');
          await secureStorage.removeItem('refreshToken');
          this.logoutHandler?.();
          this.isLoggingOut = false;
        }
        throw new Error('Session expired');
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      const message = Array.isArray(error.message)
        ? error.message.join('\n')
        : error.message || `HTTP ${response.status}`;
      const apiError: any = new Error(message);
      apiError.status = response.status;
      apiError.details = error.details;
      throw apiError;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : (undefined as unknown as T);
  }
}

export const httpClient = new HttpClient(API_BASE_URL);
