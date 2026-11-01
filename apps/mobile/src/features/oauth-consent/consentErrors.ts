/**
 * The RFC 6749 `error` code of a failed oauth call; `null` when the body carried none (network, 5xx,
 * the flag-off 404). Only a snake_case code counts: Nest's own error bodies also have an `error`
 * field, holding the status text (`"Not Found"`), which is not an OAuth code.
 */
export function oauthErrorCode(e: unknown): string | null {
  const err = e as { body?: { error?: unknown } } | null | undefined;
  const code = err?.body?.error;
  return typeof code === 'string' && /^[a-z_]+$/.test(code) ? code : null;
}

/** The HTTP status of a failed call, when there was a response at all. */
export function httpStatusOf(e: unknown): number | null {
  const status = (e as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' ? status : null;
}
