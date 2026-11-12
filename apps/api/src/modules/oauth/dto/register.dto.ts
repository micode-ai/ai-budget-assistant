import { HttpException, HttpStatus } from '@nestjs/common';
import { DCR_ALLOWED_SCOPES, MCP_DEFAULT_SCOPES } from '../mcp.config';
import { hasForbiddenChars, normaliseAppName } from '../app-name.util';
import { MAX_REDIRECT_URIS, isAllowedRedirectUri } from '../redirect-uri.util';
import type { PublicScope } from '../oauth-scopes';

/**
 * RFC 7591 dynamic client registration request/response for `POST /oauth/register`.
 *
 * Not a class-validator DTO on purpose: RFC 7591 §3.2.2 errors are `{error, error_description}`
 * with `invalid_redirect_uri` / `invalid_client_metadata`, which the global ValidationPipe cannot
 * produce. The controller takes a plain record (the pipe skips `Object`) and everything is checked
 * here. Unknown metadata fields are ignored, as RFC 7591 §2 allows.
 */

export const DCR_CLIENT_NAME_MAX = 80;
export const DCR_GRANT_TYPES = ['authorization_code', 'refresh_token'] as const;
export type DcrGrantType = (typeof DCR_GRANT_TYPES)[number];

/**
 * Names a registered client may not contain, normalized (see `normaliseAppName`: lower-case, no
 * diacritics, letters/digits only): ours in Polish/English/Russian, and the publisher's
 * (`micode`, already reserved for developer apps in app-name.util.ts).
 */
const LOOKALIKES = ['ai budzet', 'ai budget', 'budzet', 'micode', 'бюджет'].map(normaliseAppName);

/**
 * Cyrillic and Greek letters drawn like Latin ones, folded to Latin before matching, so
 * `АI Вudżеt` (Cyrillic А, В, е) cannot slip past. Deliberately small: the common lookalikes only.
 */
const CONFUSABLES: Record<string, string> = {
  а: 'a', А: 'a', е: 'e', Е: 'e', о: 'o', О: 'o', у: 'y', У: 'y', р: 'p', Р: 'p', с: 'c', С: 'c',
  В: 'b', і: 'i', І: 'i', М: 'm', Т: 't', К: 'k', Н: 'h', Х: 'x', х: 'x',
  α: 'a', Α: 'a', ε: 'e', Ε: 'e', ο: 'o', Ο: 'o', ι: 'i', Ι: 'i', Β: 'b', Μ: 'm', Τ: 't', Κ: 'k',
};
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'gu');

/** Whitespace or control/format characters, which `new URL` would silently strip or re-encode. */
const URI_FORBIDDEN = /[\s\p{Cc}\p{Cf}]/u;

export type RegistrationErrorCode = 'invalid_redirect_uri' | 'invalid_client_metadata';

/** RFC 7591 §3.2.2 error. Descriptions never echo the submitted values. */
export class RegistrationError extends HttpException {
  constructor(
    readonly code: RegistrationErrorCode,
    description: string,
  ) {
    super({ error: code, error_description: description }, HttpStatus.BAD_REQUEST);
  }
}

export interface RegistrationRequest {
  clientName: string;
  redirectUris: string[];
  clientUri: string | null;
  logoUri: string | null;
  grantTypes: DcrGrantType[];
  scopes: PublicScope[];
}

export interface RegistrationResponse {
  client_id: string;
  client_id_issued_at: number;
  client_name: string;
  client_uri?: string;
  logo_uri?: string;
  redirect_uris: string[];
  grant_types: DcrGrantType[];
  response_types: ['code'];
  token_endpoint_auth_method: 'none';
  scope: string;
}

const meta = (d: string) => new RegistrationError('invalid_client_metadata', d);
const redirect = (d: string) => new RegistrationError('invalid_redirect_uri', d);

