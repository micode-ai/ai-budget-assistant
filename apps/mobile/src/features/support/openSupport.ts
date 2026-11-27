import { router } from 'expo-router';

/**
 * A route PATTERN (`help/index`, `expense/[id]`) — letters, digits, `/`, `-`,
 * `_`, `[]`, `()`, `.`, `+` — at most 100 characters. Anything else (a deep link
 * carrying a resolved path, an e-mail, free text) is dropped rather than sent,
 * and so is anything holding an id-shaped segment (a UUID, or 4+ digits) — a
 * resolved path must never reach the developer.
 */
export function sanitizeFromRoute(from: string | string[] | undefined): string | undefined {
  const value = Array.isArray(from) ? from[0] : from;
  if (!value) return undefined;
  if (!/^[\w\-/[\]().+]{1,100}$/.test(value)) return undefined;
  if (/[0-9a-f]{8}-[0-9a-f]{4}/i.test(value) || /\d{4,}/.test(value)) return undefined;
  return value;
}

/** Opens the support screen, recording which screen it was opened from. */
export function openSupport(fromRoute?: string): void {
  router.push(fromRoute ? { pathname: '/support', params: { from: fromRoute } } : '/support');
}
