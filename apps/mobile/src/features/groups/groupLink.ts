/**
 * Link plumbing for shared groups: extracting the group token from a pasted link and the
 * app-link code from a deep link.
 */

const TOKEN_RE = /^[a-f0-9]{32}$/i;

/**
 * Pulls the 128-bit guest token out of whatever the user pasted: the full `/g/<token>` URL, a URL
 * carrying `?t=<token>`, or the bare token. Returns null for anything else.
 */
export function extractGroupToken(input: string | null | undefined): string | null {
  const text = (input ?? '').trim();
  if (!text) return null;
  if (TOKEN_RE.test(text)) return text.toLowerCase();
  const path = /\/g\/([a-f0-9]{32})(?![a-f0-9])/i.exec(text);
  if (path) return path[1].toLowerCase();
  const query = /[?&]t=([a-f0-9]{32})(?![a-f0-9])/i.exec(text);
  return query ? query[1].toLowerCase() : null;
}

/** The single-use app-link code the guest page mints (`randomBytes(16).hex`). */
export function isGroupLinkCode(code: string | null | undefined): code is string {
  return !!code && TOKEN_RE.test(code);
}

/** `secureStorage` key holding a link code received while signed out. */
export const PENDING_GROUP_LINK_KEY = 'pendingGroupLink';

/**
 * What a stashed `pendingGroupLink` value means. Anything that is not a well-formed code is
 * unusable and must be cleared by the caller, so a corrupt record cannot answer on every launch.
 */
export function resolvePendingGroupLink(raw: string | null): { status: 'none' } | { status: 'discard' } | { status: 'resume'; code: string } {
  if (!raw) return { status: 'none' };
  const code = raw.trim().toLowerCase();
  return isGroupLinkCode(code) ? { status: 'resume', code } : { status: 'discard' };
}

export type JoinErrorKind = 'notFound' | 'nameTaken' | 'archived' | 'alreadyMember' | 'other';

/** Maps a failed join to the friendly message to show. */
export function joinErrorKind(err: unknown): JoinErrorKind {
  const e = err as { status?: number; code?: string } | null | undefined;
  if (!e) return 'other';
  if (e.status === 404) return 'notFound';
  if (e.status === 403 && e.code === 'GROUP_ARCHIVED') return 'archived';
  if (e.status === 409 && e.code === 'ALREADY_MEMBER') return 'alreadyMember';
  if (e.status === 409 && (e.code === 'MEMBER_NAME_TAKEN' || e.code === 'MEMBER_TAKEN')) return 'nameTaken';
  return 'other';
}