/** Name containing "AI Budżet" / "AI Budget" / "Budżet", compared case- and diacritic-insensitively. */
export function isLookalikeClientName(name: string): boolean {
  // Both forms: as written (catches the Cyrillic `бюджет`) and with confusables folded to Latin.
  const forms = [normaliseAppName(name), normaliseAppName(name.replace(CONFUSABLE_RE, (c) => CONFUSABLES[c]))];
  return forms.some((n) => LOOKALIKES.some((l) => n.includes(l)));
}

/** An absolute https URL without credentials or fragment. Stored, then shown only as plain, unverified text. */
function httpsUri(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2048 ||
    value.includes('#') ||
    URI_FORBIDDEN.test(value)
  ) {
    throw meta(`${field} must be an https URL`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw meta(`${field} must be an https URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw meta(`${field} must be an https URL`);
  return value;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string') throw meta('client_name is required');
  const name = value.trim();
  if (name.length === 0) throw meta('client_name is required');
  if (name.length > DCR_CLIENT_NAME_MAX) throw meta(`client_name must be at most ${DCR_CLIENT_NAME_MAX} characters`);
  if (hasForbiddenChars(name)) throw meta('client_name must not contain line breaks or control characters');
  if (isLookalikeClientName(name)) throw meta('client_name must not contain the name of this service');
  return name;
}

function parseRedirectUris(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw redirect('redirect_uris must be a non-empty array');
  if (!value.every((v) => typeof v === 'string')) throw redirect('redirect_uris must be strings');
  const uris = [...new Set(value as string[])];
  if (uris.length > MAX_REDIRECT_URIS) throw redirect(`at most ${MAX_REDIRECT_URIS} redirect_uris are allowed`);
  if (!uris.every(isAllowedRedirectUri)) {
    throw redirect('each redirect URI must be https:// or loopback http (localhost, 127.0.0.1, [::1]) without a fragment');
  }
  return uris;
}

function parseGrantTypes(value: unknown): DcrGrantType[] {
  if (value === undefined || value === null) return [...DCR_GRANT_TYPES];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) throw meta('grant_types must be an array of strings');
  const types = [...new Set(value as string[])];
  if (!types.every((t) => (DCR_GRANT_TYPES as readonly string[]).includes(t))) {
    throw meta('grant_types may contain only authorization_code and refresh_token');
  }
  if (!types.includes('authorization_code')) throw meta('grant_types must include authorization_code');
  return types as DcrGrantType[];
}

function parseResponseTypes(value: unknown): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => v === 'code')) {
    throw meta('response_types may contain only code');
  }
}

function parseAuthMethod(value: unknown): void {
  if (value === undefined || value === null) return;
  if (value !== 'none') throw meta('token_endpoint_auth_method must be none (public client)');
}

/** Requested ∩ DCR_ALLOWED_SCOPES, in request order; nothing requested (or nothing allowed) → the five read scopes. */
function parseScopes(value: unknown): PublicScope[] {
  if (value === undefined || value === null || value === '') return [...MCP_DEFAULT_SCOPES];
  if (typeof value !== 'string') throw meta('scope must be a space-separated string');
  const allowed = DCR_ALLOWED_SCOPES as readonly string[];
  const kept = [...new Set(value.split(/\s+/).filter((s) => allowed.includes(s)))] as PublicScope[];
  return kept.length > 0 ? kept : [...MCP_DEFAULT_SCOPES];
}

export function parseRegistrationRequest(body: unknown): RegistrationRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw meta('the request body must be a JSON object');
  const b = body as Record<string, unknown>;
  parseAuthMethod(b.token_endpoint_auth_method);
  parseResponseTypes(b.response_types);
  return {
    clientName: parseName(b.client_name),
    redirectUris: parseRedirectUris(b.redirect_uris),
    clientUri: httpsUri(b.client_uri, 'client_uri'),
    logoUri: httpsUri(b.logo_uri, 'logo_uri'),
    grantTypes: parseGrantTypes(b.grant_types),
    scopes: parseScopes(b.scope),
  };
}
