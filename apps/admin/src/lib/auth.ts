import { api } from './api-client';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  currencyCode: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AdminUser;
}

export async function login(email: string, password: string): Promise<AdminUser> {
  const data = await api.post('auth/login', { json: { email, password } }).json<LoginResponse>();

  // Store token temporarily so the admin check request can be authenticated
  localStorage.setItem('admin_token', data.accessToken);
  localStorage.setItem('admin_refresh_token', data.refreshToken);

  // Verify this user has admin access by hitting a protected admin endpoint
  try {
    await api.get('admin/system/health');
  } catch {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refresh_token');
    throw new Error('Access denied. Admin privileges required.');
  }

  localStorage.setItem('admin_user', JSON.stringify(data.user));
  return data.user;
}

export function logout() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_refresh_token');
  localStorage.removeItem('admin_user');
  window.location.href = '/login';
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('admin_token');
}

export function getUser(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('admin_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getToken() && !!getUser();
}
